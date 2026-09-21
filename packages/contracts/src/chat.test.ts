import { describe, expect, it } from "vitest";
import {
  CHAT_MAX_LENGTH,
  CHAT_MESSAGE_ID_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  clientEvents,
  parseMessage,
  serverEvents,
  type ParseResult,
} from "./index";

const message = (type: string, payload: unknown, extra: object = {}) =>
  JSON.stringify({ v: 1, type, payload, ...extra });
const send = (text: unknown) => parseMessage(message("chat.send", { text }), clientEvents);
const receive = (payload: unknown) => parseMessage(message("chat.message", payload), serverEvents);

function code(result: ParseResult<unknown>) {
  if (result.ok) throw new Error("expected ok:false");
  return result.error.code;
}

function text(result: ParseResult<unknown>) {
  if (!result.ok) throw new Error("expected ok:true");
  return (result.data as { payload: { text: string } }).payload.text;
}

describe("chat.send", () => {
  it("round-trips", () => {
    const raw = message("chat.send", { text: "hello" }, { id: "c-7" });
    expect(parseMessage(raw, clientEvents)).toEqual({
      ok: true,
      data: { v: 1, type: "chat.send", id: "c-7", payload: { text: "hello" } },
    });
  });

  it("trims the text", () => {
    expect(text(send("  hi there \n"))).toBe("hi there");
  });

  it("accepts a newline inside the text", () => {
    expect(text(send("line one\nline two"))).toBe("line one\nline two");
  });

  it("accepts other Unicode: it applies no bidi or zero-width rules", () => {
    const value = "a​b ‮abc \u{1F468}‍\u{1F469}‍\u{1F467} é́";
    expect(text(send(value))).toBe(value);
  });

  it("accepts exactly CHAT_MAX_LENGTH characters, counted after trimming", () => {
    expect(send("a".repeat(CHAT_MAX_LENGTH)).ok).toBe(true);
    expect(send(`   ${"a".repeat(CHAT_MAX_LENGTH)}   `).ok).toBe(true);
  });

  it("counts Unicode code points, so an emoji counts as 1", () => {
    expect(send("\u{1F600}".repeat(CHAT_MAX_LENGTH)).ok).toBe(true);
    expect(code(send("\u{1F600}".repeat(CHAT_MAX_LENGTH + 1)))).toBe("invalid_payload");
  });

  it.each([
    ["empty", ""],
    ["spaces only", "    "],
    ["a newline only", "\n\n"],
    ["over the limit", "a".repeat(CHAT_MAX_LENGTH + 1)],
    ["a number", 5],
    ["null", null],
    ["missing", undefined],
    ["a NUL", "a\u0000b"],
    ["a tab", "a\tb"],
    ["a carriage return", "a\rb"],
    ["a carriage return at the edge", "hello\r"],
    ["a tab at the edge", "hello\t"],
    ["a CRLF pair", "a\r\nb"],
    ["the last C0 control", "a\u001fb"],
    ["DEL", "a\u007fb"],
    ["DEL at the edge", "hello\u007f"],
    ["an escape character", "a\u001b[31mred"],
  ])("rejects text that is %s", (_name, value) => {
    expect(code(send(value))).toBe("invalid_payload");
  });

  it("rejects an extra key", () => {
    const raw = message("chat.send", { text: "hi", mentions: [] });
    expect(code(parseMessage(raw, clientEvents))).toBe("invalid_payload");
  });
});

describe("chat.send identity", () => {
  it.each(["userId", "role", "sender", "displayName", "sentAt", "timestamp", "id"])(
    "rejects a payload with an extra %s key",
    (key) => {
      const raw = message("chat.send", { text: "hi", [key]: "admin" });
      expect(code(parseMessage(raw, clientEvents))).toBe("invalid_payload");
    },
  );

  it("rejects userId and role together", () => {
    const raw = message("chat.send", { text: "hi", userId: "someone-else", role: "host" });
    expect(code(parseMessage(raw, clientEvents))).toBe("invalid_payload");
  });

  it("rejects an identity key at the envelope level", () => {
    const raw = message("chat.send", { text: "hi" }, { userId: "someone-else" });
    expect(code(parseMessage(raw, clientEvents))).toBe("invalid_payload");
  });
});

describe("chat.message", () => {
  const valid = {
    id: "msg-1",
    userId: "user-1",
    displayName: "Ada",
    text: "hello",
    sentAt: 1_700_000_000_000,
  };

  it("round-trips", () => {
    expect(receive(valid)).toEqual({
      ok: true,
      data: { v: 1, type: "chat.message", payload: valid },
    });
  });

  it("accepts sentAt 0 and the largest safe integer", () => {
    expect(receive({ ...valid, sentAt: 0 }).ok).toBe(true);
    expect(receive({ ...valid, sentAt: Number.MAX_SAFE_INTEGER }).ok).toBe(true);
  });

  it.each<[string, object]>([
    ["a negative sentAt", { sentAt: -1 }],
    ["a fractional sentAt", { sentAt: 1.5 }],
    ["a sentAt above the safe range", { sentAt: Number.MAX_SAFE_INTEGER + 1 }],
    ["a string sentAt", { sentAt: "1700000000000" }],
    ["a NaN sentAt", { sentAt: NaN }],
    ["a missing sentAt", { sentAt: undefined }],
    ["an empty id", { id: "" }],
    ["an over-long id", { id: "a".repeat(CHAT_MESSAGE_ID_MAX_LENGTH + 1) }],
    ["a padded userId", { userId: " user-1" }],
    ["an empty displayName", { displayName: " " }],
    ["a displayName over the limit", { displayName: "a".repeat(DISPLAY_NAME_MAX_LENGTH + 1) }],
    ["empty text", { text: "   " }],
    ["text over the limit", { text: "a".repeat(CHAT_MAX_LENGTH + 1) }],
    ["text with a control character", { text: "a\u0007b" }],
    ["text with DEL", { text: "a\u007fb" }],
    ["a displayName with a newline", { displayName: "a\nb" }],
    ["a missing userId", { userId: undefined }],
  ])("rejects %s", (_name, patch) => {
    expect(code(receive({ ...valid, ...patch }))).toBe("invalid_payload");
  });

  it("strips an unknown key", () => {
    expect(receive({ ...valid, edited: true })).toEqual({
      ok: true,
      data: { v: 1, type: "chat.message", payload: valid },
    });
  });

  it("cannot be sent by a client", () => {
    const raw = message("chat.message", valid);
    expect(code(parseMessage(raw, clientEvents))).toBe("unknown_type");
  });
});
