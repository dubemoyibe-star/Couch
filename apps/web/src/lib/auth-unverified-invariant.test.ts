import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { accountLinking, emailAndPassword, googleProviderSettings } from "./auth";

// An unverified user must never hold a session, on any sign-in path. Sessions
// are what let a user create or join a couch, so this is what guarantees an
// unverified row owns nothing. These tests run Better Auth's real sign-up,
// sign-in and OAuth code with the app's actual emailAndPassword, accountLinking
// and Google provider settings. Only storage (memory) and Google's network
// calls are replaced.
const EMAIL = "person@example.com";

type Rows = Record<string, Record<string, unknown>[]>;

function makeAuth(googleEmailVerified: boolean) {
  const db: Rows = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    database: memoryAdapter(db),
    secret: "test-secret-test-secret-test-secret-1234",
    baseURL: "http://localhost:3000",
    emailAndPassword,
    emailVerification: { sendOnSignUp: true, sendVerificationEmail: async () => {} },
    account: { accountLinking },
    socialProviders: {
      google: {
        ...googleProviderSettings,
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        verifyIdToken: async () => true,
        getUserInfo: async () => ({
          user: { email: EMAIL, name: "Google Person", emailVerified: googleEmailVerified },
          data: { sub: "google-sub-1" } as never,
        }),
      },
    },
  });
  return { auth, db };
}

function googleSignIn(auth: ReturnType<typeof makeAuth>["auth"]) {
  return auth.api.signInSocial({ body: { provider: "google", idToken: { token: "fake-id-token" } } });
}

// The rule itself: no session row may belong to a user whose emailVerified is false.
function sessionsOfUnverifiedUsers(db: Rows) {
  const unverifiedIds = new Set(db.user.filter((u) => u.emailVerified !== true).map((u) => u.id));
  return db.session.filter((s) => unverifiedIds.has(s.userId));
}

describe("an unverified user never has a session", () => {
  it("password sign-up creates an unverified user and no session", async () => {
    const { auth, db } = makeAuth(true);
    await auth.api.signUpEmail({ body: { email: EMAIL, password: "correct-horse-battery", name: "Person" } });

    expect(db.user).toHaveLength(1);
    expect(db.user[0]?.emailVerified).toBe(false);
    expect(db.session).toHaveLength(0);
  });

  it("password sign-in is refused for an unverified user and creates no session", async () => {
    const { auth, db } = makeAuth(true);
    await auth.api.signUpEmail({ body: { email: EMAIL, password: "correct-horse-battery", name: "Person" } });

    await expect(
      auth.api.signInEmail({ body: { email: EMAIL, password: "correct-horse-battery" } }),
    ).rejects.toMatchObject({ body: { code: "EMAIL_NOT_VERIFIED" } });
    expect(sessionsOfUnverifiedUsers(db)).toHaveLength(0);
    expect(db.session).toHaveLength(0);
  });

  it("Google sign-in for a new email Google does not vouch for creates no session", async () => {
    const { auth, db } = makeAuth(false);
    await googleSignIn(auth).catch(() => undefined);

    expect(db.user).toHaveLength(1);
    expect(db.user[0]?.emailVerified).toBe(false);
    expect(sessionsOfUnverifiedUsers(db)).toHaveLength(0);
    expect(db.session).toHaveLength(0);
  });

  it("Google sign-in for a new email Google vouches for creates a verified user with a session", async () => {
    const { auth, db } = makeAuth(true);
    await googleSignIn(auth);

    expect(db.user[0]?.emailVerified).toBe(true);
    expect(db.session).toHaveLength(1);
    expect(sessionsOfUnverifiedUsers(db)).toHaveLength(0);
  });

  it("requires verification on the Google provider itself, not only on email/password", () => {
    expect(googleProviderSettings.requireEmailVerification).toBe(true);
    expect(emailAndPassword.requireEmailVerification).toBe(true);
  });
});
