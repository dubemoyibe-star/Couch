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

/**
 * A resolved way to play a media item, discriminated on `kind`: a direct `mp4` file, an
 * `hls` or `dash` manifest, or an `embed` page. Unknown keys are rejected.
 */
export const playbackSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject(sourceShape("mp4")),
  z.strictObject(sourceShape("hls")),
  z.strictObject(sourceShape("dash")),
  z.strictObject(sourceShape("embed")),
]);

export type PlaybackSource = z.infer<typeof playbackSourceSchema>;
