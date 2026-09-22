import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { mediaWithLicenseSchema, playbackSourceSchema, type MediaWithLicense, type PlaybackSource } from "@couch/contracts";
import type { ContentProvider, ProviderCapabilities, ProviderRequestOptions } from "./content-provider";
import { ProviderError } from "./errors";

/**
 * One catalog manifest entry: a `MediaWithLicense` plus a resolved `PlaybackSource`. INGEST
 * flavor: unknown keys are rejected, at the top level and inside `license`, so a manifest
 * typo fails loudly instead of being silently dropped.
 */
const catalogEntrySchema = z.strictObject({
  ...mediaWithLicenseSchema.shape,
  playback: playbackSourceSchema,
});

export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

/**
 * Loads every `*.json` file in `catalogDir`, validates each entry against
 * `catalogEntrySchema`, and returns them keyed by `providerMediaId`. Fails fast: an
 * unreadable directory or file, invalid JSON, a schema-invalid entry, a duplicate
 * `providerMediaId`, or an entry whose `providerId` does not match `providerId` throws a
 * `ProviderError` with code `invalid_response` naming the file (and, where applicable, the
 * entry). Authorization (`intendedUseAllowed` and the rest of `isUseAuthorized`) is
 * deliberately NOT checked here: that is the gated registry's job, so an
 * `intendedUseAllowed: false` entry loads fine and is filtered later.
 */
function loadCatalog(catalogDir: string, providerId: string): Map<string, CatalogEntry> {
  let filenames: string[];
  try {
    filenames = readdirSync(catalogDir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (cause) {
    throw new ProviderError(
      "invalid_response",
      providerId,
      `catalog directory "${catalogDir}" could not be read: ${String(cause)}`,
    );
  }

  const entries = new Map<string, CatalogEntry>();

  for (const filename of filenames) {
    const filePath = join(catalogDir, filename);

    let raw: string;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch (cause) {
      throw new ProviderError(
        "invalid_response",
        providerId,
        `catalog file "${filename}" could not be read: ${String(cause)}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      throw new ProviderError(
        "invalid_response",
        providerId,
        `catalog file "${filename}" is not valid JSON: ${String(cause)}`,
      );
    }

    const rawEntries = Array.isArray(parsed) ? parsed : [parsed];

    rawEntries.forEach((rawEntry, index) => {
      const result = catalogEntrySchema.safeParse(rawEntry);
      if (!result.success) {
        throw new ProviderError(
          "invalid_response",
          providerId,
          `catalog file "${filename}" entry ${index} failed validation: ${result.error.message}`,
        );
      }

      const entry = result.data;

      if (entry.providerId !== providerId) {
        throw new ProviderError(
          "invalid_response",
          providerId,
          `catalog file "${filename}" entry ${index} has providerId "${entry.providerId}", expected "${providerId}"`,
        );
      }

      if (entries.has(entry.providerMediaId)) {
        throw new ProviderError(
          "invalid_response",
          providerId,
          `catalog file "${filename}" entry ${index} has duplicate providerMediaId "${entry.providerMediaId}"`,
        );
      }

      entries.set(entry.providerMediaId, entry);
    });
  }

  return entries;
}

function toMedia(entry: CatalogEntry): MediaWithLicense {
  return {
    providerId: entry.providerId,
    providerMediaId: entry.providerMediaId,
    title: entry.title,
    description: entry.description,
    durationSeconds: entry.durationSeconds,
    posterUrl: entry.posterUrl,
    releaseYear: entry.releaseYear,
    license: entry.license,
  };
}

/** Rejects with `signal.reason` when `signal` is already aborted. A no-op otherwise. */
function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error("aborted", { cause: signal.reason });
  }
}

export type StaticProviderOptions = {
  /** Defaults to `"static"`. */
  readonly id?: string;
  /** Defaults to `"Static Catalog"`. */
  readonly displayName?: string;
  /** Directory of `*.json` manifest files, loaded once at construction. */
  readonly catalogDir: string;
};

/**
 * Serves media from JSON manifest files on disk. Metadata and links only: it never hosts or
 * copies the media itself, only `playback` URLs recorded in the manifest.
 *
 * The catalog is loaded once, synchronously, at construction (`loadCatalog` throws there if
 * anything is wrong), so every method below runs against an already-validated, in-memory
 * map and never touches disk again. `capabilities.playbackKinds` is derived from the
 * `playback.kind` values actually present in the loaded catalog, not hardcoded.
 */
export class StaticProvider implements ContentProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;

  private readonly entries: Map<string, CatalogEntry>;

  constructor(options: StaticProviderOptions) {
    this.id = options.id ?? "static";
    this.displayName = options.displayName ?? "Static Catalog";
    this.entries = loadCatalog(options.catalogDir, this.id);

    const playbackKinds = new Set<PlaybackSource["kind"]>();
    for (const entry of this.entries.values()) playbackKinds.add(entry.playback.kind);
    this.capabilities = { search: true, playbackKinds: [...playbackKinds] };
  }

  async list(options?: ProviderRequestOptions): Promise<MediaWithLicense[]> {
    checkSignal(options?.signal);
    return [...this.entries.values()].map(toMedia);
  }

  async search(query: string, options?: ProviderRequestOptions): Promise<MediaWithLicense[]> {
    checkSignal(options?.signal);
    const needle = query.toLowerCase();
    return [...this.entries.values()]
      .filter((entry) => entry.title.toLowerCase().includes(needle))
      .map(toMedia);
  }

  async getDetails(providerMediaId: string, options?: ProviderRequestOptions): Promise<MediaWithLicense> {
    checkSignal(options?.signal);
    const entry = this.entries.get(providerMediaId);
    if (!entry) throw new ProviderError("not_found", this.id, `no item with id ${providerMediaId}`);
    return toMedia(entry);
  }

  async getPlayback(providerMediaId: string, options?: ProviderRequestOptions): Promise<PlaybackSource> {
    checkSignal(options?.signal);
    const entry = this.entries.get(providerMediaId);
    if (!entry) throw new ProviderError("not_found", this.id, `no item with id ${providerMediaId}`);
    return entry.playback;
  }
}
