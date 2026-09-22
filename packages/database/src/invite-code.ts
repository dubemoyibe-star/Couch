import { randomInt } from "node:crypto";

// Invite code generation. The code is cryptographically random, URL-safe and
// long enough to be unguessable, generated server-side with Node's crypto
// module (never in packages/shared, which has no Node dependency).
//
// Alphabet: lowercase digits and letters, minus the five characters that are
// commonly confused with each other when read aloud or typed by hand: 0/o,
// 1/l/i. 36 possible characters (10 digits + 26 letters) minus those 5 leaves
// 31. Every character is URL-safe with no escaping needed.
export const INVITE_CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

// 31 characters: digits 2-9 (8) plus a-z minus i, l, o (23).
if (INVITE_CODE_ALPHABET.length !== 31) {
  throw new Error("INVITE_CODE_ALPHABET must have exactly 31 characters");
}

/**
 * Number of characters in a generated invite code.
 *
 * Entropy is `length * log2(alphabet size)`. With a 31-character alphabet,
 * log2(31) is about 4.954 bits per character, so 17 characters give about
 * 84.2 bits, above the 80-bit floor this package requires. Each extra
 * character adds about 4.95 bits, so 17 is the shortest length that clears
 * 80 bits with the chosen alphabet.
 */
export const INVITE_CODE_LENGTH = 17;

/** Bits of entropy an invite code carries, for tests and documentation. */
export const INVITE_CODE_BITS = INVITE_CODE_LENGTH * Math.log2(INVITE_CODE_ALPHABET.length);

/**
 * A cryptographically random, URL-safe invite code. Uses `node:crypto`'s
 * `randomInt`, which rejection-samples so every character of the alphabet is
 * equally likely (a plain modulo of a random byte would be biased, because 31
 * does not divide 256).
 */
export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

/** How many times `withInviteCodeRetry` will attempt a fresh code after a collision. */
export const MAX_INVITE_CODE_ATTEMPTS = 5;

/**
 * Runs `attempt` with a freshly generated code, retrying on a collision up to
 * `maxAttempts` times total. `isCollision` decides whether a thrown error is a
 * unique-constraint collision (retry) or something else (rethrow immediately).
 * If every attempt collides, the last collision error is rethrown: this is an
 * unexpected failure at that point (the chance is astronomically small at 17
 * characters), not a normal domain result.
 *
 * `generate` and `isCollision` are both injectable so the retry behavior is
 * testable without a database: a fake `attempt` can throw a fake collision
 * error for the first N calls and succeed after.
 */
export async function withInviteCodeRetry<T>(
  attempt: (code: string) => Promise<T>,
  options: {
    readonly generate?: () => string;
    readonly isCollision: (error: unknown) => boolean;
    readonly maxAttempts?: number;
  },
): Promise<T> {
  const generate = options.generate ?? generateInviteCode;
  const maxAttempts = options.maxAttempts ?? MAX_INVITE_CODE_ATTEMPTS;
  let lastError: unknown;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await attempt(generate());
    } catch (error) {
      if (!options.isCollision(error)) throw error;
      lastError = error;
    }
  }

  throw lastError;
}
