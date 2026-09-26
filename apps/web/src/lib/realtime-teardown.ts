const TEARDOWN_TIMEOUT_MS = 5000;
const MAX_LOGGED_BODY_CHARS = 200;

export type TeardownResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export type TeardownConfig = {
  readonly url: string | undefined;
  readonly secret: string | undefined;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
};

/**
 * Asks the realtime service to end the live room of a couch that no longer
 * exists. Never throws: the outcome is returned so the caller can log it
 * without letting it affect the delete.
 *
 * The endpoint answers 204 on success. Its failure responses (401, 500) carry
 * no structured body, so a failure reports the HTTP status and whatever body
 * text exists, trimmed. The secret is sent only in the header and is never
 * part of a result.
 */
export async function requestRealtimeTeardown(couchId: string, config: TeardownConfig): Promise<TeardownResult> {
  if (!config.url || !config.secret) return { ok: false, reason: "realtime URL or secret is not configured" };
  const doFetch = config.fetch ?? fetch;
  try {
    const response = await doFetch(`${config.url.replace(/\/+$/, "")}/internal/couches/${encodeURIComponent(couchId)}/teardown`, {
      method: "POST",
      headers: { "x-internal-secret": config.secret },
      signal: AbortSignal.timeout(config.timeoutMs ?? TEARDOWN_TIMEOUT_MS),
    });
    if (response.status === 204) return { ok: true };
    const body = (await response.text().catch(() => "")).slice(0, MAX_LOGGED_BODY_CHARS);
    return { ok: false, reason: `HTTP ${response.status}, body: ${body === "" ? "(empty)" : body}` };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? `${error.name}: ${error.message}` : "unknown error" };
  }
}
