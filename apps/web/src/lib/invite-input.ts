/**
 * Pulls an invite code out of what a person pasted: a full invite link or the
 * bare code. This only decides where to navigate. The join page looks the code
 * up on the server and rejects anything that is not a real invite.
 */
export function parseInviteCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withoutQuery = trimmed.split(/[?#]/)[0] ?? "";
  const segments = withoutQuery.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return null;

  return /^[A-Za-z0-9_-]{6,64}$/.test(last) ? last : null;
}
