import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("./email", () => ({ sendEmail }));

import { accountLinking, emailAndPassword, emailVerification, rateLimit } from "./auth";

// Runs Better Auth's real sign-up, sign-in, verify and rate-limit logic with the
// app's actual emailAndPassword, emailVerification and rateLimit config. Only
// storage (memory), Google's network calls and the email transport are replaced.
const EMAIL = "person@example.com";
const PASSWORD = "correct-horse-battery";

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

function findUser(auth: TestAuth) {
  return auth.$context.then((ctx) => ctx.internalAdapter.findUserByEmail(EMAIL));
}

function signUp(auth: TestAuth) {
  return auth.api.signUpEmail({ body: { email: EMAIL, password: PASSWORD, name: "Ada", callbackURL: "/verify-email?status=verified" } });
}

function lastVerifyUrl(): URL {
  const html = String(sendEmail.mock.calls.at(-1)?.[0].html);
  const href = /href="([^"]+)"/.exec(html)?.[1] ?? "";
  return new URL(href.replace(/&amp;/g, "&"));
}

beforeEach(() => {
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ ok: true, id: "msg_1" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("email verification", () => {
  it("sends a verification email on sign-up and creates no session", async () => {
    const auth = makeAuth();
    const result = await signUp(auth);

    expect(result.token).toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[0]).toMatchObject({ to: EMAIL, subject: "Verify your email for Couch" });
    expect(lastVerifyUrl().pathname).toBe("/api/auth/verify-email");
    expect((await findUser(auth))?.user.emailVerified).toBe(false);
  });

  it("refuses to sign in an unverified account with 403 EMAIL_NOT_VERIFIED", async () => {
    const auth = makeAuth();
    await signUp(auth);
    sendEmail.mockClear();

    await expect(auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } })).rejects.toMatchObject({
      statusCode: 403,
      body: { code: "EMAIL_NOT_VERIFIED" },
    });
    // A sign-in attempt must not send email: the resend action is the only trigger.
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not reveal whether an unverified account exists: wrong password is the usual error", async () => {
    const auth = makeAuth();
    await signUp(auth);
    await expect(auth.api.signInEmail({ body: { email: EMAIL, password: "wrong-password-x" } })).rejects.toMatchObject({
      body: { code: "INVALID_EMAIL_OR_PASSWORD" },
    });
  });

  it("verifies through the emailed link, then sign-in works", async () => {
    const auth = makeAuth();
    await signUp(auth);
    const link = lastVerifyUrl();

    const response = await auth.handler(new Request(link, { method: "GET" }));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/verify-email?status=verified");
    expect(response.headers.get("set-cookie")).toContain("session_token");
    expect((await findUser(auth))?.user.emailVerified).toBe(true);

    const signedIn = await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } });
    expect(signedIn.token).toBeTruthy();
  });

  it("redirects an expired link to the callback with error=TOKEN_EXPIRED", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const auth = makeAuth();
    await signUp(auth);
    const link = lastVerifyUrl();

    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    const response = await auth.handler(new Request(link, { method: "GET" }));
    expect(response.headers.get("location")).toBe("/verify-email?status=verified&error=TOKEN_EXPIRED");
    expect((await findUser(auth))?.user.emailVerified).toBe(false);
  });

  it("redirects a tampered link with error=INVALID_TOKEN", async () => {
    const auth = makeAuth();
    const link = new URL("http://localhost:3000/api/auth/verify-email?token=not-a-token&callbackURL=%2Fverify-email%3Fstatus%3Dverified");
    const response = await auth.handler(new Request(link, { method: "GET" }));
    expect(response.headers.get("location")).toBe("/verify-email?status=verified&error=INVALID_TOKEN");
  });

  it("treats an already-used link as success without a session", async () => {
    const auth = makeAuth();
    await signUp(auth);
    const link = lastVerifyUrl();
    await auth.handler(new Request(link, { method: "GET" }));

    const again = await auth.handler(new Request(link, { method: "GET" }));
    expect(again.headers.get("location")).toBe("/verify-email?status=verified");
    expect(again.headers.get("set-cookie")).toBeNull();
  });
});

describe("sendVerificationEmail hook", () => {
  it("returns without waiting for the send to finish", async () => {
    sendEmail.mockReturnValue(new Promise(() => {})); // never settles
    const done = emailVerification.sendVerificationEmail({
      user: { email: EMAIL, name: "Ada" },
      url: "http://localhost:3000/x",
    });
    const outcome = await Promise.race([done.then(() => "returned"), new Promise((r) => setTimeout(() => r("blocked"), 200))]);
    expect(outcome).toBe("returned");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("Google sign-in is not blocked by requireEmailVerification", () => {
  it("requires verification for email/password in this config", () => {
    expect(emailAndPassword.requireEmailVerification).toBe(true);
  });

  const googleSignIn = (auth: TestAuth) =>
    auth.api.signInSocial({ body: { provider: "google", idToken: { token: "fake-id-token" } } });

  it("signs a new Google user in with a session, emailVerified true, and sends no email", async () => {
    const auth = makeAuth(true);
    const result = await googleSignIn(auth);

    expect(result).toMatchObject({ redirect: false });
    expect("token" in result && result.token).toBeTruthy();
    expect((await findUser(auth))?.user.emailVerified).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still signs a Google user in when Google does not vouch for the email", async () => {
    const auth = makeAuth(false);
    const result = await googleSignIn(auth);

    expect("token" in result && result.token).toBeTruthy();
  });
});

describe("resend endpoint abuse guard", () => {
  // Better Auth's in-memory limiter is shared by the process and keyed by client
  // IP, so each test uses its own address to start with an empty count.
  const resend = (auth: TestAuth, ip: string, email = EMAIL) =>
    auth.handler(
      new Request("http://localhost:3000/api/auth/send-verification-email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email, callbackURL: "/verify-email?status=verified" }),
      }),
    );

  it("emails an unverified account, and answers identically for an unknown address", async () => {
    const auth = makeAuth();
    await signUp(auth);
    sendEmail.mockClear();

    const known = await resend(auth, "203.0.113.10");
    const unknown = await resend(auth, "203.0.113.10", "nobody@example.com");
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("returns 429 after 3 requests within a minute from one client", async () => {
    const auth = makeAuth();
    await signUp(auth);

    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await resend(auth, "203.0.113.20")).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});
