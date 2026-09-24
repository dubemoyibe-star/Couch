import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("./email", () => ({ sendEmail }));

import { accountLinking, databaseHooks, emailAndPassword, emailVerification, rateLimit } from "./auth";

// Runs Better Auth's real sign-up, verify and Google sign-in logic with the
// app's actual hooks. Only storage, Google's network calls and the email
// transport are replaced.
const EMAIL = "person@example.com";
const PASSWORD = "correct-horse-battery";
const WELCOME_SUBJECT = "Welcome to Couch";

function makeAuth(googleEmailVerified = true) {
  const db: Record<string, Record<string, unknown>[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  };
  return betterAuth({
    database: memoryAdapter(db),
    secret: "test-secret-test-secret-test-secret-1234",
    baseURL: "http://localhost:3000",
    emailAndPassword,
    emailVerification,
    databaseHooks,
    rateLimit,
    account: { accountLinking },
    socialProviders: {
      google: {
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
}

type TestAuth = ReturnType<typeof makeAuth>;

function signUp(auth: TestAuth) {
  return auth.api.signUpEmail({
    body: { email: EMAIL, password: PASSWORD, name: "Ada", callbackURL: "/verify-email?status=verified" },
  });
}

function googleSignIn(auth: TestAuth) {
  return auth.api.signInSocial({ body: { provider: "google", idToken: { token: "fake-id-token" } } });
}

function findUser(auth: TestAuth) {
  return auth.$context.then((ctx) => ctx.internalAdapter.findUserByEmail(EMAIL));
}

const welcomeCalls = () => sendEmail.mock.calls.filter(([message]) => message.subject === WELCOME_SUBJECT);

function verifyLinkOf(callIndex: number): URL {
  const html = String(sendEmail.mock.calls[callIndex]?.[0].html);
  const href = /href="([^"]+)"/.exec(html)?.[1] ?? "";
  return new URL(href.replace(/&amp;/g, "&"));
}

const visit = (auth: TestAuth, link: URL) => auth.handler(new Request(link, { method: "GET" }));

let ipCounter = 0;
function resend(auth: TestAuth) {
  ipCounter += 1;
  return auth.handler(
    new Request("http://localhost:3000/api/auth/send-verification-email", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `192.0.2.${ipCounter}` },
      body: JSON.stringify({ email: EMAIL, callbackURL: "/verify-email?status=verified" }),
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ ok: true, id: "msg_1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("welcome email for an email/password account", () => {
  it("is not sent at sign-up, only the verification email is", async () => {
    const auth = makeAuth();
    await signUp(auth);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[0].subject).toBe("Verify your email for Couch");
    expect(welcomeCalls()).toHaveLength(0);
  });

  it("is sent once, to the account, when the verification link is followed", async () => {
    const auth = makeAuth();
    await signUp(auth);
    await visit(auth, verifyLinkOf(0));

    expect((await findUser(auth))?.user.emailVerified).toBe(true);
    expect(welcomeCalls()).toHaveLength(1);
    const sent = welcomeCalls()[0]?.[0];
    expect(sent).toMatchObject({ to: EMAIL });
    expect(sent.text).toContain("http://localhost:3000/catalog");
    expect(sent.text).toContain("http://localhost:3000/couch/create");
  });

  it("IDEMPOTENCY: re-visiting the same used link, or a second still-valid link, sends no second welcome email", async () => {
    const auth = makeAuth();
    await signUp(auth);
    // A second valid link exists because the visitor asked for a resend before verifying.
    await resend(auth);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const linkA = verifyLinkOf(0);
    const linkB = verifyLinkOf(1);

    await visit(auth, linkA);
    expect(welcomeCalls()).toHaveLength(1);

    const sameAgain = await visit(auth, linkA);
    expect(sameAgain.headers.get("location")).toBe("/verify-email?status=verified");
    const otherLink = await visit(auth, linkB);
    expect(otherLink.headers.get("set-cookie")).toBeNull();

    expect(welcomeCalls()).toHaveLength(1);
  });

  it("is not sent for an expired or tampered link", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const auth = makeAuth();
    await signUp(auth);
    const link = verifyLinkOf(0);

    await visit(auth, new URL("http://localhost:3000/api/auth/verify-email?token=not-a-token&callbackURL=%2Fverify-email"));
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    await visit(auth, link);

    expect((await findUser(auth))?.user.emailVerified).toBe(false);
    expect(welcomeCalls()).toHaveLength(0);
  });
});

describe("welcome email for a Google sign-up", () => {
  it("is sent once for a new Google account, which is created already verified, with no verification email", async () => {
    const auth = makeAuth(true);
    await googleSignIn(auth);

    expect((await findUser(auth))?.user.emailVerified).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(welcomeCalls()).toHaveLength(1);
    expect(welcomeCalls()[0]?.[0]).toMatchObject({ to: EMAIL });
  });

  it("is not sent again when the same Google user signs in later", async () => {
    const auth = makeAuth(true);
    await googleSignIn(auth);
    await googleSignIn(auth);
    await googleSignIn(auth);

    expect(welcomeCalls()).toHaveLength(1);
  });

  it("is not sent when Google does not vouch for the email, since the account is not verified", async () => {
    const auth = makeAuth(false);
    await googleSignIn(auth);

    expect((await findUser(auth))?.user.emailVerified).toBe(false);
    expect(welcomeCalls()).toHaveLength(0);
  });

  it("is not sent for a Google sign-in that hits an existing unverified email/password account", async () => {
    const auth = makeAuth(true);
    await signUp(auth);
    sendEmail.mockClear();

    await googleSignIn(auth).catch(() => undefined);

    expect((await findUser(auth))?.user.emailVerified).toBe(false);
    expect(welcomeCalls()).toHaveLength(0);
  });

  it("is not sent again when a verified email/password user later signs in with Google", async () => {
    const auth = makeAuth(true);
    await signUp(auth);
    await visit(auth, verifyLinkOf(0));
    expect(welcomeCalls()).toHaveLength(1);

    await googleSignIn(auth);

    expect(welcomeCalls()).toHaveLength(1);
  });
});

describe("welcome email hooks", () => {
  it("afterEmailVerification returns without waiting for the send to finish", async () => {
    sendEmail.mockReturnValue(new Promise(() => {})); // never settles
    const done = emailVerification.afterEmailVerification({ email: EMAIL, name: "Ada" });
    const outcome = await Promise.race([done.then(() => "returned"), new Promise((r) => setTimeout(() => r("blocked"), 200))]);
    expect(outcome).toBe("returned");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does not throw if the base URL is not configured, so sign-up and verification still succeed", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(emailVerification.afterEmailVerification({ email: EMAIL, name: "Ada" })).resolves.toBeUndefined();
    await expect(
      databaseHooks.user.create.after({ email: EMAIL, name: "Ada", emailVerified: true }),
    ).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
