// Email HTML uses inline styles and table layout because email clients do not
// reliably support CSS custom properties, external stylesheets or flex/grid.
// The hex values are the light-theme design tokens from globals.css.
const BACKGROUND = "#fbf6ef";
const SURFACE = "#f3ead9";
const TEXT = "#2b211a";
const TEXT_MUTED = "#6b5d4f";
const PRIMARY = "#9c5827";
const PRIMARY_FOREGROUND = "#fbf6ef";

export type EmailContent = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FONT = "font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;";

// Shared card layout: one heading, body paragraphs, and an optional button
// plus fallback link. Every value passed in must already be HTML-escaped.
function layout(parts: {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly button?: { readonly label: string; readonly url: string };
  readonly footnote?: string;
}): string {
  const body = parts.paragraphs.map((p) => `<p style="margin:0 0 16px;">${p}</p>`).join("\n");
  const button = parts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${PRIMARY};border-radius:8px;">
<a href="${parts.button.url}" style="display:inline-block;padding:12px 24px;${FONT}font-size:16px;font-weight:600;color:${PRIMARY_FOREGROUND};text-decoration:none;">${parts.button.label}</a>
</td></tr></table>
<p style="margin:16px 0 0;font-size:14px;line-height:20px;color:${TEXT_MUTED};">Button not working? Paste this link into your browser:<br><a href="${parts.button.url}" style="color:${PRIMARY};word-break:break-all;">${parts.button.url}</a></p>`
    : "";
  const footnote = parts.footnote
    ? `<p style="margin:24px 0 0;font-size:14px;line-height:20px;color:${TEXT_MUTED};">${parts.footnote}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:${BACKGROUND};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BACKGROUND};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${SURFACE};border-radius:12px;">
<tr><td style="padding:32px;${FONT}color:${TEXT};font-size:16px;line-height:24px;">
<p style="margin:0 0 16px;font-size:20px;font-weight:600;">${parts.heading}</p>
${body}
${button}
${footnote}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export type ResetPasswordEmailInput = {
  readonly name: string;
  readonly url: string;
  readonly expiresInMinutes: number;
};

export function resetPasswordEmail({ name, url, expiresInMinutes }: ResetPasswordEmailInput): EmailContent {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(url);

  const html = layout({
    heading: "Reset your password",
    paragraphs: [`Hi ${safeName}, we got a request to reset the password for your Couch account. Use the button below to choose a new one.`],
    button: { label: "Reset password", url: safeUrl },
    footnote: `This link expires in ${expiresInMinutes} minutes and can be used once. If you did not ask for this, you can ignore this email and your password will stay the same.`,
  });

  const text = [
    `Hi ${name}, we got a request to reset the password for your Couch account.`,
    "",
    `Reset password: ${url}`,
    "",
    `This link expires in ${expiresInMinutes} minutes and can be used once. If you did not ask for this, you can ignore this email and your password will stay the same.`,
  ].join("\n");

  return { subject: "Reset your Couch password", html, text };
}

export type PasswordChangedEmailInput = {
  readonly name: string;
  /** The /forgot-password page, not a token link: anyone who reads this email must not be able to change the password with it. */
  readonly forgotPasswordUrl: string;
};

export function passwordChangedEmail({ name, forgotPasswordUrl }: PasswordChangedEmailInput): EmailContent {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(forgotPasswordUrl);

  const html = layout({
    heading: "Your password was changed",
    paragraphs: [
      `Hi ${safeName}, the password for your Couch account was just changed. You can now sign in with the new one.`,
      `If this was not you, reset your password again right away at <a href="${safeUrl}" style="color:${PRIMARY};word-break:break-all;">${safeUrl}</a>.`,
    ],
    footnote: "If this was you, there is nothing more to do.",
  });

  const text = [
    `Hi ${name}, the password for your Couch account was just changed. You can now sign in with the new one.`,
    "",
    `If this was not you, reset your password again right away: ${forgotPasswordUrl}`,
    "",
    "If this was you, there is nothing more to do.",
  ].join("\n");

  return { subject: "Your Couch password was changed", html, text };
}

export type WelcomeEmailInput = {
  readonly name: string;
  readonly catalogUrl: string;
  readonly createCouchUrl: string;
};

export function welcomeEmail({ name, catalogUrl, createCouchUrl }: WelcomeEmailInput): EmailContent {
  const safeName = escapeHtml(name);
  const safeCatalogUrl = escapeHtml(catalogUrl);
  const safeCreateUrl = escapeHtml(createCouchUrl);

  const html = layout({
    heading: "Welcome to Couch",
    paragraphs: [
      `Hi ${safeName}, your email is verified and your account is ready. Pull up a seat.`,
      `Have a look around the catalog to find something to watch, or <a href="${safeCreateUrl}" style="color:${PRIMARY};">create a couch</a> and invite friends to watch together.`,
    ],
    button: { label: "Browse the catalog", url: safeCatalogUrl },
    footnote: "Glad to have you. Enjoy movie night.",
  });

  const text = [
    `Hi ${name}, your email is verified and your account is ready. Pull up a seat.`,
    "",
    `Browse the catalog: ${catalogUrl}`,
    `Create a couch and invite friends: ${createCouchUrl}`,
    "",
    "Glad to have you. Enjoy movie night.",
  ].join("\n");

  return { subject: "Welcome to Couch", html, text };
}

export type VerificationEmailInput = {
  readonly name: string;
  readonly url: string;
  readonly expiresInMinutes: number;
};

export function verificationEmail({ name, url, expiresInMinutes }: VerificationEmailInput): EmailContent {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(url);
  const font = "font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;";

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:${BACKGROUND};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BACKGROUND};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${SURFACE};border-radius:12px;">
<tr><td style="padding:32px;${font}color:${TEXT};font-size:16px;line-height:24px;">
<p style="margin:0 0 16px;font-size:20px;font-weight:600;">Verify your email</p>
<p style="margin:0 0 24px;">Hi ${safeName}, confirm your email address to finish setting up your Couch account.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${PRIMARY};border-radius:8px;">
<a href="${safeUrl}" style="display:inline-block;padding:12px 24px;${font}font-size:16px;font-weight:600;color:${PRIMARY_FOREGROUND};text-decoration:none;">Verify email</a>
</td></tr></table>
<p style="margin:24px 0 0;font-size:14px;line-height:20px;color:${TEXT_MUTED};">This link expires in ${expiresInMinutes} minutes. If you did not create a Couch account, you can ignore this email.</p>
<p style="margin:16px 0 0;font-size:14px;line-height:20px;color:${TEXT_MUTED};">Button not working? Paste this link into your browser:<br><a href="${safeUrl}" style="color:${PRIMARY};word-break:break-all;">${safeUrl}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `Hi ${name}, confirm your email address to finish setting up your Couch account.`,
    "",
    `Verify email: ${url}`,
    "",
    `This link expires in ${expiresInMinutes} minutes. If you did not create a Couch account, you can ignore this email.`,
  ].join("\n");

  return { subject: "Verify your email for Couch", html, text };
}
