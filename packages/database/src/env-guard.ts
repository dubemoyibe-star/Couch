// Pure guard for database commands and test suites. It takes the environment
// as input and does no I/O, so it is testable without a database. Failures
// name the rule that failed and the variable involved, never a URL, host,
// database name or password.

export type DbEnvName = "dev" | "test" | "prod";

// What the caller is about to do:
// - "destructive": can delete or rewrite data (reset, migrate dev, db push).
//   Allowed on dev and test only.
// - "deploy": applies existing migrations. Allowed on dev, test and prod.
// - "test-suite": a test run that touches the database. Test only.
export type DbPurpose = "destructive" | "deploy" | "test-suite";

export type DbEnvInput = {
  readonly COUCH_DB_ENV?: string | undefined;
  readonly DATABASE_URL?: string | undefined;
  readonly DIRECT_URL?: string | undefined;
};

export type DbGuardRule =
  | "env-name-invalid"
  | "env-not-allowed-for-purpose"
  | "url-missing"
  | "url-malformed"
  | "database-name-missing"
  | "endpoint-mismatch"
  | "database-mismatch"
  | "database-name-not-testing"
  | "database-name-is-testing";

export type DbGuardResult =
  | { readonly ok: true; readonly env: DbEnvName }
  | { readonly ok: false; readonly rule: DbGuardRule; readonly message: string };

const TEST_DATABASE_NAME = "testing";

const ALLOWED_ENVS: Readonly<Record<DbPurpose, readonly DbEnvName[]>> = {
  destructive: ["dev", "test"],
  deploy: ["dev", "test", "prod"],
  "test-suite": ["test"],
};

type ParsedUrl = { readonly endpoint: string; readonly database: string };

function fail(rule: DbGuardRule, message: string): DbGuardResult {
  return { ok: false, rule, message };
}

function isDbEnvName(value: string | undefined): value is DbEnvName {
  return value === "dev" || value === "test" || value === "prod";
}

// Neon pooled hosts carry a "-pooler" suffix on the first label. Removing it
// lets the pooled and direct URLs of one endpoint compare equal.
function normalizeHost(hostname: string): string {
  const [first = "", ...rest] = hostname.split(".");
  const label = first.endsWith("-pooler") ? first.slice(0, -"-pooler".length) : first;
  return [label, ...rest].join(".");
}

function parseUrl(
  name: "DATABASE_URL" | "DIRECT_URL",
  value: string | undefined,
): ParsedUrl | DbGuardResult {
  if (value === undefined || value.trim() === "") {
    return fail("url-missing", `${name} is not set.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail("url-malformed", `${name} is not a valid URL.`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    return fail("url-malformed", `${name} is not a postgres URL.`);
  }
  if (url.hostname === "") {
    return fail("url-malformed", `${name} has no host.`);
  }
  let database: string;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return fail("url-malformed", `${name} has a malformed database name.`);
  }
  if (database === "" || database.includes("/")) {
    return fail("database-name-missing", `${name} does not name a database.`);
  }
  return { endpoint: normalizeHost(url.hostname), database };
}

function isFailure(value: ParsedUrl | DbGuardResult): value is DbGuardResult {
  return "ok" in value;
}

export function checkDatabaseEnv(env: DbEnvInput, purpose: DbPurpose): DbGuardResult {
  const name = env.COUCH_DB_ENV;
  if (!isDbEnvName(name)) {
    return fail(
      "env-name-invalid",
      "COUCH_DB_ENV must be exactly one of: dev, test, prod.",
    );
  }
  if (!ALLOWED_ENVS[purpose].includes(name)) {
    return fail(
      "env-not-allowed-for-purpose",
      `A ${purpose} operation is not allowed when COUCH_DB_ENV is ${name}. Allowed: ${ALLOWED_ENVS[purpose].join(", ")}.`,
    );
  }

  const pooled = parseUrl("DATABASE_URL", env.DATABASE_URL);
  if (isFailure(pooled)) return pooled;
  const direct = parseUrl("DIRECT_URL", env.DIRECT_URL);
  if (isFailure(direct)) return direct;

  // Name rules first: they are the check that does not depend on the URLs
  // agreeing with each other.
  const urls = [
    ["DATABASE_URL", pooled],
    ["DIRECT_URL", direct],
  ] as const;
  for (const [variable, parsed] of urls) {
    const isTesting = parsed.database === TEST_DATABASE_NAME;
    if (name === "test" && !isTesting) {
      return fail(
        "database-name-not-testing",
        `COUCH_DB_ENV is test, but ${variable} does not point at the database named "${TEST_DATABASE_NAME}".`,
      );
    }
    if (name !== "test" && isTesting) {
      return fail(
        "database-name-is-testing",
        `COUCH_DB_ENV is ${name}, but ${variable} points at the database named "${TEST_DATABASE_NAME}".`,
      );
    }
  }

  if (pooled.endpoint !== direct.endpoint) {
    return fail(
      "endpoint-mismatch",
      "DATABASE_URL and DIRECT_URL point at different hosts.",
    );
  }
  if (pooled.database !== direct.database) {
    return fail(
      "database-mismatch",
      "DATABASE_URL and DIRECT_URL point at different databases.",
    );
  }

  return { ok: true, env: name };
}

export class DatabaseGuardError extends Error {
  readonly rule: DbGuardRule;

  constructor(rule: DbGuardRule, message: string) {
    super(message);
    this.name = "DatabaseGuardError";
    this.rule = rule;
  }
}

export function assertDatabaseEnv(env: DbEnvInput, purpose: DbPurpose): DbEnvName {
  const result = checkDatabaseEnv(env, purpose);
  if (!result.ok) throw new DatabaseGuardError(result.rule, result.message);
  return result.env;
}
