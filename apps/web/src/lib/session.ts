import { headers } from "next/headers";
import { getAuth } from "./auth";

export type CurrentUser = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
};

// Reads the session for the current request from Better Auth, using the
// incoming request's own headers (cookies included). Returns null when there
// is no signed-in user. Every later page or route handler that needs to know
// who is signed in should call this instead of reimplementing session lookup.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Read the incoming request's headers before touching `getAuth()` (which
  // builds the database-backed auth instance on first call). Reading
  // `headers()` is what tells Next this route depends on the request and
  // must render dynamically; doing it first means that bailout happens
  // before any database code runs, so a build's static-generation pass defers
  // this page to request time instead of trying to prerender it and hitting
  // a missing DATABASE_URL.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.name,
  };
}
