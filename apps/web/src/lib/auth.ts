import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { getPrismaClient } from "@couch/database";
import { runInBackground } from "./background";
import { getBaseUrl } from "./base-url";
import { sendEmail } from "./email";
import { passwordChangedEmail, resetPasswordEmail, verificationEmail } from "./email-templates";

// Built lazily, and only on first use, the same way @couch/database's own
// getPrismaClient() defers its DATABASE_URL read. betterAuth() calls
// getPrismaClient() eagerly at construction, so building this at module
// scope would require DATABASE_URL just to import this module: Next's build
// step (page data collection) imports every route's module graph, including
// this one, without a live database. Cached on globalThis for the same
// hot-reload reason getPrismaClient() is.
const globalForAuth = globalThis as typeof globalThis & {
  couchAuth?: ReturnType<typeof buildAuth>;
};

// a Google sign-in may link to an existing account with the same
// email only when that existing account's email is already verified.
// Better Auth's implicit linking (link-account.ts) refuses the link unless
// (Google vouches for the email, or Google is in trustedProviders) AND, when
// requireLocalEmailVerified is true, the existing user's emailVerified is
// true. trustedProviders is deliberately left unset: it would bypass the
// provider check, and Google-side trust is not what protects the victim here.
// requireLocalEmailVerified is the guard against an attacker pre-registering
// a victim's email with a password, then having the victim's Google identity
// merged into an account the attacker controls. It defaults to true; it is
// spelled out so it cannot be weakened by a default change.
export const accountLinking = {
  enabled: true,
  requireLocalEmailVerified: true,
} as const;

const VERIFICATION_LINK_TTL_SECONDS = 60 * 60;

// Email/password sign-in is refused until the address is verified. This only
// gates the credential sign-in path: a Google sign-in creates the user with
// emailVerified already set by Google and never goes through this check.
const RESET_PASSWORD_TTL_SECONDS = 60 * 60;

export const emailAndPassword = {
  enabled: true,
  requireEmailVerification: true,
  resetPasswordTokenExpiresIn: RESET_PASSWORD_TTL_SECONDS,
  // Not awaited, for the same reason as sendVerificationEmail: the response
  // must not reveal whether the address has an account.
  async sendResetPassword({ user, url }: { user: { email: string; name: string }; url: string }) {
    const message = resetPasswordEmail({
      name: user.name,
      url,
      expiresInMinutes: RESET_PASSWORD_TTL_SECONDS / 60,
    });
    runInBackground(sendEmail({ to: user.email, ...message }));
  },
  // Fires after a reset-with-token has changed the password, so it only runs
  // on a real change (a rejected or reused token never reaches it). The email
  // is informational and carries no reset link, only the /forgot-password page
  // address. Not awaited, and a failure to build it must not turn a completed
  // password change into an error response.
  async onPasswordReset({ user }: { user: { email: string; name: string } }) {
    try {
      const message = passwordChangedEmail({
        name: user.name,
        forgotPasswordUrl: `${getBaseUrl()}/forgot-password`,
      });
      runInBackground(sendEmail({ to: user.email, ...message }));
    } catch (err) {
      console.error(`[email] password-changed email not sent: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  },
} as const;

export const emailVerification = {
  // sendOnSignIn is deliberately left off: a sign-in attempt goes through a
  // Server Action, which Better Auth's rate limiter does not see, so it would
  // be an unthrottled way to trigger emails. Resending is an explicit action
  // that calls the rate-limited HTTP endpoint instead.
  sendOnSignUp: true,
  autoSignInAfterVerification: true,
  expiresIn: VERIFICATION_LINK_TTL_SECONDS,
  // Not awaited, so the response time does not depend on whether the send
  // happens (timing-attack mitigation). runInBackground keeps the send alive
  // after the response where the host needs that.
  async sendVerificationEmail({ user, url }: { user: { email: string; name: string }; url: string }) {
    const message = verificationEmail({
      name: user.name,
      url,
      expiresInMinutes: VERIFICATION_LINK_TTL_SECONDS / 60,
    });
    runInBackground(sendEmail({ to: user.email, ...message }));
  },
};

// Better Auth only rate-limits requests that arrive over HTTP (/api/auth/*),
// not auth.api.* calls made from Server Actions. It is on by default only in
// production; enabling it explicitly keeps dev and production behavior the
// same. /send-verification-email has a built-in limit of 3 per 60 seconds per
// client IP. Storage is in memory, so counts are per server instance.
export const rateLimit = { enabled: true } as const;

function buildAuth() {
  // Read lazily, like DATABASE_URL, so importing this module needs no env.
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  return betterAuth({
    // Better Auth builds the Google callback URL (/api/auth/callback/google)
    // from this. A wrong value causes redirect_uri_mismatch.
    baseURL: getBaseUrl(),
    ...(googleClientId && googleClientSecret
      ? {
          socialProviders: {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
              // Always show the account chooser instead of silently reusing
              // whichever Google account the browser is signed in to.
              prompt: "select_account" as const,
            },
          },
        }
      : {}),
    account: { accountLinking },
    database: prismaAdapter(getPrismaClient(), {
      provider: "postgresql",
    }),
    // The existing User model keeps `displayName` instead of adding a second,
    // overlapping `name` field. This maps Better Auth's `name` concept onto the
    // `displayName` column. See the schema comment on `model User` in
    // packages/database/prisma/schema.prisma.
    user: {
      fields: {
        name: "displayName",
      },
    },
    emailAndPassword,
    emailVerification,
    rateLimit,
    // Sign-up, sign-in, and sign-out are called from Server Actions
    // (auth.api.*), where Better Auth cannot set cookies on the response by
    // itself. This plugin sets them via Next's `cookies()` helper instead. Must
    // stay the last plugin in the array (Better Auth's own requirement).
    plugins: [nextCookies()],
  });
}

export function getAuth() {
  if (!globalForAuth.couchAuth) {
    globalForAuth.couchAuth = buildAuth();
  }
  return globalForAuth.couchAuth;
}
