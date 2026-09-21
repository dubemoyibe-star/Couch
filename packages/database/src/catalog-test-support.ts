import { randomBytes } from "node:crypto";
import type { MediaWithLicense } from "@couch/contracts";
import type { PrismaClient } from "./generated/prisma/client";

// Helpers for the catalog database tests. This file is NOT exported from the
// package: it deletes rows, and the package exports no delete. Every fixture is
// obviously fake, with titles that start with "TEST FIXTURE" and example.com URLs.

/** Every test provider id starts with this, so leftovers are easy to find. */
export const TEST_PROVIDER_PREFIX = "dbtest-";

/** A prefix unique to one run, for example `dbtest-3f9a1c2b`. It is a valid provider slug. */
export function newRunPrefix(): string {
  return `${TEST_PROVIDER_PREFIX}${randomBytes(4).toString("hex")}`;
}

/** A valid, authorized media item. Override any field, including the license. */
export function fixtureMedia(
  providerId: string,
  providerMediaId: string,
  title: string,
  overrides: Partial<Omit<MediaWithLicense, "license">> & {
    license?: Partial<MediaWithLicense["license"]>;
  } = {},
): MediaWithLicense {
  const { license, ...media } = overrides;
  return {
    providerId,
    providerMediaId,
    title,
    description: "TEST FIXTURE description",
    durationSeconds: 5400.5,
    posterUrl: "https://example.com/poster.png",
    releaseYear: 1999,
    ...media,
    license: {
      licenseName: "TEST FIXTURE License",
      licenseVersion: "1.0",
      licenseUrl: "https://example.com/license",
      sourceUrl: "https://example.com/items/1",
      rightsholder: "TEST FIXTURE Rightsholder",
      attributionRequired: true,
      attribution: "TEST FIXTURE attribution",
      intendedUseAllowed: true,
      commercialUseAllowed: false,
      additionalRestrictions: null,
      verifiedAt: "2026-02-03",
      verificationNotes: null,
      ...license,
    },
  };
}

/**
 * Deletes every media row whose provider id starts with `prefix`, then the
 * license rows those media rows pointed at. Media goes first because the
 * license relation is `onDelete: Restrict`.
 */
export async function cleanupTestMedia(db: PrismaClient, prefix: string): Promise<void> {
  const where = { providerId: { startsWith: prefix } };
  const rows = await db.media.findMany({ where, select: { licenseRecordId: true } });
  await db.media.deleteMany({ where });
  await db.licenseRecord.deleteMany({
    where: { id: { in: rows.map((row) => row.licenseRecordId) } },
  });
}
