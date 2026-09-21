import { describe, expect, it } from "vitest";
import type { PlaybackState } from "@couch/contracts";
import { computeExpectedPosition, isNewerRevision } from "./index";

const T0 = 1_700_000_000_000;

const make = (overrides: Partial<PlaybackState> = {}): PlaybackState => ({
  status: "playing",
  position: 10,
  playbackRate: 1,
  revision: 1,
  serverTimestamp: T0,
  ...overrides,
});

type Case = {
  name: string;
  state?: Partial<PlaybackState>;
  nowMs: number;
  durationSeconds?: number;
  expected: number;
};

const cases: Case[] = [
  // Paused
  { name: "paused returns the position", state: { status: "paused" }, nowMs: T0 + 5_000, expected: 10 },
  {
    name: "paused ignores a rate and a long elapsed time",
    state: { status: "paused", playbackRate: 2 },
    nowMs: T0 + 3_600_000,
    expected: 10,
  },

  // Playing at different rates
  { name: "playing at rate 1", nowMs: T0 + 5_000, expected: 15 },
  { name: "playing at rate 0.5", state: { playbackRate: 0.5 }, nowMs: T0 + 10_000, expected: 15 },
  { name: "playing at rate 2", state: { playbackRate: 2 }, nowMs: T0 + 10_000, expected: 30 },
  { name: "playing with a fractional second", nowMs: T0 + 1_500, expected: 11.5 },

  // Elapsed zero and clock skew
  { name: "elapsed zero", nowMs: T0, expected: 10 },
  { name: "negative elapsed (skew) counts as zero", nowMs: T0 - 5_000, expected: 10 },
  { name: "negative elapsed by 1 ms counts as zero", nowMs: T0 - 1, expected: 10 },
  { name: "now of 0 (far before the timestamp)", nowMs: 0, expected: 10 },
  { name: "negative now", nowMs: -1_000, expected: 10 },

  // Non-finite now
  { name: "NaN now counts as zero elapsed", nowMs: Number.NaN, expected: 10 },
  { name: "Infinity now counts as zero elapsed", nowMs: Number.POSITIVE_INFINITY, expected: 10 },
  { name: "-Infinity now counts as zero elapsed", nowMs: Number.NEGATIVE_INFINITY, expected: 10 },
  {
    name: "NaN now, paused",
    state: { status: "paused" },
    nowMs: Number.NaN,
    expected: 10,
  },

  // Clamp to duration
  { name: "clamps to duration while playing", nowMs: T0 + 100_000, durationSeconds: 60, expected: 60 },
  {
    name: "clamps to duration while paused",
    state: { status: "paused", position: 100 },
    nowMs: T0,
    durationSeconds: 60,
    expected: 60,
  },
  { name: "duration equal to the result", nowMs: T0 + 5_000, durationSeconds: 15, expected: 15 },
  { name: "duration above the result changes nothing", nowMs: T0 + 5_000, durationSeconds: 600, expected: 15 },
  { name: "duration 0 clamps to 0", nowMs: T0 + 5_000, durationSeconds: 0, expected: 0 },
  {
    name: "clamp applies with non-finite now",
    state: { position: 100 },
    nowMs: Number.NaN,
    durationSeconds: 60,
    expected: 60,
  },

  // Invalid duration is ignored
  { name: "NaN duration is ignored", nowMs: T0 + 5_000, durationSeconds: Number.NaN, expected: 15 },
  { name: "negative duration is ignored", nowMs: T0 + 5_000, durationSeconds: -1, expected: 15 },
  {
    name: "Infinity duration is ignored",
    nowMs: T0 + 5_000,
    durationSeconds: Number.POSITIVE_INFINITY,
    expected: 15,
  },
  {
    name: "-Infinity duration is ignored",
    nowMs: T0 + 5_000,
    durationSeconds: Number.NEGATIVE_INFINITY,
    expected: 15,
  },
  {
    name: "invalid duration is ignored while paused",
    state: { status: "paused" },
    nowMs: T0 + 5_000,
    durationSeconds: Number.NaN,
    expected: 10,
  },

  // Floor at 0
  { name: "position 0 stays 0 with skew", state: { position: 0 }, nowMs: T0 - 5_000, expected: 0 },
  { name: "position 0 playing advances", state: { position: 0 }, nowMs: T0 + 2_000, expected: 2 },
  {
    name: "a negative position is floored to 0 while paused",
    state: { status: "paused", position: -5 },
    nowMs: T0,
    expected: 0,
  },
  {
    name: "a negative position is floored to 0 while playing",
    state: { position: -5 },
    nowMs: T0 + 1_000,
    expected: 0,
  },
  {
    name: "negative zero position returns positive zero",
    state: { status: "paused", position: -0 },
    nowMs: T0,
    expected: 0,
  },

  // Large elapsed values
  {
    name: "one day of elapsed time",
    nowMs: T0 + 86_400_000,
    expected: 10 + 86_400,
  },
  {
    name: "large elapsed at rate 2",
    state: { playbackRate: 2 },
    nowMs: T0 + 1e15,
    expected: 10 + 2e12,
  },
  {
    name: "large elapsed clamps to duration",
    nowMs: T0 + 1e15,
    durationSeconds: 7_200,
    expected: 7_200,
  },
  {
    name: "the largest finite now still returns a finite number",
    state: { playbackRate: 2 },
    nowMs: Number.MAX_VALUE,
    expected: 10 + (Number.MAX_VALUE - T0) / 1000 * 2,
  },
];

describe("computeExpectedPosition", () => {
  it.each(cases)("$name", ({ state, nowMs, durationSeconds, expected }) => {
    const options = durationSeconds === undefined ? undefined : { durationSeconds };
    expect(computeExpectedPosition(make(state), nowMs, options)).toBe(expected);
  });

  it("treats an empty options object like no options", () => {
    expect(computeExpectedPosition(make(), T0 + 5_000, {})).toBe(15);
    expect(computeExpectedPosition(make(), T0 + 5_000, { durationSeconds: undefined })).toBe(15);
  });

  it("does not modify the state it is given", () => {
    const state = make();
    const copy = { ...state };
    computeExpectedPosition(state, T0 + 5_000, { durationSeconds: 12 });
    expect(state).toEqual(copy);
  });
});

describe("computeExpectedPosition invariants", () => {
  const nowOffsets = [
    -1e12, -86_400_000, -5_000, -1, 0, 1, 16, 250, 1_000, 1_500, 5_000, 33_333, 60_000,
    3_600_000, 86_400_000, 1e12, 1e15,
  ];
  const positions = [0, 0.25, 10, 3_600.5, 86_400];
  const rates = [0.5, 0.75, 1, 1.25, 2];
  const durations: (number | undefined)[] = [
    undefined,
    0,
    30,
    7_200,
    86_400,
    Number.NaN,
    -1,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  const badNows = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

  it("never decreases while playing as serverNowMs increases", () => {
    let checked = 0;
    for (const position of positions) {
      for (const playbackRate of rates) {
        for (const durationSeconds of durations) {
          const state = make({ position, playbackRate });
          let previous = -Infinity;
          for (const offset of nowOffsets) {
            const result = computeExpectedPosition(state, T0 + offset, { durationSeconds });
            expect(result).toBeGreaterThanOrEqual(previous);
            previous = result;
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(
      positions.length * rates.length * durations.length * nowOffsets.length,
    );
  });

  it("equals state.position when serverNowMs equals serverTimestamp", () => {
    for (const position of positions) {
      for (const playbackRate of rates) {
        for (const status of ["playing", "paused"] as const) {
          const state = make({ status, position, playbackRate });
          expect(computeExpectedPosition(state, T0)).toBe(position);
        }
      }
    }
  });

  it("is always finite and at least 0", () => {
    const nows = [...nowOffsets.map((offset) => T0 + offset), ...badNows, Number.MAX_VALUE];
    for (const status of ["playing", "paused"] as const) {
      for (const position of positions) {
        for (const playbackRate of rates) {
          for (const durationSeconds of durations) {
            for (const now of nows) {
              const result = computeExpectedPosition(make({ status, position, playbackRate }), now, {
                durationSeconds,
              });
              expect(Number.isFinite(result)).toBe(true);
              expect(result).toBeGreaterThanOrEqual(0);
            }
          }
        }
      }
    }
  });

  it("never exceeds a valid duration", () => {
    for (const status of ["playing", "paused"] as const) {
      for (const position of positions) {
        for (const offset of nowOffsets) {
          for (const durationSeconds of [0, 30, 7_200]) {
            const result = computeExpectedPosition(
              make({ status, position }),
              T0 + offset,
              { durationSeconds },
            );
            expect(result).toBeLessThanOrEqual(durationSeconds);
          }
        }
      }
    }
  });
});

describe("isNewerRevision", () => {
  it.each([
    { name: "greater", candidate: 5, current: 4, expected: true },
    { name: "greater by a lot", candidate: 1_000_000, current: 0, expected: true },
    { name: "equal", candidate: 4, current: 4, expected: false },
    { name: "equal at zero", candidate: 0, current: 0, expected: false },
    { name: "lesser", candidate: 3, current: 4, expected: false },
    { name: "lesser than a higher current", candidate: 0, current: 1, expected: false },
    { name: "NaN candidate", candidate: Number.NaN, current: 4, expected: false },
    { name: "NaN current", candidate: 5, current: Number.NaN, expected: false },
  ])("$name", ({ candidate, current, expected }) => {
    expect(isNewerRevision(candidate, current)).toBe(expected);
  });
});
