import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { accountLinking } from "./auth";

// Exercises Better Auth's real OAuth linking logic with the app's actual
// accountLinking config. Only the storage (memory) and Google's network calls
// (verifyIdToken, getUserInfo) are replaced, so no database or Google is needed.
const EMAIL = "person@example.com";

function makeAuth(googleEmailVerified: boolean) {
  const db: Record<string, Record<string, unknown>[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
  };
  return betterAuth({
    database: memoryAdapter(db),
    secret: "test-secret-test-secret-test-secret-1234",
    baseURL: "http://localhost:3000",
    emailAndPassword: { enabled: true },
    account: { accountLinking },
    socialProviders: {
      google: {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        verifyIdToken: async () => true,
        getUserInfo: async () => ({
          user: {
            email: EMAIL,
            name: "Google Person",
            emailVerified: googleEmailVerified,
          },
          // Better Auth derives the provider account id from the profile's sub.
          // Only the field the linking logic reads is supplied, so the full
          // GoogleProfile type (not exported) is bypassed with a cast.
          data: { sub: "google-sub-1" } as never,
        }),
      },
    },
  });
}

async function googleSignIn(auth: ReturnType<typeof makeAuth>) {
  return auth.api.signInSocial({
    body: { provider: "google", idToken: { token: "fake-id-token" } },
  });
}

function findUser(auth: ReturnType<typeof makeAuth>) {
  return auth.$context.then((ctx) => ctx.internalAdapter.findUserByEmail(EMAIL, { includeAccounts: true }));
}

describe("Google account linking", () => {
  it("creates a new account with emailVerified true when Google vouches for the email", async () => {
    const auth = makeAuth(true);
    await googleSignIn(auth);

    const found = await findUser(auth);
    expect(found?.user.emailVerified).toBe(true);
    expect(found?.accounts.map((a) => a.providerId)).toEqual(["google"]);
  });

  it("does NOT link Google to an existing UNVERIFIED email/password account", async () => {
    const auth = makeAuth(true);
    await auth.api.signUpEmail({
      body: { email: EMAIL, password: "correct-horse-battery", name: "Attacker" },
    });
    expect((await findUser(auth))?.user.emailVerified).toBe(false);

    await expect(googleSignIn(auth)).rejects.toMatchObject({ body: { message: "account not linked" } });

    const found = await findUser(auth);
    expect(found?.accounts.map((a) => a.providerId)).toEqual(["credential"]);
    expect(found?.user.emailVerified).toBe(false);
  });

  it("links Google to an existing VERIFIED email/password account", async () => {
    const auth = makeAuth(true);
    await auth.api.signUpEmail({
      body: { email: EMAIL, password: "correct-horse-battery", name: "Owner" },
    });
    const ctx = await auth.$context;
    const existing = await ctx.internalAdapter.findUserByEmail(EMAIL);
    await ctx.internalAdapter.updateUser(existing!.user.id, { emailVerified: true });

    await googleSignIn(auth);

    const found = await findUser(auth);
    expect(found?.user.id).toBe(existing!.user.id);
    expect(found?.accounts.map((a) => a.providerId).sort()).toEqual(["credential", "google"]);
  });

  it("does not link when Google itself does not vouch for the email, even if the local account is verified", async () => {
    const auth = makeAuth(false);
    await auth.api.signUpEmail({
      body: { email: EMAIL, password: "correct-horse-battery", name: "Owner" },
    });
    const ctx = await auth.$context;
    const existing = await ctx.internalAdapter.findUserByEmail(EMAIL);
    await ctx.internalAdapter.updateUser(existing!.user.id, { emailVerified: true });

    await expect(googleSignIn(auth)).rejects.toMatchObject({ body: { message: "account not linked" } });
    expect((await findUser(auth))?.accounts.map((a) => a.providerId)).toEqual(["credential"]);
  });
});
