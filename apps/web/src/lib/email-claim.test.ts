import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it, vi } from "vitest";
import { accountLinking, emailAndPassword, googleProviderSettings } from "./auth";
import { withEmailClaim, type ReleaseUnverifiedEmail } from "./email-claim";

// Runs Better Auth's real Google sign-in with the app's actual accountLinking
// and Google settings and the real withEmailClaim wrapper. Only storage
// (memory) and Google's network calls are replaced. The database rule that
// decides whether a row may be deleted is tested against a real database in
// packages/database/src/unverified-user.db.test.ts; here the release function
// is a stand-in that follows the same contract, so these tests check what the
// sign-in does with each outcome.
const EMAIL = "person@example.com";

type Rows = Record<string, Record<string, unknown>[]>;

function makeHarness(options: { googleEmailVerified?: boolean } = {}) {
  const db: Rows = { user: [], session: [], account: [], verification: [] };
  // Users standing in for "has a couch, a membership or a session".
  const usersWithData = new Set<string>();
  const release = vi.fn<ReleaseUnverifiedEmail>(async (email) => {
    const user = db.user.find((u) => u.email === email.toLowerCase());
    if (!user) return { ok: false, reason: "not_found" };
    if (user.emailVerified === true) return { ok: false, reason: "verified" };
    if (usersWithData.has(user.id as string)) return { ok: false, reason: "has_data" };
    db.account = db.account.filter((a) => a.userId !== user.id);
    db.user = db.user.filter((u) => u.id !== user.id);
    return { ok: true };
  });

  let failNextUserCreate = false;
  const auth = betterAuth({
    database: memoryAdapter(db),
    secret: "test-secret-test-secret-test-secret-1234",
    baseURL: "http://localhost:3000",
    emailAndPassword,
    emailVerification: { sendOnSignUp: true, sendVerificationEmail: async () => {} },
    account: { accountLinking },
    databaseHooks: {
      user: {
        create: {
          before: async () => {
            if (!failNextUserCreate) return;
            failNextUserCreate = false;
            throw new Error("simulated user creation failure");
          },
        },
      },
    },
    socialProviders: {
      google: {
        ...googleProviderSettings,
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        verifyIdToken: async () => true,
        getUserInfo: withEmailClaim(
          async () => ({
            user: { email: EMAIL, name: "Google Person", emailVerified: options.googleEmailVerified ?? true },
            data: { sub: "google-sub-1" } as never,
          }),
          release,
        ),
      },
    },
  });
  // Makes the next user creation fail, after the account under test is seeded.
  const failNextCreate = () => {
    failNextUserCreate = true;
  };
  return { auth, db, release, usersWithData, failNextCreate };
}

type Harness = ReturnType<typeof makeHarness>;

async function signUpUnverified(h: Harness) {
  await h.auth.api.signUpEmail({ body: { email: EMAIL, password: "correct-horse-battery", name: "Squatter" } });
  return h.db.user.find((u) => u.email === EMAIL)!;
}

function googleSignIn(h: Harness) {
  return h.auth.api.signInSocial({ body: { provider: "google", idToken: { token: "fake-id-token" } } });
}

const usersFor = (h: Harness) => h.db.user.filter((u) => u.email === EMAIL);
const providersOf = (h: Harness, userId: unknown) =>
  h.db.account.filter((a) => a.userId === userId).map((a) => a.providerId);

describe("Google sign-in for an email held by an unverified account", () => {
  it("replaces the unverified account with a Google-linked one", async () => {
    const h = makeHarness();
    const squatter = await signUpUnverified(h);

    await googleSignIn(h);

    const users = usersFor(h);
    expect(users).toHaveLength(1);
    expect(users[0]?.id).not.toBe(squatter.id);
    expect(users[0]?.emailVerified).toBe(true);
    expect(providersOf(h, users[0]?.id)).toEqual(["google"]);
    expect(providersOf(h, squatter.id)).toEqual([]);
    expect(h.db.session.filter((s) => s.userId === users[0]?.id)).toHaveLength(1);
    expect(h.release).toHaveBeenCalledTimes(1);
  });

  it("is unreachable when Google does not vouch for the email", async () => {
    const h = makeHarness({ googleEmailVerified: false });
    const squatter = await signUpUnverified(h);

    await expect(googleSignIn(h)).rejects.toMatchObject({ body: { message: "account not linked" } });

    expect(h.release).not.toHaveBeenCalled();
    expect(usersFor(h).map((u) => u.id)).toEqual([squatter.id]);
    expect(providersOf(h, squatter.id)).toEqual(["credential"]);
  });

  it("does not delete an account that has data, and the linking gate still refuses it", async () => {
    const h = makeHarness();
    const squatter = await signUpUnverified(h);
    // Stands in for a couch, membership or session on the row.
    h.usersWithData.add(squatter.id as string);

    await expect(googleSignIn(h)).rejects.toMatchObject({ body: { message: "account not linked" } });

    expect(h.release).toHaveBeenCalledTimes(1);
    expect(usersFor(h).map((u) => u.id)).toEqual([squatter.id]);
    expect(providersOf(h, squatter.id)).toEqual(["credential"]);
    expect(h.db.session).toHaveLength(0);
  });

  it("does not delete a verified account: it is linked to, as before", async () => {
    const h = makeHarness();
    const owner = await signUpUnverified(h);
    const ctx = await h.auth.$context;
    await ctx.internalAdapter.updateUser(owner.id as string, { emailVerified: true });

    await googleSignIn(h);

    expect(usersFor(h).map((u) => u.id)).toEqual([owner.id]);
    expect(providersOf(h, owner.id).sort()).toEqual(["credential", "google"]);
  });

  it("creates a normal Google account when nothing holds the email", async () => {
    const h = makeHarness();

    await googleSignIn(h);

    expect(usersFor(h)).toHaveLength(1);
    expect(usersFor(h)[0]?.emailVerified).toBe(true);
    expect(h.release).toHaveBeenCalledTimes(1);
  });

  it("leaves the email free when creating the replacement fails, so a retry succeeds", async () => {
    const h = makeHarness();
    const squatter = await signUpUnverified(h);
    h.failNextCreate();

    await expect(googleSignIn(h)).rejects.toMatchObject({ body: { message: "unable to create user" } });

    // The unverified row was deleted, but no replacement exists yet.
    expect(usersFor(h)).toHaveLength(0);
    expect(providersOf(h, squatter.id)).toEqual([]);
    expect(h.db.session).toHaveLength(0);

    // The email is free, so the same sign-in goes through cleanly.
    await googleSignIn(h);

    const users = usersFor(h);
    expect(users).toHaveLength(1);
    expect(users[0]?.emailVerified).toBe(true);
    expect(providersOf(h, users[0]?.id)).toEqual(["google"]);
    expect(h.db.session.filter((s) => s.userId === users[0]?.id)).toHaveLength(1);
  });

  it("keeps the implicit linking gate strict", () => {
    expect(accountLinking.requireLocalEmailVerified).toBe(true);
    expect("trustedProviders" in accountLinking).toBe(false);
  });
});
