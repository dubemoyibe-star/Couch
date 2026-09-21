import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod";
import { defineEvent, errorEvent, ERROR_CODES, type MessageOf } from "./index";

const echo = defineEvent({
  type: "test.echo",
  direction: "client",
  payload: { text: z.string(), count: z.number().optional() },
});

const notice = defineEvent({
  type: "test.notice",
  direction: "server",
  payload: { text: z.string() },
});

describe("defineEvent", () => {
  it("infers the message type from the definition", () => {
    type EchoMessage = MessageOf<typeof echo>;
    expectTypeOf<EchoMessage>().toEqualTypeOf<{
      v: 1;
      type: "test.echo";
      id?: string | undefined;
      payload: { text: string; count?: number | undefined };
    }>();
    expectTypeOf(echo.type).toEqualTypeOf<"test.echo">();
    expectTypeOf(echo.direction).toEqualTypeOf<"client">();
    expectTypeOf(notice.direction).toEqualTypeOf<"server">();

    // @ts-expect-error a wrong payload field type must not satisfy the inferred type
    const bad: EchoMessage = { v: 1, type: "test.echo", payload: { text: 1 } };
    expect(bad).toBeDefined();
  });

  it("infers the error message type", () => {
    type ErrorMessage = MessageOf<typeof errorEvent>;
    expectTypeOf<ErrorMessage["payload"]["code"]>().toEqualTypeOf<(typeof ERROR_CODES)[number]>();
    expectTypeOf<ErrorMessage["payload"]["message"]>().toEqualTypeOf<string>();
    expectTypeOf<ErrorMessage["payload"]["replyTo"]>().toEqualTypeOf<string | undefined>();
  });

  it.each(["room.join", "playback.seek", "chat.send", "error"])("accepts type %s", (type) => {
    expect(() => defineEvent({ type, direction: "client", payload: {} })).not.toThrow();
  });

  it.each(["Room.join", "room", "room.join.now", "room_join", "room.", ".join", "1room.join", ""])(
    "rejects type %j",
    (type) => {
      expect(() => defineEvent({ type, direction: "client", payload: {} })).toThrow();
    },
  );

  it("rejects unknown keys for client direction, at envelope and payload level", () => {
    const valid = { v: 1, type: "test.echo", payload: { text: "hi" } };
    expect(echo.envelope.safeParse(valid).success).toBe(true);
    expect(echo.envelope.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(echo.envelope.safeParse({ ...valid, payload: { text: "hi", extra: 1 } }).success).toBe(
      false,
    );
  });

  it("strips unknown keys for server direction, at envelope and payload level", () => {
    const result = notice.envelope.safeParse({
      v: 1,
      type: "test.notice",
      extra: 1,
      payload: { text: "hi", extra: 2 },
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ v: 1, type: "test.notice", payload: { text: "hi" } });
  });

  it("rejects an empty or over-long id", () => {
    const base = { v: 1, type: "test.echo", payload: { text: "hi" } };
    expect(echo.envelope.safeParse({ ...base, id: "" }).success).toBe(false);
    expect(echo.envelope.safeParse({ ...base, id: "x".repeat(65) }).success).toBe(false);
    expect(echo.envelope.safeParse({ ...base, id: "x".repeat(64) }).success).toBe(true);
  });
});
