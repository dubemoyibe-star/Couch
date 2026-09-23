import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { getPrismaClient } from "@couch/database";

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

function buildAuth() {
  return betterAuth({
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
