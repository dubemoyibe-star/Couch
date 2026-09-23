import { sendEmail } from "../src/lib/email";

// One-off manual proof that email delivery works. Run by hand, never from a
// test: pnpm --filter @couch/web send:test-email you@example.com
// RESEND_API_KEY is loaded from ../../.env.local by the package script.
async function main(): Promise<void> {
  const to = process.argv[2];
  if (!to) {
    console.error("usage: send-test-email <recipient>");
    process.exit(1);
  }
  const result = await sendEmail({
    to,
    subject: "Couch email delivery check",
    html: "<p>This confirms Couch can send email.</p>",
    text: "This confirms Couch can send email.",
  });
  if (!result.ok) {
    console.error(`send failed: ${result.error}`);
    process.exit(1);
  }
  console.log(`sent, Resend message id: ${result.id}`);
}

void main();
