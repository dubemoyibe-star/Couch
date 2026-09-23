import { Resend } from "resend";

// Shared transactional email sender, backed by Resend. couch.oyibe.dev is
// verified in Resend at the root domain. "no-reply" because auth email is
// send-only and nobody should reply to it.
export const EMAIL_FROM = "Couch <no-reply@couch.oyibe.dev>";

export type SendEmailInput = {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text?: string;
};

export type SendEmailResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: string };

// Built lazily so importing this module does not require RESEND_API_KEY
// (Next's build step imports route module graphs without runtime secrets).
let client: Resend | undefined;

function getClient(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    client = new Resend(key);
  }
  return client;
}

// Sends one email from EMAIL_FROM.
//
// DO NOT AWAIT THIS inside a Better Auth hook (sendVerificationEmail,
// sendResetPassword). Better Auth and Resend both say to call it as
// `void sendEmail(...)`: awaiting makes the response time depend on whether
// an account exists, which reveals account existence. On serverless
// platforms, wrap the call in waitUntil (or the platform equivalent) so the
// send is not cut off when the response returns.
//
// This function never rejects and never throws, so `void sendEmail(...)` cannot
// cause an unhandled rejection. Failures come back as { ok: false }, with only
// the provider's error message logged (never the API key, recipient or body).
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    const { data, error } = await getClient().emails.send({
      from: EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text !== undefined ? { text: input.text } : {}),
    });
    if (error || !data) {
      const message = error?.message ?? "no data returned";
      console.error(`[email] send failed: ${message}`);
      return { ok: false, error: message };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[email] send failed: ${message}`);
    return { ok: false, error: message };
  }
}

// Test seam: drops the cached client so a test can change RESEND_API_KEY.
export function resetEmailClientForTests(): void {
  client = undefined;
}
