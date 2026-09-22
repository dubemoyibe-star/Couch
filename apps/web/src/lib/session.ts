import { headers } from "next/headers";
import { auth } from "./auth";

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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.name,
  };
}
