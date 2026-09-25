import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_ID_LENGTH,
  MAX_SERVER_MESSAGE_BYTES,
  MEDIA_LIMITS,
  ROOM_MEMBERS_MAX,
  USER_ID_MAX_LENGTH,
  COUCH_ID_MAX_LENGTH,
  COUCH_NAME_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  clientEvents,
  isKnownErrorCode,
  parseMessage,
  serverEvents,
  utf8ByteLength,
  type AnyEvent,
  type ParseResult,
} from "./index";
import {
  ASCII_CHAR,
  FOUR_BYTE_CHAR,
  maxCatalogMedia,
  playbackState,
  validPayloads,
} from "./test-fixtures";

const json = (value: unknown) => JSON.stringify(value);

function code(result: ParseResult<unknown>) {
  if (result.ok) throw new Error("expected ok:false");
  return result.error.code;
}

const catalogs: [string, readonly AnyEvent[]][] = [
  ["clientEvents", clientEvents],
  ["serverEvents", serverEvents],
];

describe("the message catalog", () => {
  it("lists the documented events", () => {
    expect(clientEvents.map((event) => event.type).sort()).toEqual(
      [
        "room.join",
        "room.leave",
        "chat.send",
        "room.setMedia",
        "room.kick",
        "playback.play",
        "playback.pause",
        "playback.seek",
        "playback.setRate",
        "playback.setAccess",
      ].sort(),
    );
    expect(serverEvents.map((event) => event.type).sort()).toEqual(
      [
        "room.state",
        "room.mediaChanged",
        "room.memberJoined",
        "room.memberLeft",
        "presence.update",
        "chat.message",
        "room.kicked",
        "playback.sync",
        "playback.accessChanged",
        "error",
      ].sort(),
    );
  });

  it("puts every event in the array that matches its direction", () => {
    for (const event of clientEvents) expect(event.direction, event.type).toBe("client");
    for (const event of serverEvents) expect(event.direction, event.type).toBe("server");
  });

  it("has a valid example for every event, and no example for anything else", () => {
    const types = [...clientEvents, ...serverEvents].map((event) => event.type).sort();
    expect(Object.keys(validPayloads).sort()).toEqual(types);
  });

  describe.each(catalogs)("%s", (_name, events) => {
    describe.each(events.map((event) => [event.type, event] as const))("%s", (type, event) => {
      const valid = validPayloads[type];
      const parse = (raw: string) => parseMessage(raw, events);

      it("round-trips a valid example, with and without an id", () => {
        const bare = { v: 1, type, payload: valid };
        const withId = { ...bare, id: "c-1" };
        expect(parse(json(bare))).toEqual({ ok: true, data: bare });
        expect(parse(json(withId))).toEqual({ ok: true, data: withId });
      });

      if (event.direction === "client") {
        it("rejects an extra key in the payload", () => {
          const raw = json({ v: 1, type, payload: { ...(valid as object), extraKey: 1 } });
          expect(code(parse(raw))).toBe("invalid_payload");
        });

        it("rejects an extra key in the envelope", () => {
          const raw = json({ v: 1, type, payload: valid, extraKey: 1 });
          expect(code(parse(raw))).toBe("invalid_payload");
        });
      } else {
        // Every server payload is an object, so stripping applies to every server event.
        it("strips an extra key from the payload", () => {
          const raw = json({ v: 1, type, payload: { ...(valid as object), extraKey: 1 } });
          expect(parse(raw)).toEqual({ ok: true, data: { v: 1, type, payload: valid } });
        });

        it("strips an extra key from the envelope", () => {
          const raw = json({ v: 1, type, payload: valid, extraKey: 1 });
          expect(parse(raw)).toEqual({ ok: true, data: { v: 1, type, payload: valid } });
        });
      }
    });

    it("reports an unknown type as unknown_type", () => {
      expect(code(parseMessage(json({ v: 1, type: "nope.nothing", payload: {} }), events))).toBe(
        "unknown_type",
      );
    });
  });

  it("does not accept a message from the wrong direction", () => {
    for (const event of serverEvents) {
      const raw = json({ v: 1, type: event.type, payload: validPayloads[event.type] });
      expect(code(parseMessage(raw, clientEvents)), event.type).toBe("unknown_type");
    }
    for (const event of clientEvents) {
      const raw = json({ v: 1, type: event.type, payload: validPayloads[event.type] });
      expect(code(parseMessage(raw, serverEvents)), event.type).toBe("unknown_type");
    }
  });

  it("has no duplicate type, and no two types that differ only by case", () => {
    const types = [...clientEvents, ...serverEvents].map((event) => event.type);
    expect(new Set(types).size, "a type appears twice").toBe(types.length);
    const lowered = types.map((type) => type.toLowerCase());
    expect(new Set(lowered).size, "two types differ only by case").toBe(types.length);
  });

  it("never lets a client payload carry the sender's identity", () => {
    // room.kick.userId names the member to remove, so it is the one allowed userId.
    const identityKeys = ["userId", "sender", "role", "displayName", "sentAt", "timestamp"];
    for (const event of clientEvents) {
      const keys = Object.keys(event.payload.shape);
      for (const key of identityKeys) {
        if (event.type === "room.kick" && key === "userId") continue;
        expect(keys, `${event.type} must not have a ${key} key`).not.toContain(key);
      }
    }
  });
});

describe("error codes", () => {
  it.each(["not_a_member", "not_joined", "forbidden", "couch_not_found", "media_unavailable", "already_joined", "internal_error", "host_cannot_leave", "cannot_remove_self"])(
    "%s is a known code and round-trips in an error event",
    (errorCode) => {
      expect(isKnownErrorCode(errorCode)).toBe(true);
      const message = { v: 1, type: "error", payload: { code: errorCode, message: "m" } };
      expect(parseMessage(json(message), serverEvents)).toEqual({ ok: true, data: message });
    },
  );

  it("has no duplicate code", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});

describe("worst-case room.state size", () => {
  // Every free-text field and every id is filled to its maximum with `char`. The parts the
  // schema restricts to ASCII stay ASCII: the role and boolean literals, each url prefix and
  // providerId (a slug).
  function worstCase(char: string) {
    const at = (length: number) => char.repeat(length);
    const member = {
      userId: at(USER_ID_MAX_LENGTH),
      displayName: at(DISPLAY_NAME_MAX_LENGTH),
      role: "participant", // the longer of the two roles
      online: false, // the longer of the two booleans
    };
    const message = {
      v: 1,
      type: "room.state",
      id: at(MAX_ID_LENGTH),
      payload: {
        couch: { id: at(COUCH_ID_MAX_LENGTH), name: at(COUCH_NAME_MAX_LENGTH) },
        self: { userId: at(USER_ID_MAX_LENGTH), role: "participant" },
        members: Array.from({ length: ROOM_MEMBERS_MAX }, () => member),
        media: maxCatalogMedia(char),
        playback: {
          ...playbackState,
          position: 86_399.999_999_999_99,
          playbackRate: 1.999_999_999_999_999_8,
          revision: Number.MAX_SAFE_INTEGER,
          serverTimestamp: Number.MAX_SAFE_INTEGER,
        },
        playbackAccess: "open", // the longer of the two modes
      },
    };
    const raw = json(message);
    return { message, raw, bytes: utf8ByteLength(raw) };
  }

  const ascii = worstCase(ASCII_CHAR);
  const fourByte = worstCase(FOUR_BYTE_CHAR);

  describe.each([
    ["ASCII", ascii],
    ["4-byte characters", fourByte],
  ])("with %s", (_name, { message, raw, bytes }) => {
    it(`is ${bytes} bytes, under the ${MAX_SERVER_MESSAGE_BYTES} byte server cap`, () => {
      expect(bytes).toBeLessThan(MAX_SERVER_MESSAGE_BYTES);
    });

    it("is accepted by parseMessage with every field intact", () => {
      expect(parseMessage(raw, serverEvents)).toEqual({ ok: true, data: message });
    });

    it("has exactly ROOM_MEMBERS_MAX members and full-length fields, counted in code points", () => {
      const codePoints = (text: string) => Array.from(text).length;
      expect(message.payload.members).toHaveLength(ROOM_MEMBERS_MAX);
      expect(codePoints(message.payload.media.title)).toBe(MEDIA_LIMITS.title);
      expect(codePoints(message.payload.media.description!)).toBe(MEDIA_LIMITS.description);
      expect(codePoints(message.payload.members[0]!.displayName)).toBe(DISPLAY_NAME_MAX_LENGTH);
      expect(codePoints(message.payload.couch.name)).toBe(COUCH_NAME_MAX_LENGTH);
      expect(codePoints(message.payload.self.userId)).toBe(USER_ID_MAX_LENGTH);
    });
  });

  it(`fits the ${MAX_CLIENT_MESSAGE_BYTES} byte client cap with ASCII, at ${ascii.bytes} bytes`, () => {
    expect(ascii.bytes).toBeLessThan(MAX_CLIENT_MESSAGE_BYTES);
  });

  it(`exceeds the ${MAX_CLIENT_MESSAGE_BYTES} byte client cap with 4-byte characters, at ${fourByte.bytes} bytes`, () => {
    expect(fourByte.bytes).toBeGreaterThan(MAX_CLIENT_MESSAGE_BYTES);
  });

  it("is rejected by the client-direction parser and accepted by the server-direction parser", () => {
    // The same oversized, otherwise valid message: only the direction's cap differs.
    expect(code(parseMessage(fourByte.raw, clientEvents))).toBe("message_too_large");
    expect(parseMessage(fourByte.raw, serverEvents).ok).toBe(true);
  });
});
