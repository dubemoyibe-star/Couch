import { describe, expect, it } from "vitest";
import * as providers from "./index";

describe("package export surface", () => {
  it("exports nothing beyond the registry, gate-adjacent types, and the provider/error exports", () => {
    // Type-only exports vanish at runtime, so this list is exactly the runtime bindings:
    // an app cannot import anything here that returns unfiltered provider output, because
    // the only way to call a provider at all is createProviderRegistry, and every one of
    // its methods is gated.
    expect(Object.keys(providers).sort()).toEqual(
      [
        "MEDIA_REJECTION_REASONS",
        "PROVIDER_ERROR_CODES",
        "ProviderError",
        "StaticProvider",
        "createProviderRegistry",
        "isProviderError",
      ].sort(),
    );
  });
});
