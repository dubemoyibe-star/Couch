import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { getPrismaClient } from "@couch/database";
import { getBaseUrl } from "./base-url";

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
    emailAndPassword: {
      enabled: true,
      // Email verification is not enforced in this MVP: no verification email
      // is sent, so requiring it would lock every user out at sign-in.
      requireEmailVerification: false,
    },
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
