// Shared valid examples for the tests. Not exported from the package. Every value is fake.
import {
  MEDIA_LIMITS,
  type CatalogMedia,
  type LicenseRecord,
  type PlaybackState,
  type RoomState,
} from "./index";

export const license: LicenseRecord = {
  licenseName: "TEST FIXTURE License",
  licenseVersion: "1.0",
  licenseUrl: "https://example.invalid/license",
  sourceUrl: "https://example.invalid/items/1",
  rightsholder: "TEST FIXTURE Rightsholder",
  attributionRequired: true,
  attribution: "TEST FIXTURE attribution text",
  intendedUseAllowed: true,
  commercialUseAllowed: false,
  additionalRestrictions: null,
  verifiedAt: "2026-02-03",
  verificationNotes: null,
};

export const catalogMedia: CatalogMedia = {
  id: "cat-1",
  providerId: "test-provider",
  providerMediaId: "fixture-1",
  title: "TEST FIXTURE Title",
  description: "TEST FIXTURE description",
  durationSeconds: 5400,
  posterUrl: "https://example.com/poster.png",
  releaseYear: 1999,
  license,
};

export const playbackState: PlaybackState = {
  status: "playing",
  position: 12.5,
  playbackRate: 1,
  revision: 3,
  serverTimestamp: 1_700_000_000_000,
};

export const roomState: RoomState["payload"] = {
  couch: { id: "couch-1", name: "Friday night" },
  self: { userId: "user-1", role: "host" },
  members: [
    { userId: "user-1", displayName: "Ada", role: "host", online: true },
    { userId: "user-2", displayName: "Grace", role: "participant", online: false },
  ],
  media: catalogMedia,
  playback: playbackState,
};

/** A valid payload for every event in the catalog, keyed by type. */
export const validPayloads: Record<string, unknown> = {
  "room.join": { couchId: "couch-1" },
  "room.leave": {},
  "chat.send": { text: "hello" },
  "room.setMedia": { mediaId: "cat-1" },
  "room.kick": { userId: "user-2" },
  "playback.play": { position: 1.5 },
  "playback.pause": { position: 1.5 },
  "playback.seek": { position: 30 },
  "playback.setRate": { rate: 1.25 },
  "room.state": roomState,
  "room.mediaChanged": { media: catalogMedia, playback: playbackState },
  "room.memberJoined": {
    member: { userId: "user-3", displayName: "Linus", role: "participant", online: true },
  },
  "room.memberLeft": { userId: "user-2" },
  "presence.update": { userId: "user-2", online: true },
  "chat.message": {
    id: "msg-1",
    userId: "user-1",
    displayName: "Ada",
    text: "hello",
    sentAt: 1_700_000_000_000,
  },
  "room.kicked": { reason: "Removed by the host" },
  "playback.sync": { state: playbackState },
  error: { code: "forbidden", message: "Not allowed.", replyTo: "c-1" },
};

/** ASCII, 1 byte per code point in UTF-8. */
export const ASCII_CHAR = "a";

/** U+1F600, 1 code point and 4 bytes in UTF-8: the most bytes a code point can take. */
export const FOUR_BYTE_CHAR = "\u{1F600}";

/**
 * A `CatalogMedia` with every field at its maximum. Every free-text field, every id and
 * the tail of every url is built from `char`. `providerId` is a lowercase slug and each url
 * starts with `https://example.com/`, so those parts stay ASCII.
 */
export function maxCatalogMedia(char: string = ASCII_CHAR): CatalogMedia {
  const filled = (length: number) => char.repeat(length);
  const longUrl = () => {
    const prefix = "https://example.com/";
    return prefix + filled(MEDIA_LIMITS.url - prefix.length);
  };
  return {
    id: filled(MEDIA_LIMITS.catalogId),
    providerId: ASCII_CHAR.repeat(MEDIA_LIMITS.providerId),
    providerMediaId: filled(MEDIA_LIMITS.providerMediaId),
    title: filled(MEDIA_LIMITS.title),
    description: filled(MEDIA_LIMITS.description),
    durationSeconds: 86_400,
    posterUrl: longUrl(),
    releaseYear: MEDIA_LIMITS.releaseYearMax,
    license: {
      licenseName: filled(MEDIA_LIMITS.licenseName),
      licenseVersion: filled(MEDIA_LIMITS.licenseVersion),
      licenseUrl: longUrl(),
      sourceUrl: longUrl(),
      rightsholder: filled(MEDIA_LIMITS.rightsholder),
      attributionRequired: true,
      attribution: filled(MEDIA_LIMITS.attribution),
      intendedUseAllowed: false,
      commercialUseAllowed: false,
      additionalRestrictions: filled(MEDIA_LIMITS.additionalRestrictions),
      verifiedAt: "2026-12-31",
      verificationNotes: filled(MEDIA_LIMITS.verificationNotes),
    },
  };
}
