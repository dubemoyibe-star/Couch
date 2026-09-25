import { describe, expect, it } from "vitest";
import { MAX_CLIENT_MESSAGE_BYTES, utf8ByteLength } from "@couch/contracts";
import { MAX_FRAME_BYTES, interpretFrame } from "./inbound";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("interpretFrame", () => {
  it("parses a valid client message", () => {
    const result = interpretFrame(
      bytes(JSON.stringify({ v: 1, type: "room.join", id: "c-1", payload: { couchId: "couch-1" } })),
      false,
    );
    expect(result).toEqual({
      ok: true,
      message: { v: 1, type: "room.join", id: "c-1", payload: { couchId: "couch-1" } },
    });
  });

  it("replies message_too_large for a message over the client cap", () => {
    const text = "x".repeat(MAX_CLIENT_MESSAGE_BYTES + 1);
    expect(utf8ByteLength(text)).toBe(MAX_CLIENT_MESSAGE_BYTES + 1);
    expect(interpretFrame(bytes(text), false)).toEqual({
      ok: false,
      reply: {
        v: 1,
        type: "error",
        payload: { code: "message_too_large", message: "Message exceeds the maximum size." },
      },
    });
  });

  it("does not treat a message of exactly the client cap as too large", () => {
    const result = interpretFrame(bytes("x".repeat(MAX_CLIENT_MESSAGE_BYTES)), false);
    // Size is not the failure here: the text is simply not JSON.
    expect(result).toMatchObject({ ok: false, reply: { payload: { code: "invalid_json" } } });
  });

  it("measures bytes, not characters", () => {
    // 4-byte characters: under the cap by length, over it by bytes.
    const text = "\u{1F600}".repeat(MAX_CLIENT_MESSAGE_BYTES / 4 + 1);
    expect(text.length).toBeLessThan(MAX_CLIENT_MESSAGE_BYTES);
    expect(interpretFrame(bytes(text), false)).toMatchObject({
      ok: false,
      reply: { payload: { code: "message_too_large" } },
    });
  });

  it("replies invalid_json for malformed JSON", () => {
    expect(interpretFrame(bytes("{not json"), false)).toEqual({
      ok: false,
      reply: {
        v: 1,
        type: "error",
        payload: { code: "invalid_json", message: "Message is not a valid JSON object." },
      },
    });
  });

  it("replies invalid_json for a binary frame", () => {
    expect(interpretFrame(bytes("{}"), true)).toMatchObject({
      ok: false,
      reply: { type: "error", payload: { code: "invalid_json" } },
    });
  });

  it("replies unknown_type and echoes the correlation id", () => {
    const frame = JSON.stringify({ v: 1, type: "nope.nope", id: "c-9", payload: {} });
    expect(interpretFrame(bytes(frame), false)).toMatchObject({
      ok: false,
      reply: { payload: { code: "unknown_type", replyTo: "c-9" } },
    });
  });

  it("rejects an identity field the contract does not define", () => {
    const frame = JSON.stringify({ v: 1, type: "chat.send", payload: { text: "hi", userId: "someone-else" } });
    expect(interpretFrame(bytes(frame), false)).toMatchObject({
      ok: false,
      reply: { payload: { code: "invalid_payload" } },
    });
  });

  it("keeps the socket limit above the contract cap so the reply can be sent", () => {
    expect(MAX_FRAME_BYTES).toBeGreaterThan(MAX_CLIENT_MESSAGE_BYTES);
  });
});
