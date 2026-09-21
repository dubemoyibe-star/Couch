import { describe, expect, it } from "vitest";
import * as z from "zod";
import {
  defineEvent,
  ERROR_CODES,
  errorEvent,
  isKnownErrorCode,
  MAX_ERROR_CODE_LENGTH,
  MAX_ID_LENGTH,
  MAX_MESSAGE_BYTES,
  parseMessage,
  PARSE_ERROR_CODES,
  utf8ByteLength,
  type ErrorCode,
  type ParseErrorCode,
} from "./index";

const echo = defineEvent({
  type: "test.echo",
  direction: "client",
  payload: { text: z.string() },
});
const ping = defineEvent({ type: "test.ping", direction: "client", payload: {} });
const clientEvents = [echo, ping] as const;

const notice = defineEvent({
  type: "test.notice",
  direction: "server",
  payload: { text: z.string() },
});
const serverEvents = [notice, errorEvent] as const;

const json = (value: unknown) => JSON.stringify(value);
const validEcho = { v: 1, type: "test.echo", id: "abc", payload: { text: "hi" } };

function failure(result: ReturnType<typeof parseMessage>) {
  if (result.ok) throw new Error("expected ok:false");
  return result.error;
}

describe("parseMessage: success", () => {
  it("returns the parsed message", () => {
    const result = parseMessage(json(validEcho), clientEvents);
    expect(result).toEqual({ ok: true, data: validEcho });
  });

  it("accepts a message without an id", () => {
    const result = parseMessage(json({ v: 1, type: "test.ping", payload: {} }), clientEvents);
    expect(result.ok).toBe(true);
  });

  it("parses the server error message", () => {
    const message = {
      v: 1,
      type: "error",
      payload: { code: "invalid_json", message: "bad", replyTo: "abc" },
    };
    expect(parseMessage(json(message), serverEvents)).toEqual({ ok: true, data: message });
  });
});

describe("error message: tolerant code", () => {
  const errorMessage = (code: unknown) =>
    json({ v: 1, type: "error", payload: { code, message: "bad" } });

  it("parses every known code", () => {
    for (const code of ERROR_CODES) {
      expect(parseMessage(errorMessage(code), serverEvents).ok, code).toBe(true);
    }
  });

  it("parses a code this build does not know, and keeps it", () => {
    const result = parseMessage(errorMessage("code_from_a_newer_server"), serverEvents);
    expect(result).toEqual({
      ok: true,
      data: { v: 1, type: "error", payload: { code: "code_from_a_newer_server", message: "bad" } },
    });
  });

  it("isKnownErrorCode tells the two apart", () => {
    for (const code of ERROR_CODES) expect(isKnownErrorCode(code), code).toBe(true);
    expect(isKnownErrorCode("code_from_a_newer_server")).toBe(false);
    expect(isKnownErrorCode("")).toBe(false);
    expect(isKnownErrorCode("Invalid_JSON")).toBe(false);
    // Names on the prototype chain are not codes.
    expect(isKnownErrorCode("toString")).toBe(false);
    expect(isKnownErrorCode("constructor")).toBe(false);
  });

  it("narrows an unknown code so a client can branch on it", () => {
    const result = parseMessage(errorMessage("code_from_a_newer_server"), serverEvents);
    if (!result.ok || result.data.type !== "error") throw new Error("expected an error message");
    const code = result.data.payload.code;
    const label: ErrorCode | "generic" = isKnownErrorCode(code) ? code : "generic";
    expect(label).toBe("generic");
  });

  it("accepts a code at the length limit and rejects one above it", () => {
    expect(parseMessage(errorMessage("a".repeat(MAX_ERROR_CODE_LENGTH)), serverEvents).ok).toBe(true);
    const tooLong = failure(parseMessage(errorMessage("a".repeat(MAX_ERROR_CODE_LENGTH + 1)), serverEvents));
    expect(tooLong.code).toBe("invalid_payload");
  });

  it.each([
    ["an empty string", ""],
    ["a number", 5],
    ["null", null],
    ["an object", {}],
  ])("rejects %s", (_label, code) => {
    expect(failure(parseMessage(errorMessage(code), serverEvents)).code).toBe("invalid_payload");
  });

  it("rejects a missing code", () => {
    const raw = json({ v: 1, type: "error", payload: { message: "bad" } });
    expect(failure(parseMessage(raw, serverEvents)).code).toBe("invalid_payload");
  });

  it("still strips unknown keys, as for every server message", () => {
    const raw = json({ v: 1, type: "error", payload: { code: "x_new", message: "bad", extra: 1 } });
    expect(parseMessage(raw, serverEvents)).toEqual({
      ok: true,
      data: { v: 1, type: "error", payload: { code: "x_new", message: "bad" } },
    });
  });
});

describe("parseMessage: every error code", () => {
  const table: { name: string; raw: string; code: ParseErrorCode }[] = [
    { name: "oversized", raw: "x".repeat(MAX_MESSAGE_BYTES + 1), code: "message_too_large" },
    { name: "not JSON", raw: "{nope", code: "invalid_json" },
    { name: "empty string", raw: "", code: "invalid_json" },
    { name: "top level array", raw: "[]", code: "invalid_json" },
    { name: "missing version", raw: json({ type: "test.echo", payload: {} }), code: "unsupported_version" },
    { name: "future version", raw: json({ ...validEcho, v: 2 }), code: "unsupported_version" },
    { name: "string version", raw: json({ ...validEcho, v: "1" }), code: "unsupported_version" },
    { name: "unknown type", raw: json({ ...validEcho, type: "test.nope" }), code: "unknown_type" },
    { name: "missing type", raw: json({ v: 1, payload: {} }), code: "unknown_type" },
    { name: "numeric type", raw: json({ v: 1, type: 5, payload: {} }), code: "unknown_type" },
    { name: "bad payload", raw: json({ ...validEcho, payload: { text: 1 } }), code: "invalid_payload" },
    { name: "missing payload", raw: json({ v: 1, type: "test.echo" }), code: "invalid_payload" },
    { name: "extra payload key", raw: json({ ...validEcho, payload: { text: "a", x: 1 } }), code: "invalid_payload" },
    { name: "extra envelope key", raw: json({ ...validEcho, x: 1 }), code: "invalid_payload" },
    { name: "over-long id", raw: json({ ...validEcho, id: "x".repeat(65) }), code: "invalid_payload" },
  ];

  it.each(table)("$name gives $code", ({ raw, code }) => {
    const error = failure(parseMessage(raw, clientEvents));
    expect(error.code).toBe(code);
    expect(error.message.length).toBeGreaterThan(0);
  });

  it("covers every ParseErrorCode", () => {
    const covered = new Set(table.map((row) => row.code));
    expect([...covered].sort()).toEqual([...PARSE_ERROR_CODES].sort());
  });
});

describe("parseMessage: stage order", () => {
  it("v=2 with an invalid payload is unsupported_version", () => {
    const raw = json({ v: 2, type: "test.echo", payload: { text: 123 } });
    expect(failure(parseMessage(raw, clientEvents)).code).toBe("unsupported_version");
  });

  it("v=2 with an unknown type is unsupported_version", () => {
    const raw = json({ v: 2, type: "test.nope", payload: null });
    expect(failure(parseMessage(raw, clientEvents)).code).toBe("unsupported_version");
  });

  it("an unknown type with an invalid payload is unknown_type", () => {
    const raw = json({ v: 1, type: "test.nope", payload: { text: 123 } });
    expect(failure(parseMessage(raw, clientEvents)).code).toBe("unknown_type");
  });

  it("an oversized message that is also invalid JSON is message_too_large", () => {
    const raw = "{" + "x".repeat(MAX_MESSAGE_BYTES + 1);
    expect(failure(parseMessage(raw, clientEvents)).code).toBe("message_too_large");
  });

  it("a multi-byte string under the limit in characters but over it in bytes is message_too_large", () => {
    // 3 bytes each in UTF-8; 30000 characters < 65536 but 90000 bytes > 65536.
    const raw = "€".repeat(30_000);
    expect(raw.length).toBeLessThan(MAX_MESSAGE_BYTES);
    expect(utf8ByteLength(raw)).toBeGreaterThan(MAX_MESSAGE_BYTES);
    expect(failure(parseMessage(raw, clientEvents)).code).toBe("message_too_large");
  });

  it("the size limit is inclusive in bytes", () => {
    const pad = (n: number) => json({ ...validEcho, payload: { text: "€".repeat(n) } });
    // Build a valid message whose byte size is exactly the limit, then one byte over.
    const base = utf8ByteLength(pad(0));
    const fit = Math.floor((MAX_MESSAGE_BYTES - base) / 3);
    const atLimit = pad(fit) + " ".repeat(MAX_MESSAGE_BYTES - utf8ByteLength(pad(fit)));
    expect(utf8ByteLength(atLimit)).toBe(MAX_MESSAGE_BYTES);
    expect(parseMessage(atLimit, clientEvents).ok).toBe(true);
    expect(failure(parseMessage(atLimit + " ", clientEvents)).code).toBe("message_too_large");
  });

  it("invalid JSON with a non-object top level is not reported past step 3", () => {
    expect(failure(parseMessage("null", clientEvents)).code).toBe("invalid_json");
  });
});

describe("parseMessage: never throws", () => {
  const nested = (depth: number) => "[".repeat(depth) + "]".repeat(depth);
  const deepObject = (depth: number) => '{"a":'.repeat(depth) + "1" + "}".repeat(depth);

  const inputs: { name: string; raw: unknown }[] = [
    { name: "huge string", raw: "a".repeat(5_000_000) },
    { name: "huge quoted string", raw: '"' + "a".repeat(5_000_000) + '"' },
    { name: "array", raw: "[1,2,3]" },
    { name: "nested arrays", raw: nested(30_000) },
    { name: "deeply nested objects", raw: deepObject(10_000) },
    { name: "deeply nested inside payload", raw: `{"v":1,"type":"test.echo","payload":${deepObject(10_000)}}` },
    { name: "null", raw: "null" },
    { name: "number", raw: "42" },
    { name: "boolean", raw: "true" },
    { name: "string literal", raw: '"hello"' },
    { name: "lone surrogate", raw: "\ud800" },
    { name: "__proto__ key", raw: '{"__proto__":{"v":1},"v":1,"type":"test.ping","payload":{}}' },
    { name: "non-string (Buffer-like)", raw: new Uint8Array([123, 125]) },
    { name: "undefined", raw: undefined },
    { name: "null value", raw: null },
  ];

  it.each(inputs)("$name returns ok:false", ({ raw }) => {
    // The cast reaches the runtime guard for callers that hand over non-strings (e.g. a ws Buffer).
    const call = () => parseMessage(raw as string, clientEvents);
    expect(call).not.toThrow();
    const result = call();
    expect(result.ok).toBe(false);
  });
});

describe("parseMessage: replyTo", () => {
  it.each([
    { name: "unsupported_version", value: { v: 2, type: "test.echo", id: "r1", payload: {} } },
    { name: "unknown_type", value: { v: 1, type: "nope", id: "r1", payload: {} } },
    { name: "invalid_payload", value: { v: 1, type: "test.echo", id: "r1", payload: {} } },
  ])("is set for $name when the id is usable", ({ name, value }) => {
    const error = failure(parseMessage(json(value), clientEvents));
    expect(error.code).toBe(name);
    expect(error.replyTo).toBe("r1");
  });

  it("is absent when there is no id", () => {
    const error = failure(parseMessage(json({ v: 1, type: "test.echo", payload: {} }), clientEvents));
    expect(error).not.toHaveProperty("replyTo");
  });

  it.each([
    { name: "number", id: 5 },
    { name: "null", id: null },
    { name: "object", id: {} },
    { name: "empty string", id: "" },
    { name: "over the cap", id: "x".repeat(MAX_ID_LENGTH + 1) },
  ])("is absent when the id is a $name", ({ id }) => {
    const error = failure(parseMessage(json({ v: 1, type: "test.echo", id, payload: {} }), clientEvents));
    expect(error.code).toBe("invalid_payload");
    expect(error).not.toHaveProperty("replyTo");
  });

  it("is present with an id exactly at the cap", () => {
    const id = "x".repeat(MAX_ID_LENGTH);
    const error = failure(parseMessage(json({ v: 1, type: "test.echo", id, payload: {} }), clientEvents));
    expect(error.replyTo).toBe(id);
  });

  it.each([
    { name: "message_too_large", raw: "x".repeat(MAX_MESSAGE_BYTES + 1) },
    { name: "invalid_json (not JSON)", raw: "{nope" },
    { name: "invalid_json (array)", raw: json([{ id: "r1" }]) },
  ])("is absent for $name, which fails before step 3 completes", ({ raw }) => {
    expect(failure(parseMessage(raw, clientEvents))).not.toHaveProperty("replyTo");
  });
});

describe("parseMessage: direction strictness", () => {
  it("rejects a client message with an extra key", () => {
    const raw = json({ ...validEcho, payload: { text: "hi", extra: true } });
    expect(failure(parseMessage(raw, clientEvents)).code).toBe("invalid_payload");
  });

  it("strips extra keys from a server message", () => {
    const raw = json({
      v: 1,
      type: "test.notice",
      extra: 1,
      payload: { text: "hi", extra: { a: 1 } },
    });
    expect(parseMessage(raw, serverEvents)).toEqual({
      ok: true,
      data: { v: 1, type: "test.notice", payload: { text: "hi" } },
    });
  });

  it("reports an unknown server type as unknown_type so a client can ignore it", () => {
    const raw = json({ v: 1, type: "future.thing", payload: { anything: 1 } });
    expect(failure(parseMessage(raw, serverEvents)).code).toBe("unknown_type");
  });

  it("narrows data by the type field", () => {
    const result = parseMessage(json(validEcho), clientEvents);
    if (result.ok && result.data.type === "test.echo") {
      expect(result.data.payload.text).toBe("hi");
    } else {
      throw new Error("expected an echo message");
    }
  });
});

// This package sees neither DOM nor Node globals (see docs/ARCHITECTURE.md), but the test
// runs in Node, so declare the one global used as the reference implementation.
declare const TextEncoder: new () => { encode(text: string): { length: number } };

describe("utf8ByteLength", () => {
  const encoder = new TextEncoder();
  it.each([
    ["ascii", "hello"],
    ["empty", ""],
    ["2-byte", "é ñ"],
    ["3-byte", "€ 日本語"],
    ["4-byte pair", "😀 𝄞"],
    ["lone high surrogate", "a\ud800b"],
    ["lone low surrogate", "a\udc00b"],
    ["high surrogate at end", "a\ud800"],
    ["reversed pair", "\udc00\ud800"],
  ])("matches TextEncoder for %s", (_name, text) => {
    expect(utf8ByteLength(text)).toBe(encoder.encode(text).length);
  });
});
