import type { CatalogMedia, MediaWithLicense } from "@couch/contracts";
import type {
  MediaListResult,
  MediaRejection,
  OnProviderError,
  OnRejected,
  ProviderFailure,
} from "@couch/providers";

// The planning and orchestration logic for the catalog sync, kept free of any concrete
// provider or database import: every effect (listing media, writing a row, counting rows)
// comes in through `SyncDeps`, so this runs and is tested without a real registry or a real
// database. `sync-catalog.ts` wires the real `@couch/providers` registry and `@couch/database`
// functions into these deps and is the only file that touches I/O.

export type ListMediaFn = (handlers: {
  readonly onRejected: OnRejected;
  readonly onProviderError: OnProviderError;
}) => Promise<MediaListResult>;

export type SyncDeps = {
  readonly listMedia: ListMediaFn;
  /** Mirrors `@couch/database`'s `upsertCatalogMedia`: returns `null` when the stored item is not authorized. */
  readonly upsertMedia: (media: MediaWithLicense) => Promise<CatalogMedia | null>;
  /** Mirrors `@couch/database`'s `deactivateMissing`. Only ever called for a provider that succeeded this run. */
  readonly deactivateMissing: (providerId: string, keepProviderMediaIds: string[]) => Promise<number>;
  /** Read-only equivalent of `deactivateMissing`, for `--dry-run`. Never writes. */
  readonly countWouldDeactivate: (providerId: string, keepProviderMediaIds: string[]) => Promise<number>;
};

export type UpsertOutcome = {
  readonly providerId: string;
  readonly providerMediaId: string;
  readonly title: string;
  /**
   * Whether the item was kept active after the write (a dry run always reports `true`,
   * since nothing was written to reject). In a real run this is `false` when
   * `upsertMedia` returned `null`: the write stored the row, but the row is not
   * authorized, so it must not be counted as kept for `deactivateMissing`'s keep list.
   */
  readonly kept: boolean;
};

export type DatabaseFailure = {
  readonly providerId: string;
  readonly providerMediaId?: string;
  readonly stage: "upsert" | "deactivate";
  readonly error: unknown;
};

export type DeactivationResult = {
  readonly providerId: string;
  readonly count: number;
};

export type SyncResult = {
  readonly dryRun: boolean;
  /** Items that were (real run) or would be (dry run) passed to `upsertMedia`. */
  readonly upserted: UpsertOutcome[];
  /** Candidates the license gate rejected before this ever saw them, from `onRejected`. */
  readonly rejected: MediaRejection[];
  /** Providers that threw or timed out this run, from `onProviderError`. Never deactivated. */
  readonly providerFailures: ProviderFailure[];
  /** Actual (real run) or projected (dry run) deactivation counts, one entry per succeeded provider. */
  readonly deactivations: DeactivationResult[];
  /** `upsertMedia`/`deactivateMissing` calls that threw. Empty in a dry run. */
  readonly databaseFailures: DatabaseFailure[];
};

/** True when nothing failed: no provider failure and no database failure. */
export function syncSucceeded(result: SyncResult): boolean {
  return result.providerFailures.length === 0 && result.databaseFailures.length === 0;
}

function groupByProvider(items: readonly MediaWithLicense[]): Map<string, MediaWithLicense[]> {
  const groups = new Map<string, MediaWithLicense[]>();
  for (const item of items) {
    const group = groups.get(item.providerId);
    if (group) group.push(item);
    else groups.set(item.providerId, [item]);
  }
  return groups;
}

/**
 * Runs one sync pass: lists gated media, then for every provider that SUCCEEDED this run
 * (present in `succeededProviderIds`), upserts its items and deactivates whatever was not
 * kept. A provider that failed or timed out is skipped entirely: it contributes no items
 * (the registry never returns any for it) and `deactivateMissing` is never called for it,
 * so its existing catalog rows are left untouched.
 *
 * `--dry-run` (`options.dryRun`) never calls `upsertMedia` or `deactivateMissing`: it only
 * reads (`listMedia`, `countWouldDeactivate`), so the database is provably untouched.
 */
export async function runSync(deps: SyncDeps, options: { readonly dryRun: boolean }): Promise<SyncResult> {
  const rejected: MediaRejection[] = [];
  const providerFailures: ProviderFailure[] = [];
  const databaseFailures: DatabaseFailure[] = [];
  const upserted: UpsertOutcome[] = [];
  const deactivations: DeactivationResult[] = [];

  const { items, succeededProviderIds } = await deps.listMedia({
    onRejected: (rejection) => rejected.push(rejection),
    onProviderError: (failure) => providerFailures.push(failure),
  });

  const grouped = groupByProvider(items);

  for (const providerId of succeededProviderIds) {
    const providerItems = grouped.get(providerId) ?? [];

    if (options.dryRun) {
      for (const media of providerItems) {
        upserted.push({ providerId, providerMediaId: media.providerMediaId, title: media.title, kept: true });
      }
      const plannedKeep = providerItems.map((media) => media.providerMediaId);
      const count = await deps.countWouldDeactivate(providerId, plannedKeep);
      deactivations.push({ providerId, count });
      continue;
    }

    const keep: string[] = [];
    for (const media of providerItems) {
      try {
        const result = await deps.upsertMedia(media);
        const kept = result !== null;
        upserted.push({ providerId, providerMediaId: media.providerMediaId, title: media.title, kept });
        if (kept) keep.push(media.providerMediaId);
      } catch (error) {
        databaseFailures.push({ providerId, providerMediaId: media.providerMediaId, stage: "upsert", error });
      }
    }

    try {
      const count = await deps.deactivateMissing(providerId, keep);
      deactivations.push({ providerId, count });
    } catch (error) {
      databaseFailures.push({ providerId, stage: "deactivate", error });
    }
  }

  return { dryRun: options.dryRun, upserted, rejected, providerFailures, deactivations, databaseFailures };
}
