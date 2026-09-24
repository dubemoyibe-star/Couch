import { describe, expect, it } from "vitest";
import { verificationEmail } from "./email-templates";

const URL = "http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email";

describe("verificationEmail", () => {
  it("includes the verify link in both the html and the text body", () => {
    const { html, text, subject } = verificationEmail({ name: "Ada", url: URL, expiresInMinutes: 60 });
    expect(subject).toBe("Verify your email for Couch");
    expect(html).toContain('href="http://localhost:3000/api/auth/verify-email?token=abc&amp;callbackURL=%2Fverify-email"');
    expect(text).toContain(URL);
    expect(html).toContain("expires in 60 minutes");
  });

  it("escapes the display name so it cannot inject markup", () => {
    const { html } = verificationEmail({ name: '<script>alert("x")</script>', url: URL, expiresInMinutes: 60 });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("uses inline hex colors, not CSS custom properties", () => {
    const { html } = verificationEmail({ name: "Ada", url: URL, expiresInMinutes: 60 });
    expect(html).not.toContain("var(--");
    expect(html).toContain("#9c5827");
  });
});
