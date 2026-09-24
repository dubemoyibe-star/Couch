import type { GoogleOptions } from "better-auth/social-providers";

// Replacing an unverified holder of an email: when Google vouches for an
// address that belongs to an unverified email/password account, that account is
// deleted so the normal Google sign-up path can create the real owner's account.
// This does not change the implicit account-linking rule (see accountLinking in
// auth.ts), which still never links Google into an unverified account.
//
// Why it is safe: it can only run inside a Google sign-in that Google itself
// says is for this address, so only the person who controls the inbox can
// trigger it. And an unverified account is never signed in (see
// emailAndPassword and googleProviderSettings in auth.ts), so it has no session
// and cannot own or belong to anything; the release function re-checks that in
// the database at the moment of deletion.

export type ReleaseUnverifiedEmailResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "not_found" | "verified" | "has_data" };

/**
 * Deletes the user with this email if, and only if, it is still unverified and
 * has nothing attached. It must decide from the database when it is called.
 */
export type ReleaseUnverifiedEmail = (email: string) => Promise<ReleaseUnverifiedEmailResult>;

type GetUserInfo = NonNullable<GoogleOptions["getUserInfo"]>;

/**
 * Wraps Google's user-info lookup so an unverified account holding the email is
 * released before Better Auth looks the email up. When Google does not vouch
 * for the email, the base result is returned untouched and nothing is deleted.
 *
 * Any outcome other than a successful release leaves the row alone and the
 * sign-in continues as it would have without this wrapper: a verified account
 * is linked to as usual, and an unverified account that somehow has data is
 * refused by the linking gate.
 */
export function withEmailClaim(base: GetUserInfo, release: ReleaseUnverifiedEmail): GetUserInfo {
  return async (token) => {
    const info = await base(token);
    if (!info || info.user.emailVerified !== true || !info.user.email) return info;

    await release(info.user.email);
    return info;
  };
}
