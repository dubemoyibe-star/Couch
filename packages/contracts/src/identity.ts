import * as z from "zod";
import { MEDIA_LIMITS, opaqueId, singleLineText } from "./fields";

/** Longest couch id, in Unicode code points (how Zod measures string length). */
export const COUCH_ID_MAX_LENGTH = 128;

/** Longest user id, in Unicode code points. */
export const USER_ID_MAX_LENGTH = 128;

/** Longest display name, in Unicode code points, counted after trimming. */
export const DISPLAY_NAME_MAX_LENGTH = 50;

/**
 * Ids are opaque, so they follow the opaque id rules: checked and never changed. Leading
 * or trailing whitespace and ASCII control characters are rejected, and so is an empty or
 * over-long value.
 */
export const couchIdSchema = opaqueId(COUCH_ID_MAX_LENGTH);
export const userIdSchema = opaqueId(USER_ID_MAX_LENGTH);

/** A catalog media id, with the same limit as `CatalogMedia.id`. */
export const mediaIdSchema = opaqueId(MEDIA_LIMITS.catalogId);

/**
 * A person's display name, a single-line label: trimmed, non-empty after trimming, at most
 * `DISPLAY_NAME_MAX_LENGTH`, and free of ASCII control characters (newline, tab and DEL
 * included).
 */
export const displayNameSchema = singleLineText(DISPLAY_NAME_MAX_LENGTH);

/** A member's role in a couch. */
export const roleSchema = z.enum(["host", "participant"]);

export type Role = z.infer<typeof roleSchema>;
