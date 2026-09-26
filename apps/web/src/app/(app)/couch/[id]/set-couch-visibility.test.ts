import { describe, expect, it, vi } from "vitest";

vi.mock("@couch/database", () => ({
  getPrismaClient: vi.fn(() => ({})),
}));

// `./actions` imports the real session helper at module scope, which would
// load better-auth. Every test stubs `deps.getCurrentUser` instead.
vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const signedIn = async () => ({ id: "user-1", email: "a@b.com", displayName: "A" });

function form(fields: Readonly<Record<string, string | undefined>>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) formData.set(key, value);
  return formData;
}

describe("runSetCouchVisibilityAction", () => {
  it("rejects when getCurrentUser returns null, without calling setCouchVisibility", async () => {
    const { runSetCouchVisibilityAction } = await import("./actions");
    const setCouchVisibility = vi.fn();

    const result = await runSetCouchVisibilityAction(
      { error: null },
      form({ couchId: "couch-1", isPublic: "true" }),
      { getCurrentUser: async () => null, setCouchVisibility },
    );

    expect(result.error).toBe("You must be signed in to do that.");
    expect(setCouchVisibility).not.toHaveBeenCalled();
  });

  it("rejects a missing couchId or an isPublic that is not exactly true or false", async () => {
    const { runSetCouchVisibilityAction } = await import("./actions");
    const setCouchVisibility = vi.fn();
    const deps = { getCurrentUser: signedIn, setCouchVisibility };

    for (const fields of [{ isPublic: "true" }, { couchId: "couch-1" }, { couchId: "couch-1", isPublic: "yes" }]) {
      const result = await runSetCouchVisibilityAction({ error: null }, form(fields), deps);
      expect(result.error).toBe("Something went wrong. Please try again.");
    }
    expect(setCouchVisibility).not.toHaveBeenCalled();
  });

  it("calls setCouchVisibility with the session user as actor, then redirects", async () => {
    const { runSetCouchVisibilityAction } = await import("./actions");
    const setCouchVisibility = vi.fn(async () => ({ ok: true as const, value: {} as never }));

    await expect(
      runSetCouchVisibilityAction({ error: null }, form({ couchId: "couch-1", isPublic: "true" }), {
        getCurrentUser: signedIn,
        setCouchVisibility,
      }),
    ).rejects.toThrow("REDIRECT:/couch/couch-1");

    expect(setCouchVisibility).toHaveBeenCalledWith({}, { couchId: "couch-1", actingUserId: "user-1", isPublic: true });
  });

  it("maps a forbidden result from a non-host to a user message", async () => {
    const { runSetCouchVisibilityAction } = await import("./actions");
    const setCouchVisibility = vi.fn(async () => ({ ok: false as const, error: "forbidden" as const }));

    const result = await runSetCouchVisibilityAction(
      { error: null },
      form({ couchId: "couch-1", isPublic: "false" }),
      { getCurrentUser: signedIn, setCouchVisibility },
    );

    expect(result.error).toBe("You do not have permission to do that.");
  });
});
