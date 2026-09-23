// The app's own base URL, for building absolute links (for example an invite
// link) that must resolve correctly wherever they are shown, not just on the
// request that rendered them. Read from BETTER_AUTH_URL, the same variable
// Better Auth already uses for its own base URL, rather than introducing a
// second env var for the same value.
export function getBaseUrl(): string {
  const url = process.env.BETTER_AUTH_URL;
  if (!url) throw new Error("BETTER_AUTH_URL is not set");
  return url.replace(/\/$/, "");
}
