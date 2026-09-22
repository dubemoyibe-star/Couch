import type { MediaWithLicense, PlaybackSource } from "@couch/contracts";
import type { ContentProvider, ProviderCapabilities } from "../content-provider";
import { ProviderError } from "../errors";

/** Constructor input for {@link FakeProvider}. Not exported from the package. */
export type FakeProviderOptions = {
  readonly id?: string;
  readonly displayName?: string;
  readonly capabilities?: Partial<ProviderCapabilities>;
  readonly items?: readonly MediaWithLicense[];
  /** Playback sources keyed by `providerMediaId`, for items that can be played. */
  readonly playback?: Readonly<Record<string, PlaybackSource>>;
};

/**
 * A minimal, in-memory `ContentProvider`. Test-only: it proves the interface can be
 * implemented without casts and lets tests exercise the capability gate and every
 * `ProviderError` code without a real provider or any I/O. Not exported from the package.
 */
export class FakeProvider implements ContentProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;

  private readonly items: ReadonlyMap<string, MediaWithLicense>;
  private readonly playback: Readonly<Record<string, PlaybackSource>>;

  constructor(options: FakeProviderOptions = {}) {
    this.id = options.id ?? "fake";
    this.displayName = options.displayName ?? "Fake Provider";
    this.capabilities = {
      search: options.capabilities?.search ?? false,
      playbackKinds: options.capabilities?.playbackKinds ?? [],
    };
    this.items = new Map((options.items ?? []).map((item) => [item.providerMediaId, item]));
    this.playback = options.playback ?? {};
  }

  async list(): Promise<MediaWithLicense[]> {
    return [...this.items.values()];
  }

  async search(query: string): Promise<MediaWithLicense[]> {
    if (!this.capabilities.search) {
      throw new ProviderError("unsupported", this.id, "search is not supported");
    }
    return [...this.items.values()].filter((item) =>
      item.title.toLowerCase().includes(query.toLowerCase()),
    );
  }

  async getDetails(providerMediaId: string): Promise<MediaWithLicense> {
    const item = this.items.get(providerMediaId);
    if (!item) {
      throw new ProviderError("not_found", this.id, `no item with id ${providerMediaId}`);
    }
    return item;
  }

  async getPlayback(providerMediaId: string): Promise<PlaybackSource> {
    if (!this.items.has(providerMediaId)) {
      throw new ProviderError("not_found", this.id, `no item with id ${providerMediaId}`);
    }
    const source = this.playback[providerMediaId];
    if (!source || !this.capabilities.playbackKinds.includes(source.kind)) {
      throw new ProviderError(
        "unsupported",
        this.id,
        `no supported playback source for ${providerMediaId}`,
      );
    }
    return source;
  }
}
