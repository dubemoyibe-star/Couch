import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { getPrismaClient } from "@couch/database";

// Uses the shared, hot-reload-safe Prisma client from @couch/database instead
// of a second PrismaClient instance, so auth queries go through the same
// pool, the same DATABASE_URL, and the same COUCH_DB_ENV guard as the rest of
// the app.
export const auth = betterAuth({
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
