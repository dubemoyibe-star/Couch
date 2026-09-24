import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("./email", () => ({ sendEmail }));

import { accountLinking, emailAndPassword, emailVerification, rateLimit } from "./auth";

// Runs Better Auth's real request-reset, reset and sign-in logic with the app's
// actual emailAndPassword config. Only storage and the email transport are replaced.
const EMAIL = "person@example.com";
const PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "a-brand-new-password";
const REDIRECT = "/reset-password";

function makeAuth() {
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
  });
}

type TestAuth = ReturnType<typeof makeAuth>;

// A verified email/password account, so sign-in is allowed.
async function createVerifiedUser(auth: TestAuth) {
  await auth.api.signUpEmail({ body: { email: EMAIL, password: PASSWORD, name: "Ada" } });
  const ctx = await auth.$context;
  await ctx.internalAdapter.updateUserByEmail(EMAIL, { emailVerified: true });
  sendEmail.mockClear();
}

let ipCounter = 0;
function requestReset(auth: TestAuth, email = EMAIL) {
  ipCounter += 1;
  return auth.handler(
    new Request("http://localhost:3000/api/auth/request-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${ipCounter}` },
      body: JSON.stringify({ email, redirectTo: REDIRECT }),
    }),
  );
}

function lastResetUrl(): URL {
  const html = String(sendEmail.mock.calls.at(-1)?.[0].html);
  const href = /href="([^"]+)"/.exec(html)?.[1] ?? "";
  return new URL(href.replace(/&amp;/g, "&"));
}

// Follows the emailed link the way a browser would and returns the token Better Auth hands back.
async function followLink(auth: TestAuth, link: URL): Promise<{ location: string; token: string | null }> {
  const response = await auth.handler(new Request(link, { method: "GET" }));
  const target = new URL(response.headers.get("location") ?? "", "http://localhost:3000");
  return { location: target.pathname + target.search, token: target.searchParams.get("token") };
}

function resetWith(auth: TestAuth, token: string, newPassword = NEW_PASSWORD) {
  return auth.api.resetPassword({ body: { newPassword, token } });
}

beforeEach(() => {
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ ok: true, id: "msg_1" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("request password reset", () => {
  it("emails a registered address a reset link that points at the reset callback", async () => {
    const auth = makeAuth();
    await createVerifiedUser(auth);

    const response = await requestReset(auth);
    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[0]).toMatchObject({ to: EMAIL, subject: "Reset your Couch password" });
    expect(lastResetUrl().pathname).toMatch(/^\/api\/auth\/reset-password\/.+/);
  });

  it("answers an unregistered address exactly like a registered one and sends nothing", async () => {
    const auth = makeAuth();
    await createVerifiedUser(auth);

    const known = await requestReset(auth);
    sendEmail.mockClear();
    const unknown = await requestReset(auth, "nobody@example.com");

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("sendResetPassword hook", () => {
  it("returns without waiting for the send to finish", async () => {
    sendEmail.mockReturnValue(new Promise(() => {})); // never settles
    const done = emailAndPassword.sendResetPassword({
      user: { email: EMAIL, name: "Ada" },
      url: "http://localhost:3000/x",
    });
    const outcome = await Promise.race([done.then(() => "returned"), new Promise((r) => setTimeout(() => r("blocked"), 200))]);
    expect(outcome).toBe("returned");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("reset with token", () => {
  it("redirects the emailed link to the reset page with the token", async () => {
    const auth = makeAuth();
    await createVerifiedUser(auth);
    await requestReset(auth);

    const { location, token } = await followLink(auth, lastResetUrl());
    expect(location.startsWith("/reset-password?token=")).toBe(true);
    expect(token).toBeTruthy();
  });

  it("changes the password: the new one signs in and the old one no longer does", async () => {
    const auth = makeAuth();
    await createVerifiedUser(auth);
    await requestReset(auth);
    const { token } = await followLink(auth, lastResetUrl());

    await resetWith(auth, token ?? "");

    const signedIn = await auth.api.signInEmail({ body: { email: EMAIL, password: NEW_PASSWORD } });
    expect(signedIn.token).toBeTruthy();
    await expect(auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } })).rejects.toMatchObject({
      body: { code: "INVALID_EMAIL_OR_PASSWORD" },
    });
  });

  it("rejects a token that was already used with INVALID_TOKEN", async () => {
    const auth = makeAuth();
    await createVerifiedUser(auth);
    await requestReset(auth);
    const { token } = await followLink(auth, lastResetUrl());
    await resetWith(auth, token ?? "");

    await expect(resetWith(auth, token ?? "", "yet-another-password")).rejects.toMatchObject({
      body: { code: "INVALID_TOKEN" },
    });
  });

  it("rejects an expired token, and the emailed link redirects with error=INVALID_TOKEN", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const auth = makeAuth();
    await createVerifiedUser(auth);
    await requestReset(auth);
    const link = lastResetUrl();
    const { token } = await followLink(auth, link);

    vi.setSystemTime(Date.now() + 61 * 60 * 1000);

    const expired = await followLink(auth, link);
    expect(expired.location).toBe("/reset-password?error=INVALID_TOKEN");
    await expect(resetWith(auth, token ?? "")).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
  });

  it("rejects a made-up token", async () => {
    const auth = makeAuth();
    await expect(resetWith(auth, "not-a-token")).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
  });

  it("keeps Better Auth's own minimum password length", async () => {
    const auth = makeAuth();
    await createVerifiedUser(auth);
    await requestReset(auth);
    const { token } = await followLink(auth, lastResetUrl());

    await expect(resetWith(auth, token ?? "", "short")).rejects.toMatchObject({
      body: { code: "PASSWORD_TOO_SHORT" },
    });
  });
});
