import { describe, expect, it } from "vitest";
import {
  PLAYBACK_POSITION_MAX_SECONDS,
  PLAYBACK_RATE_MAX,
  PLAYBACK_RATE_MIN,
  parseMessage,
  PLAYBACK_ACCESS_MODES,
  playbackClientEvents,
  playbackServerEvents,
  playbackStateSchema,
  type ParseResult,
  type PlaybackClientMessage,
  type PlaybackState,
} from "./index";

const json = (value: unknown) => JSON.stringify(value);
const state: PlaybackState = {
  status: "playing",
  position: 12.5,
  playbackRate: 1,
  revision: 3,
  serverTimestamp: 1_700_000_000_000,
};

const parseClient = (raw: string) => parseMessage(raw, playbackClientEvents);
const parseServer = (raw: string) => parseMessage(raw, playbackServerEvents);
const command = (type: string, payload: unknown) => json({ v: 1, type, payload });
const sync = (payload: unknown) => json({ v: 1, type: "playback.sync", payload });

function code(result: ParseResult<unknown>) {
  if (result.ok) throw new Error("expected ok:false");
  return result.error.code;
}

describe("playbackStateSchema", () => {
  it("accepts a valid state", () => {
    expect(playbackStateSchema.safeParse(state).success).toBe(true);
  });

  it("accepts both statuses and rejects any other", () => {
    expect(playbackStateSchema.safeParse({ ...state, status: "paused" }).success).toBe(true);
    expect(playbackStateSchema.safeParse({ ...state, status: "buffering" }).success).toBe(false);
  });

  describe("position", () => {
    it("accepts 0 and the cap", () => {
      expect(playbackStateSchema.safeParse({ ...state, position: 0 }).success).toBe(true);
      const atCap = { ...state, position: PLAYBACK_POSITION_MAX_SECONDS };
      expect(playbackStateSchema.safeParse(atCap).success).toBe(true);
    });

    it.each([
      ["negative", -1],
      ["above the cap", PLAYBACK_POSITION_MAX_SECONDS + 0.001],
      ["NaN", NaN],
      ["Infinity", Infinity],
      ["-Infinity", -Infinity],
      ["a string", "5"],
    ])("rejects %s", (_name, position) => {
      expect(playbackStateSchema.safeParse({ ...state, position }).success).toBe(false);
    });
  });

  describe("playbackRate", () => {
    it("accepts exactly the bounds", () => {
      const min = { ...state, playbackRate: PLAYBACK_RATE_MIN };
      const max = { ...state, playbackRate: PLAYBACK_RATE_MAX };
      expect(playbackStateSchema.safeParse(min).success).toBe(true);
      expect(playbackStateSchema.safeParse(max).success).toBe(true);
    });

    it.each([
      ["just below the minimum", PLAYBACK_RATE_MIN - 0.01],
      ["just above the maximum", PLAYBACK_RATE_MAX + 0.01],
      ["zero", 0],
      ["negative", -1],
      ["NaN", NaN],
      ["Infinity", Infinity],
    ])("rejects %s", (_name, playbackRate) => {
      expect(playbackStateSchema.safeParse({ ...state, playbackRate }).success).toBe(false);
    });
  });

  describe.each(["revision", "serverTimestamp"] as const)("%s", (field) => {
    it("accepts 0 and the largest safe integer", () => {
      expect(playbackStateSchema.safeParse({ ...state, [field]: 0 }).success).toBe(true);
      const max = { ...state, [field]: Number.MAX_SAFE_INTEGER };
      expect(playbackStateSchema.safeParse(max).success).toBe(true);
    });

    it.each([
      ["a non-integer", 1.5],
      ["negative", -1],
      ["above the safe integer range", Number.MAX_SAFE_INTEGER + 1],
      ["NaN", NaN],
      ["Infinity", Infinity],
    ])("rejects %s", (_name, value) => {
      expect(playbackStateSchema.safeParse({ ...state, [field]: value }).success).toBe(false);
    });
  });

  it("rejects a missing field", () => {
    const rest: Partial<PlaybackState> = { ...state };
    delete rest.revision;
    expect(playbackStateSchema.safeParse(rest).success).toBe(false);
  });
});

describe("client commands", () => {
  const positionCommands = ["playback.play", "playback.pause", "playback.seek"] as const;

  describe.each(positionCommands)("%s", (type) => {
    it("round-trips through parseMessage", () => {
      const message = { v: 1, type, id: "c-1", payload: { position: 42.25 } };
      expect(parseClient(json(message))).toEqual({ ok: true, data: message });
    });

    it("accepts position 0 and the cap", () => {
      expect(parseClient(command(type, { position: 0 })).ok).toBe(true);
      expect(parseClient(command(type, { position: PLAYBACK_POSITION_MAX_SECONDS })).ok).toBe(
        true,
      );
    });

    it.each([
      ["negative", -0.5],
      ["above the cap", PLAYBACK_POSITION_MAX_SECONDS + 1],
      ["a string", "1"],
      ["null", null],
    ])("rejects %s with invalid_payload", (_name, position) => {
      expect(code(parseClient(command(type, { position })))).toBe("invalid_payload");
    });

    it("rejects a missing position", () => {
      expect(code(parseClient(command(type, {})))).toBe("invalid_payload");
    });

    it("rejects 1e999 in raw JSON, which parses to Infinity", () => {
      const raw = `{"v":1,"type":"${type}","payload":{"position":1e999}}`;
      expect(JSON.parse(raw).payload.position).toBe(Infinity);
      expect(code(parseClient(raw))).toBe("invalid_payload");
    });

    it("rejects an extra payload key", () => {
      expect(code(parseClient(command(type, { position: 1, userId: "u1" })))).toBe(
        "invalid_payload",
      );
    });

    it.each(["revision", "serverTimestamp", "userId", "role"])(
      "rejects the forbidden payload key %s",
      (key) => {
        expect(code(parseClient(command(type, { position: 1, [key]: 1 })))).toBe(
          "invalid_payload",
        );
      },
    );

    it("rejects an extra envelope key", () => {
      const raw = json({ v: 1, type, payload: { position: 1 }, userId: "u1" });
      expect(code(parseClient(raw))).toBe("invalid_payload");
    });
  });

  describe("playback.setRate", () => {
    it("round-trips through parseMessage", () => {
      const message = { v: 1, type: "playback.setRate", payload: { rate: 1.5 } };
      expect(parseClient(json(message))).toEqual({ ok: true, data: message });
    });

    it("accepts exactly the bounds", () => {
      expect(parseClient(command("playback.setRate", { rate: PLAYBACK_RATE_MIN })).ok).toBe(true);
      expect(parseClient(command("playback.setRate", { rate: PLAYBACK_RATE_MAX })).ok).toBe(true);
    });

    it.each([
      ["just below the minimum", PLAYBACK_RATE_MIN - 0.01],
      ["just above the maximum", PLAYBACK_RATE_MAX + 0.01],
      ["zero", 0],
      ["negative", -1],
      ["a string", "1"],
    ])("rejects %s with invalid_payload", (_name, rate) => {
      expect(code(parseClient(command("playback.setRate", { rate })))).toBe("invalid_payload");
    });

    it("rejects 1e999 in raw JSON", () => {
      const raw = '{"v":1,"type":"playback.setRate","payload":{"rate":1e999}}';
      expect(code(parseClient(raw))).toBe("invalid_payload");
    });

    it.each(["playback.setrate", "playback.SETRATE", "playback.SetRate", "Playback.setRate"])(
      "does not match the differently cased type %s",
      (type) => {
        expect(code(parseClient(command(type, { rate: 1 })))).toBe("unknown_type");
      },
    );

    it("rejects an extra key and a missing rate", () => {
      expect(code(parseClient(command("playback.setRate", { rate: 1, extra: 1 })))).toBe(
        "invalid_payload",
      );
      expect(code(parseClient(command("playback.setRate", {})))).toBe("invalid_payload");
    });
  });

  it("does not accept playback.sync from a client", () => {
    expect(code(parseClient(sync({ state })))).toBe("unknown_type");
  });

  it("types the parsed message as the union of commands", () => {
    const result = parseClient(command("playback.seek", { position: 3 }));
    if (!result.ok) throw new Error("expected ok:true");
    const message: PlaybackClientMessage = result.data;
    expect(message.type).toBe("playback.seek");
  });
});

describe("playback.sync", () => {
  it("round-trips through parseMessage", () => {
    const message = { v: 1, type: "playback.sync", payload: { state } };
    expect(parseServer(json(message))).toEqual({ ok: true, data: message });
  });

  it("strips unknown keys at every level", () => {
    const raw = json({
      v: 1,
      type: "playback.sync",
      extra: "top",
      payload: { note: "payload", state: { ...state, mediaId: "m1" } },
    });
    expect(parseServer(raw)).toEqual({
      ok: true,
      data: { v: 1, type: "playback.sync", payload: { state } },
    });
  });

  it("rejects an invalid state with invalid_payload", () => {
    expect(code(parseServer(sync({ state: { ...state, revision: -1 } })))).toBe(
      "invalid_payload",
    );
    expect(code(parseServer(sync({})))).toBe("invalid_payload");
  });

  it("rejects 1e999 in raw JSON inside the state", () => {
    const raw =
      '{"v":1,"type":"playback.sync","payload":{"state":{"status":"playing","position":1e999,' +
      '"playbackRate":1,"revision":1,"serverTimestamp":1}}}';
    expect(code(parseServer(raw))).toBe("invalid_payload");
  });

  it("rejects a revision above the safe integer range in raw JSON", () => {
    const raw =
      '{"v":1,"type":"playback.sync","payload":{"state":{"status":"paused","position":0,' +
      '"playbackRate":1,"revision":9007199254740993,"serverTimestamp":1}}}';
    expect(code(parseServer(raw))).toBe("invalid_payload");
  });
});

describe("playback access mode", () => {
  it("has exactly two values", () => {
    expect([...PLAYBACK_ACCESS_MODES]).toEqual(["open", "host"]);
  });

  describe("playback.setAccess (client)", () => {
    it.each(["open", "host"])("accepts mode %s", (mode) => {
      const message = { v: 1, type: "playback.setAccess", payload: { mode } };
      expect(parseClient(json(message))).toEqual({ ok: true, data: message });
    });

    it.each<[string, unknown]>([
      ["a missing mode", {}],
      ["an unknown mode", { mode: "everyone" }],
      ["a wrong-case mode", { mode: "HOST" }],
      ["a null mode", { mode: null }],
      ["a boolean mode", { mode: true }],
      ["an extra key", { mode: "host", userId: "u" }],
    ])("rejects %s", (_name, payload) => {
      expect(code(parseClient(command("playback.setAccess", payload)))).toBe("invalid_payload");
    });

    it("is not accepted from the server side", () => {
      expect(code(parseServer(command("playback.setAccess", { mode: "host" })))).toBe(
        "unknown_type",
      );
    });
  });

  describe("playback.accessChanged (server)", () => {
    it.each(["open", "host"])("accepts mode %s", (mode) => {
      const message = { v: 1, type: "playback.accessChanged", payload: { mode } };
      expect(parseServer(json(message))).toEqual({ ok: true, data: message });
    });

    it("strips an unknown key", () => {
      expect(parseServer(command("playback.accessChanged", { mode: "open", extra: 1 }))).toEqual({
        ok: true,
        data: { v: 1, type: "playback.accessChanged", payload: { mode: "open" } },
      });
    });

    it.each<[string, unknown]>([
      ["a missing mode", {}],
      ["an unknown mode", { mode: "nobody" }],
      ["a null mode", { mode: null }],
    ])("rejects %s", (_name, payload) => {
      expect(code(parseServer(command("playback.accessChanged", payload)))).toBe(
        "invalid_payload",
      );
    });

    it("is not accepted from the client side", () => {
      expect(code(parseClient(command("playback.accessChanged", { mode: "host" })))).toBe(
        "unknown_type",
      );
    });
  });
});
