import * as z from "zod";
import { httpsUrl } from "./fields";

/**
 * The fields shared by every source kind. A resolved source can expire, so it carries an
 * optional expiry and is re-resolved on reconnect instead of being reused.
 */
const sourceShape = <K extends string>(kind: K) => ({
  kind: z.literal(kind),
  url: httpsUrl,
  /** Epoch MILLISECONDS after which the url stops working. Absent when it does not expire. */
  expiresAt: z.number().int().min(0).optional(),
});

// One field map per kind. Both flavors below are built from these, so they cannot drift.
const mp4 = sourceShape("mp4");
const hls = sourceShape("hls");
const dash = sourceShape("dash");
const embed = sourceShape("embed");

/**
 * A resolved way to play a media item, discriminated on `kind`: a direct `mp4` file, an
 * `hls` or `dash` manifest, or an `embed` page. INGEST flavor: unknown keys are rejected.
 * Use it for provider output.
 */
export const playbackSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject(mp4),
  z.strictObject(hls),
  z.strictObject(dash),
  z.strictObject(embed),
]);

/**
 * `PlaybackSource`, WIRE flavor: unknown keys are stripped. Use it for a source received
 * from the server, so an additive server change never breaks an older client. Same fields
 * and same rules as the ingest flavor.
 */
export const playbackSourceWireSchema = z.discriminatedUnion("kind", [
  z.object(mp4),
  z.object(hls),
  z.object(dash),
  z.object(embed),
]);

export type PlaybackSource = z.infer<typeof playbackSourceSchema>;
