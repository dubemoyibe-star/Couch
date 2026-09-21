import { describe, expect, it } from "vitest";
import {
  assertDatabaseEnv,
  checkDatabaseEnv,
  DatabaseGuardError,
  type DbEnvInput,
  type DbGuardRule,
  type DbPurpose,
} from "./env-guard";

// Obviously fake values. No real host, user or password appears here.
const POOLED = "postgresql://user:pw@ep-fake-1-pooler.example.com/neondb";
const DIRECT = "postgresql://user:pw@ep-fake-1.example.com/neondb";
const POOLED_TESTING = "postgresql://user:pw@ep-fake-1-pooler.example.com/testing";
const DIRECT_TESTING = "postgresql://user:pw@ep-fake-1.example.com/testing";

const dev: DbEnvInput = {
  COUCH_DB_ENV: "dev",
  DATABASE_URL: POOLED,
  DIRECT_URL: DIRECT,
};
const test: DbEnvInput = {
  COUCH_DB_ENV: "test",
  DATABASE_URL: POOLED_TESTING,
  DIRECT_URL: DIRECT_TESTING,
};

function rule(env: DbEnvInput, purpose: DbPurpose): DbGuardRule | "ok" {
  const result = checkDatabaseEnv(env, purpose);
  return result.ok ? "ok" : result.rule;
}

describe("COUCH_DB_ENV value", () => {
  it.each([undefined, "", "production", "Dev", "development", " dev"])(
    "rejects %j for every purpose",
    (value) => {
      for (const purpose of ["destructive", "deploy", "test-suite"] as const) {
        expect(rule({ ...dev, COUCH_DB_ENV: value }, purpose)).toBe("env-name-invalid");
      }
    },
  );

  it("rejects when the variable is absent from the object", () => {
    expect(rule({ DATABASE_URL: POOLED, DIRECT_URL: DIRECT }, "destructive")).toBe(
      "env-name-invalid",
    );
  });
});

describe("purpose versus environment", () => {
  it("blocks destructive operations on prod", () => {
    expect(rule({ ...dev, COUCH_DB_ENV: "prod" }, "destructive")).toBe(
      "env-not-allowed-for-purpose",
    );
  });

  it("allows destructive operations on dev and test", () => {
    expect(rule(dev, "destructive")).toBe("ok");
    expect(rule(test, "destructive")).toBe("ok");
  });

  it("allows deploy on dev, test and prod", () => {
    expect(rule(dev, "deploy")).toBe("ok");
    expect(rule(test, "deploy")).toBe("ok");
    expect(rule({ ...dev, COUCH_DB_ENV: "prod" }, "deploy")).toBe("ok");
  });

  it("allows test suites on test only", () => {
    expect(rule(test, "test-suite")).toBe("ok");
    expect(rule(dev, "test-suite")).toBe("env-not-allowed-for-purpose");
    expect(rule({ ...dev, COUCH_DB_ENV: "prod" }, "test-suite")).toBe(
      "env-not-allowed-for-purpose",
    );
  });

  it("returns the environment name on success", () => {
    expect(checkDatabaseEnv(dev, "destructive")).toEqual({ ok: true, env: "dev" });
    expect(checkDatabaseEnv(test, "test-suite")).toEqual({ ok: true, env: "test" });
  });
});

describe("database name rules", () => {
  it("COUCH_DB_ENV=test with URLs on a database not named testing fails", () => {
    expect(rule({ ...dev, COUCH_DB_ENV: "test" }, "test-suite")).toBe(
      "database-name-not-testing",
    );
    expect(rule({ ...dev, COUCH_DB_ENV: "test" }, "destructive")).toBe(
      "database-name-not-testing",
    );
  });

  it("COUCH_DB_ENV=dev with URLs on the testing database fails", () => {
    expect(rule({ ...test, COUCH_DB_ENV: "dev" }, "destructive")).toBe(
      "database-name-is-testing",
    );
  });

  it("checks DIRECT_URL on its own when DATABASE_URL is correct", () => {
    expect(rule({ ...test, DIRECT_URL: DIRECT }, "destructive")).toBe(
      "database-name-not-testing",
    );
    expect(rule({ ...dev, DIRECT_URL: DIRECT_TESTING }, "destructive")).toBe(
      "database-name-is-testing",
    );
  });

  it("checks DATABASE_URL on its own when DIRECT_URL is correct", () => {
    expect(rule({ ...test, DATABASE_URL: POOLED }, "destructive")).toBe(
      "database-name-not-testing",
    );
    expect(rule({ ...dev, DATABASE_URL: POOLED_TESTING }, "destructive")).toBe(
      "database-name-is-testing",
    );
  });

  it("requires the exact name testing, not a similar one", () => {
    const near = "postgresql://user:pw@ep-fake-1.example.com/testing2";
    expect(
      rule({ ...test, DATABASE_URL: near, DIRECT_URL: near }, "destructive"),
    ).toBe("database-name-not-testing");
    const upper = "postgresql://user:pw@ep-fake-1.example.com/Testing";
    expect(
      rule({ ...test, DATABASE_URL: upper, DIRECT_URL: upper }, "destructive"),
    ).toBe("database-name-not-testing");
  });

  it("applies the not-testing rule to prod deploys", () => {
    expect(rule({ ...test, COUCH_DB_ENV: "prod" }, "deploy")).toBe(
      "database-name-is-testing",
    );
  });
});

describe("endpoint and database consistency", () => {
  it("accepts a -pooler host that matches its direct host", () => {
    expect(rule(dev, "deploy")).toBe("ok");
    expect(rule(test, "deploy")).toBe("ok");
  });

  it("accepts identical hosts (plain Postgres)", () => {
    const env = {
      COUCH_DB_ENV: "test",
      DATABASE_URL: "postgresql://u:p@localhost:5432/testing",
      DIRECT_URL: "postgresql://u:p@localhost:5432/testing",
    };
    expect(rule(env, "test-suite")).toBe("ok");
  });

  it("rejects pooled and direct URLs on different endpoints", () => {
    const other = "postgresql://user:pw@ep-fake-2.example.com/neondb";
    expect(rule({ ...dev, DIRECT_URL: other }, "deploy")).toBe("endpoint-mismatch");
    const otherPooled = "postgresql://user:pw@ep-fake-2-pooler.example.com/neondb";
    expect(rule({ ...dev, DATABASE_URL: otherPooled }, "deploy")).toBe(
      "endpoint-mismatch",
    );
  });

  it("only strips -pooler from the first host label", () => {
    const env = {
      ...dev,
      DATABASE_URL: "postgresql://u:p@ep-fake-1.pooler.example.com/neondb",
    };
    expect(rule(env, "deploy")).toBe("endpoint-mismatch");
    const suffix = {
      ...dev,
      DATABASE_URL: "postgresql://u:p@ep-fake-1.example.com-pooler/neondb",
    };
    expect(rule(suffix, "deploy")).toBe("endpoint-mismatch");
  });

  it("rejects the same endpoint with different database names", () => {
    const env = {
      ...dev,
      DIRECT_URL: "postgresql://user:pw@ep-fake-1.example.com/otherdb",
    };
    expect(rule(env, "deploy")).toBe("database-mismatch");
  });

  it("is enforced for every purpose", () => {
    const mixed = { ...dev, DIRECT_URL: "postgresql://u:p@elsewhere.example.com/neondb" };
    expect(rule(mixed, "destructive")).toBe("endpoint-mismatch");
    expect(rule(mixed, "deploy")).toBe("endpoint-mismatch");
  });
});

describe("URL parsing", () => {
  it("ignores query parameters when reading the database name", () => {
    const env = {
      COUCH_DB_ENV: "test",
      DATABASE_URL: `${POOLED_TESTING}?sslmode=require&channel_binding=require`,
      DIRECT_URL: `${DIRECT_TESTING}?sslmode=require`,
    };
    expect(rule(env, "test-suite")).toBe("ok");
  });

  it("does not let a query parameter pose as the database name", () => {
    const env = {
      ...test,
      DATABASE_URL: "postgresql://u:p@ep-fake-1-pooler.example.com/neondb?options=/testing",
    };
    expect(rule(env, "test-suite")).toBe("database-name-not-testing");
  });

  it("accepts the postgres:// scheme", () => {
    const env = {
      COUCH_DB_ENV: "dev",
      DATABASE_URL: "postgres://u:p@ep-fake-1-pooler.example.com/neondb",
      DIRECT_URL: "postgres://u:p@ep-fake-1.example.com/neondb",
    };
    expect(rule(env, "deploy")).toBe("ok");
  });

  it.each([
    ["not a url", "url-malformed"],
    ["http://ep-fake-1.example.com/neondb", "url-malformed"],
    ["postgresql://", "url-malformed"],
    ["postgresql://u:p@ep-fake-1.example.com/%E0%A4%A", "url-malformed"],
    ["postgresql://u:p@ep-fake-1.example.com", "database-name-missing"],
    ["postgresql://u:p@ep-fake-1.example.com/", "database-name-missing"],
    ["postgresql://u:p@ep-fake-1.example.com/a/b", "database-name-missing"],
  ] as const)("rejects DATABASE_URL %j as %s", (value, expected) => {
    expect(rule({ ...dev, DATABASE_URL: value }, "deploy")).toBe(expected);
  });

  it("rejects a malformed DIRECT_URL", () => {
    expect(rule({ ...dev, DIRECT_URL: "::::" }, "deploy")).toBe("url-malformed");
  });

  it("rejects missing or blank URLs", () => {
    expect(rule({ ...dev, DATABASE_URL: undefined }, "deploy")).toBe("url-missing");
    expect(rule({ ...dev, DIRECT_URL: "  " }, "deploy")).toBe("url-missing");
  });
});

describe("failure messages", () => {
  it("never contain a URL, host, user or password", () => {
    const secretHost = "ep-secret-host.example.com";
    const cases: DbEnvInput[] = [
      { ...dev, DIRECT_URL: `postgresql://alice:hunter2@${secretHost}/neondb` },
      { ...dev, DATABASE_URL: `postgresql://alice:hunter2@${secretHost}/testing` },
      { ...dev, DATABASE_URL: "postgresql://alice:hunter2@" },
      { ...dev, DATABASE_URL: "alice:hunter2@" + secretHost },
      { ...dev, COUCH_DB_ENV: "prod", DATABASE_URL: `postgresql://alice:hunter2@${secretHost}/neondb` },
    ];
    for (const env of cases) {
      const result = checkDatabaseEnv(env, "destructive");
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      for (const leaked of ["hunter2", "alice", secretHost, "postgresql://", "example.com"]) {
        expect(result.message).not.toContain(leaked);
      }
    }
  });
});

describe("assertDatabaseEnv", () => {
  it("returns the environment name when the check passes", () => {
    expect(assertDatabaseEnv(dev, "destructive")).toBe("dev");
  });

  it("throws a DatabaseGuardError carrying the failed rule", () => {
    try {
      assertDatabaseEnv({ ...dev, COUCH_DB_ENV: "prod" }, "destructive");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseGuardError);
      expect((error as DatabaseGuardError).rule).toBe("env-not-allowed-for-purpose");
    }
  });
});
