import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { AUTH_COOKIE_PREFIX, AUTH_SESSION_SETTINGS, createAuthCoreOptions } from "./auth-core";

const ENV = { BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234", BETTER_AUTH_URL: "http://localhost:3000/" };

function memoryDb() {
  const db: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [], verification: [] };
  return memoryAdapter(db);
}

describe("createAuthCoreOptions", () => {
  it("refuses to build without a secret, instead of using a library default", () => {
    expect(() => createAuthCoreOptions({ env: { BETTER_AUTH_URL: ENV.BETTER_AUTH_URL }, database: memoryDb() })).toThrow(
      "BETTER_AUTH_SECRET is not set",
    );
  });

  it("refuses to build without a base URL", () => {
    expect(() =>
      createAuthCoreOptions({ env: { BETTER_AUTH_SECRET: ENV.BETTER_AUTH_SECRET }, database: memoryDb() }),
    ).toThrow("BETTER_AUTH_URL is not set");
  });

  it("normalizes the base URL and trusts only its origin", () => {
    const core = createAuthCoreOptions({ env: ENV, database: memoryDb() });
    expect(core.baseURL).toBe("http://localhost:3000");
    expect(core.trustedOrigins).toEqual(["http://localhost:3000"]);
  });

  it("pins session and cookie settings", () => {
    const core = createAuthCoreOptions({ env: ENV, database: memoryDb() });
    expect(core.session).toBe(AUTH_SESSION_SETTINGS);
    expect(core.advanced.cookiePrefix).toBe(AUTH_COOKIE_PREFIX);
  });

  it("contains no provider-specific configuration", () => {
    const core = createAuthCoreOptions({ env: ENV, database: memoryDb() });
    for (const key of ["socialProviders", "emailAndPassword", "emailVerification", "databaseHooks", "plugins"]) {
      expect(core).not.toHaveProperty(key);
    }
  });

  it("lets a session issued by one instance be validated by another built from the same core", async () => {
    const database = memoryDb();
    const issuer = betterAuth({ ...createAuthCoreOptions({ env: ENV, database }), emailAndPassword: { enabled: true } });
    const validator = betterAuth(createAuthCoreOptions({ env: ENV, database }));

    const { headers } = await issuer.api.signUpEmail({
      body: { email: "a@example.com", password: "password-1234", name: "A" },
      returnHeaders: true,
    });
    const cookie = headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

    const session = await validator.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.email).toBe("a@example.com");
    expect(session?.user.name).toBe("A");
    expect(await validator.api.getSession({ headers: new Headers() })).toBeNull();
  });
});
