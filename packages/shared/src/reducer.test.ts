import { describe, expect, it } from "vitest";
import {
  PLAYBACK_POSITION_MAX_SECONDS,
  PLAYBACK_RATE_MAX,
  PLAYBACK_RATE_MIN,
  playbackStateSchema,
  type PlaybackState,
} from "@couch/contracts";
import {
  INITIAL_REVISION,
  POSITION_MAX_SECONDS,
  applyPause,
  applyPlay,
  applySeek,
  applySetRate,
  createInitialPlaybackState,
  isNewerRevision,
} from "./index";

const T0 = 1_700_000_000_000;
const NOW = T0 + 5_000;

const make = (o: Partial<PlaybackState> = {}): PlaybackState => ({
  status: "paused",
  position: 10,
  playbackRate: 1,
  revision: 7,
  serverTimestamp: T0,
  ...o,
});

describe("constants", () => {
  it("POSITION_MAX_SECONDS matches the contracts constant", () => {
    expect(POSITION_MAX_SECONDS).toBe(PLAYBACK_POSITION_MAX_SECONDS);
  });
});

describe("createInitialPlaybackState", () => {
  it("is paused at 0, normal speed, initial revision, stamped with the given time", () => {
    expect(createInitialPlaybackState(NOW)).toEqual({
      status: "paused",
      position: 0,
      playbackRate: 1,
      revision: INITIAL_REVISION,
      serverTimestamp: NOW,
    });
  });
  it("satisfies the contracts schema", () => {
    expect(playbackStateSchema.safeParse(createInitialPlaybackState(NOW)).success).toBe(true);
  });
});

type PosCase = { name: string; position: number; expectedPosition: number };

const positionCases: PosCase[] = [
  { name: "normal position", position: 42.5, expectedPosition: 42.5 },
  { name: "position 0", position: 0, expectedPosition: 0 },
  {
    name: "position at the sane maximum",
    position: PLAYBACK_POSITION_MAX_SECONDS,
    expectedPosition: PLAYBACK_POSITION_MAX_SECONDS,
  },
  { name: "negative position clamps to 0", position: -5, expectedPosition: 0 },
  { name: "-Infinity clamps to 0", position: -Infinity, expectedPosition: 0 },
  { name: "NaN becomes 0", position: NaN, expectedPosition: 0 },
  {
    name: "absurdly large position clamps to the maximum",
    position: 1e12,
    expectedPosition: PLAYBACK_POSITION_MAX_SECONDS,
  },
  {
    name: "Infinity clamps to the maximum",
    position: Infinity,
    expectedPosition: PLAYBACK_POSITION_MAX_SECONDS,
  },
];

const fromStates: [string, Partial<PlaybackState>][] = [
  ["paused", { status: "paused" }],
  ["playing", { status: "playing", playbackRate: 1.5 }],
];

describe.each([
  ["applyPlay", applyPlay, "playing"],
  ["applyPause", applyPause, "paused"],
  ["applySeek", applySeek, undefined],
] as const)("%s", (_name, fn, forcedStatus) => {
  describe.each(fromStates)("from %s", (_label, from) => {
    it.each(positionCases)("$name", ({ position, expectedPosition }) => {
      const before = make(from);
      const after = fn(before, { position }, NOW);
      expect(after).toEqual({
        ...before,
        status: forcedStatus ?? before.status,
        position: expectedPosition,
        revision: 8,
        serverTimestamp: NOW,
      });
    });
  });
});

describe("applySetRate", () => {
  it.each([
    ["normal rate", 1.25],
    ["minimum rate", PLAYBACK_RATE_MIN],
    ["maximum rate", PLAYBACK_RATE_MAX],
  ])("paused: %s changes only the rate, revision and timestamp", (_n, rate) => {
    const before = make({ status: "paused" });
    expect(applySetRate(before, { rate }, NOW)).toEqual({
      ...before,
      playbackRate: rate,
      revision: 8,
      serverTimestamp: NOW,
    });
  });

  it("playing: advances the position at the OLD rate before switching", () => {
    const before = make({ status: "playing", position: 10, playbackRate: 2 });
    const after = applySetRate(before, { rate: 0.5 }, NOW); // 5 s elapsed at 2x = +10 s
    expect(after.position).toBe(20);
    expect(after.playbackRate).toBe(0.5);
    expect(after.status).toBe("playing");
    expect(after.serverTimestamp).toBe(NOW);
  });

  it("playing: a clock earlier than the last change adds no elapsed time", () => {
    const before = make({ status: "playing", position: 10 });
    expect(applySetRate(before, { rate: 2 }, T0 - 1_000).position).toBe(10);
  });

  it("playing: the advanced position never exceeds the maximum", () => {
    const before = make({
      status: "playing",
      position: PLAYBACK_POSITION_MAX_SECONDS - 1,
      playbackRate: 2,
    });
    expect(applySetRate(before, { rate: 1 }, NOW).position).toBe(PLAYBACK_POSITION_MAX_SECONDS);
  });
});

describe("purity", () => {
  it("does not modify its input", () => {
    const before = Object.freeze(make({ status: "playing" }));
    const copy = { ...before };
    applyPlay(before, { position: 1 }, NOW);
    applyPause(before, { position: 1 }, NOW);
    applySeek(before, { position: 1 }, NOW);
    applySetRate(before, { rate: 2 }, NOW);
    expect(before).toEqual(copy);
  });
  it("returns a new object", () => {
    const before = make();
    expect(applySeek(before, { position: 10 }, NOW)).not.toBe(before);
  });
  it("same inputs always give the same output", () => {
    const before = make({ status: "playing" });
    expect(applySetRate(before, { rate: 1.5 }, NOW)).toEqual(
      applySetRate(before, { rate: 1.5 }, NOW),
    );
    expect(applyPlay(before, { position: 3 }, NOW)).toEqual(applyPlay(before, { position: 3 }, NOW));
  });
});

describe("revision invariant", () => {
  // Small deterministic generator, so the test needs neither Math.random nor a dependency.
  const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;

  it("increases by exactly 1 per call, across 5000 random calls, and stays valid", () => {
    const rand = lcg(12345);
    let state = createInitialPlaybackState(T0);
    let now = T0;
    for (let i = 0; i < 5000; i++) {
      const previous = state;
      now += Math.floor(rand() * 10_000);
      const position = rand() * PLAYBACK_POSITION_MAX_SECONDS * 1.2 - 100;
      const rate = PLAYBACK_RATE_MIN + rand() * (PLAYBACK_RATE_MAX - PLAYBACK_RATE_MIN);
      const pick = Math.floor(rand() * 4);
      state =
        pick === 0
          ? applyPlay(state, { position }, now)
          : pick === 1
            ? applyPause(state, { position }, now)
            : pick === 2
              ? applySeek(state, { position }, now)
              : applySetRate(state, { rate }, now);
      expect(state.revision).toBe(previous.revision + 1);
      expect(isNewerRevision(state.revision, previous.revision)).toBe(true);
      expect(state.serverTimestamp).toBe(now);
      expect(playbackStateSchema.safeParse(state).success).toBe(true);
    }
    expect(state.revision).toBe(INITIAL_REVISION + 5000);
  });
});
