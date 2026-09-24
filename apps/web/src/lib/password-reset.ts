// Where the emailed link sends the visitor after Better Auth checks the token.
// Better Auth appends `?token=<TOKEN>` when the token is usable, or
// `?error=INVALID_TOKEN` when it is missing, unknown or expired.
// Kept free of server-only imports so client components can use it too.
export const RESET_PASSWORD_REDIRECT_URL = "/reset-password";
