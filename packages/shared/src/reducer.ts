import type { PlaybackState } from "@couch/contracts";

/**
 * Largest position a reducer accepts, in SECONDS. It mirrors `PLAYBACK_POSITION_MAX_SECONDS`
 * in `@couch/contracts`, which this package cannot import as a value (types only). A test
 * fails if the two ever differ.
 */
export const POSITION_MAX_SECONDS = 86_400;

/** The revision of a playback state that has just been created. The first command makes it 1. */
export const INITIAL_REVISION = 0;

/**
 * Bounds a client-reported position to 0 through {@link POSITION_MAX_SECONDS}, in SECONDS.
 * NaN becomes 0 and Infinity becomes the maximum, so the result is always a finite number
 * in range. The real media duration is not known here, so the caller may clamp further.
 */
function clampPosition(position: number): number {
  if (Number.isNaN(position)) return 0;
  return Math.min(Math.max(position, 0), POSITION_MAX_SECONDS);
}

/** Every reducer stamps the new revision and server time the same way. */
function next(
  state: PlaybackState,
  serverNowMs: number,
  change: Partial<PlaybackState>,
): PlaybackState {
  return {
    ...state,
    ...change,
    revision: state.revision + 1,
    serverTimestamp: serverNowMs,
  };
}

/**
 * The playback state of a room that was just created: paused at position 0, normal speed,
 * revision {@link INITIAL_REVISION}, stamped with `serverNowMs` (epoch MILLISECONDS, server
 * clock).
 */
export function createInitialPlaybackState(serverNowMs: number): PlaybackState {
  return {
    status: "paused",
    position: 0,
    playbackRate: 1,
    revision: INITIAL_REVISION,
    serverTimestamp: serverNowMs,
  };
}

/*
 * The reducers below return a new state and never modify their input. Each one adds exactly
 * 1 to `revision` and sets `serverTimestamp` to `serverNowMs`. They do no authorization:
 * the caller decides who may issue a command. Payloads are trusted to have passed the
 * contracts schema, except that a position is still clamped to 0 through
 * POSITION_MAX_SECONDS.
 */

/** Start or resume playback at `position` (SECONDS). */
export function applyPlay(
  state: PlaybackState,
  payload: { position: number },
  serverNowMs: number,
): PlaybackState {
  return next(state, serverNowMs, { status: "playing", position: clampPosition(payload.position) });
}

/** Pause playback at `position` (SECONDS). */
export function applyPause(
  state: PlaybackState,
  payload: { position: number },
  serverNowMs: number,
): PlaybackState {
  return next(state, serverNowMs, { status: "paused", position: clampPosition(payload.position) });
}

/** Jump to `position` (SECONDS). The status is unchanged. */
export function applySeek(
  state: PlaybackState,
  payload: { position: number },
  serverNowMs: number,
): PlaybackState {
  return next(state, serverNowMs, { position: clampPosition(payload.position) });
}

/**
 * Change the speed to `rate`, a multiplier of normal speed. The caller has already
 * validated it against the contracts schema, so it is not checked here.
 *
 * While playing, the position is first advanced to `serverNowMs` at the old rate, so the
 * new rate applies only from now on. Without this, the new rate would be applied
 * retroactively to the time since the last change.
 */
export function applySetRate(
  state: PlaybackState,
  payload: { rate: number },
  serverNowMs: number,
): PlaybackState {
  let position = state.position;
  if (state.status === "playing") {
    const elapsedMs = Number.isFinite(serverNowMs)
      ? Math.max(0, serverNowMs - state.serverTimestamp)
      : 0;
    position = clampPosition(position + (elapsedMs / 1000) * state.playbackRate);
  }
  return next(state, serverNowMs, { playbackRate: payload.rate, position });
}
