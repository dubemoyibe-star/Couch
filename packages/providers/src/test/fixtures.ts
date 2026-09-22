// Shared valid examples for the tests. Not exported from the package. Every value is fake.
import type { MediaWithLicense, PlaybackSource } from "@couch/contracts";

export const license: MediaWithLicense["license"] = {
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

export const mediaWithLicense: MediaWithLicense = {
  providerId: "fake",
  providerMediaId: "item-1",
  title: "TEST FIXTURE Title",
  description: "TEST FIXTURE description",
  durationSeconds: 5400,
  posterUrl: "https://example.com/poster.png",
  releaseYear: 1999,
  license,
};

export const mp4Source: PlaybackSource = {
  kind: "mp4",
  url: "https://example.com/item-1.mp4",
};
