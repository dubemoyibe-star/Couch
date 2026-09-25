import { prismaAdapter } from "better-auth/adapters/prisma";
import type { BetterAuthOptions } from "better-auth";
import { getPrismaClient } from "./client";

// The parts of the Better Auth configuration that must be identical in every
// process that reads a session: apps/web (which also issues sessions) and
// apps/realtime (which only validates them). Each app builds its own
// betterAuth() instance from these options and layers its own additions on
// top. Anything provider-specific (social providers, email hooks) is not here.
//
// Nothing runs at import time. The options are built on first call, because
// the Prisma adapter needs getPrismaClient(), which reads DATABASE_URL.

// Pinned to Better Auth's own defaults today, so pinning changes no behavior.
// Spelled out so a default change in a library upgrade cannot make two
// processes disagree about how long a session lasts or what its cookie is
// called.
export const AUTH_SESSION_SETTINGS = {
  expiresIn: 60 * 60 * 24 * 7,
  updateAge: 60 * 60 * 24,
  cookieCache: { enabled: false },
} as const;

export const AUTH_COOKIE_PREFIX = "better-auth";

export type AuthCoreEnv = {
  readonly BETTER_AUTH_SECRET?: string | undefined;
  readonly BETTER_AUTH_URL?: string | undefined;
};

export type AuthCoreOptions = {
  readonly env?: AuthCoreEnv;
  // Replaces the Prisma adapter. Only for tests that must not need a database.
  readonly database?: BetterAuthOptions["database"];
};

// The base URL decides whether the session cookie gets the `__Secure-` name
// prefix (https) or not (http), so both processes must be given the same
// BETTER_AUTH_URL or one would look for a cookie name the other never set.
// The secret signs the cookie, so it must be the same value too. A missing
// secret is refused instead of falling back to Better Auth's built-in default,
// which would let a process silently validate against the wrong key.
export function createAuthCoreOptions(options: AuthCoreOptions = {}) {
  const env = options.env ?? process.env;
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  const rawUrl = env.BETTER_AUTH_URL;
  if (!rawUrl) throw new Error("BETTER_AUTH_URL is not set");
  const baseURL = rawUrl.replace(/\/$/, "");

  return {
    baseURL,
    secret,
    trustedOrigins: [new URL(baseURL).origin],
    database: options.database ?? prismaAdapter(getPrismaClient(), { provider: "postgresql" }),
    // The existing User model keeps `displayName` instead of adding a second,
    // overlapping `name` field. This maps Better Auth's `name` concept onto the
    // `displayName` column. See the schema comment on `model User` in
    // packages/database/prisma/schema.prisma.
    user: { fields: { name: "displayName" } },
    session: AUTH_SESSION_SETTINGS,
    advanced: { cookiePrefix: AUTH_COOKIE_PREFIX },
  } satisfies BetterAuthOptions;
}
