import { betterAuth } from "better-auth";
import { createAuthCoreOptions } from "@couch/database/auth-core";

// Session validation for the realtime service. Built from the same shared core
// as apps/web (secret, cookie settings, base URL, database), so a session
// cookie resolves to the same user in both processes. Deliberately nothing
// else: no social providers, no email or verification hooks. This instance
// only reads sessions (`auth.api.getSession({ headers })`); it never issues
// one, and callers must not expose its sign-in or sign-up endpoints.
//
// Built lazily on first use, and cached, like getPrismaClient(): the core
// options call getPrismaClient(), which reads DATABASE_URL. Building at module
// scope would make a missing variable crash the long-lived process at import
// time instead of failing one call.
let cached: ReturnType<typeof buildAuth> | undefined;

function buildAuth() {
  return betterAuth(createAuthCoreOptions());
}

export function getAuth() {
  cached ??= buildAuth();
  return cached;
}
