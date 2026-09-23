import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { EMAIL_FROM, resetEmailClientForTests, sendEmail } from "./email";

describe("sendEmail", () => {
  beforeEach(() => {
    send.mockReset();
    resetEmailClientForTests();
    process.env.RESEND_API_KEY = "re_test_placeholder";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sends from the couch.oyibe.dev address and returns the message id", async () => {
    send.mockResolvedValue({ data: { id: "msg_1" }, error: null });
    const result = await sendEmail({ to: "a@example.com", subject: "s", html: "<p>h</p>", text: "h" });
    expect(result).toEqual({ ok: true, id: "msg_1" });
    expect(EMAIL_FROM).toContain("@couch.oyibe.dev");
    expect(send).toHaveBeenCalledWith({
      from: EMAIL_FROM,
      to: "a@example.com",
      subject: "s",
      html: "<p>h</p>",
      text: "h",
    });
  });

  it("omits text when not provided", async () => {
    send.mockResolvedValue({ data: { id: "msg_2" }, error: null });
    await sendEmail({ to: "a@example.com", subject: "s", html: "<p>h</p>" });
    expect(send.mock.calls[0]?.[0]).not.toHaveProperty("text");
  });

  it("returns ok:false instead of throwing when Resend returns an error", async () => {
    send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "bad from" } });
    await expect(sendEmail({ to: "a@example.com", subject: "s", html: "x" })).resolves.toEqual({
      ok: false,
      error: "bad from",
    });
  });

  it("returns ok:false instead of rejecting when the client throws", async () => {
    send.mockRejectedValue(new Error("network down"));
    await expect(sendEmail({ to: "a@example.com", subject: "s", html: "x" })).resolves.toEqual({
      ok: false,
      error: "network down",
    });
  });

  it("returns ok:false instead of rejecting when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendEmail({ to: "a@example.com", subject: "s", html: "x" });
    expect(result).toEqual({ ok: false, error: "RESEND_API_KEY is not set" });
    expect(send).not.toHaveBeenCalled();
  });

  it("does not log the recipient or body on failure", async () => {
    send.mockResolvedValue({ data: null, error: { name: "x", message: "boom" } });
    await sendEmail({ to: "secret@example.com", subject: "s", html: "<p>body</p>" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret@example.com");
  });
});
