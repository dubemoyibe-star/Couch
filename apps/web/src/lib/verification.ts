// Where the emailed link lands after Better Auth checks the token. Better Auth
// appends `?error=<CODE>` to this URL when the link is expired or invalid.
// Kept free of server-only imports so client components can use it too.
export const VERIFY_EMAIL_CALLBACK_URL = "/verify-email?status=verified";
