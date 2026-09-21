import type { PlaybackState } from "@couch/contracts";

/** Options for {@link computeExpectedPosition}. */
export type ExpectedPositionOptions = {
  /**
   * Length of the media in SECONDS. When it is a finite number of at least 0, the result
   * is clamped to it. Any other value (NaN, a negative number, Infinity) is ignored.
   */
  durationSeconds?: number;
};

/**
 * The position, in SECONDS from the start of the media, that a room's playback should be
 * at right now.
 *
 * Units: `state.position` is seconds. `state.serverTimestamp` and `serverNowMs` are epoch
 * MILLISECONDS on the SERVER clock. This function never reads a clock. The caller converts
 * its own local clock to server time and passes the result in.
 *
 * - Paused: returns `state.position`.
 * - Playing: `state.position` plus the elapsed server time in seconds times
 *   `state.playbackRate`.
 *
 * Guarantees, for a `state` that passed the contract schema:
 *
 * - Elapsed time is never negative. If `serverNowMs` is earlier than `serverTimestamp`
 *   (clock skew), elapsed time is treated as 0.
 * - If `serverNowMs` is not a finite number (NaN, Infinity or -Infinity), elapsed time is
 *   treated as 0, so the result is never NaN or Infinity.
 * - The result is never below 0.
 * - If `options.durationSeconds` is a finite number of at least 0, the result is clamped
 *   to it, whether playing or paused. An invalid `durationSeconds` is ignored.
 * - While playing at a rate above 0, the result never decreases as `serverNowMs` grows.
 */
export function computeExpectedPosition(
  state: PlaybackState,
  serverNowMs: number,
  options?: ExpectedPositionOptions,
): number {
  let position = state.position;

  if (state.status === "playing") {
    const elapsedMs = Number.isFinite(serverNowMs)
      ? Math.max(0, serverNowMs - state.serverTimestamp)
      : 0;
    position += (elapsedMs / 1000) * state.playbackRate;
  }

  position = Math.max(0, position);

  const duration = options?.durationSeconds;
  if (typeof duration === "number" && Number.isFinite(duration) && duration >= 0) {
    position = Math.min(position, duration);
  }

  return position;
}

/**
 * True when `candidate` is strictly greater than `current`. A client applies a
 * `playback.sync` only when it is newer than the revision it holds: a lower revision is
 * stale, and an equal one is a repeat that changes nothing. A NaN on either side is not
 * newer.
 */
export function isNewerRevision(candidate: number, current: number): boolean {
  return candidate > current;
}
