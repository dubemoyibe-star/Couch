import { getAuth } from "./auth";
import type { Authenticate } from "./server";

// Resolves a request's session cookie to the user it belongs to. Better Auth
// checks the cookie signature, the session row and its expiry, and returns
// null for anything that does not hold up. Only the user id leaves this
// function.
export const authenticateSession: Authenticate = async (headers) => {
  const session = await getAuth().api.getSession({ headers });
  return session ? { userId: session.user.id } : null;
};
