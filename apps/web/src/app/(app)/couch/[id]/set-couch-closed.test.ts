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

describe("runSetCouchClosedAction", () => {
  it("rejects when getCurrentUser returns null, without calling setCouchClosed", async () => {
    const { runSetCouchClosedAction } = await import("./actions");
    const setCouchClosed = vi.fn();

    const result = await runSetCouchClosedAction(
      { error: null },
      form({ couchId: "couch-1", isClosed: "true" }),
      { getCurrentUser: async () => null, setCouchClosed },
    );

    expect(result.error).toBe("You must be signed in to do that.");
    expect(setCouchClosed).not.toHaveBeenCalled();
  });

  it("rejects a missing couchId or an isClosed that is not exactly true or false", async () => {
    const { runSetCouchClosedAction } = await import("./actions");
    const setCouchClosed = vi.fn();
    const deps = { getCurrentUser: signedIn, setCouchClosed };

    for (const fields of [{ isClosed: "true" }, { couchId: "couch-1" }, { couchId: "couch-1", isClosed: "yes" }]) {
      const result = await runSetCouchClosedAction({ error: null }, form(fields), deps);
      expect(result.error).toBe("Something went wrong. Please try again.");
    }
    expect(setCouchClosed).not.toHaveBeenCalled();
  });

  it("calls setCouchClosed with the session user as actor to close, then redirects", async () => {
    const { runSetCouchClosedAction } = await import("./actions");
    const setCouchClosed = vi.fn(async () => ({ ok: true as const, value: {} as never }));

    await expect(
      runSetCouchClosedAction({ error: null }, form({ couchId: "couch-1", isClosed: "true" }), {
        getCurrentUser: signedIn,
        setCouchClosed,
      }),
    ).rejects.toThrow("REDIRECT:/couch/couch-1");

    expect(setCouchClosed).toHaveBeenCalledWith({}, { couchId: "couch-1", actingUserId: "user-1", isClosed: true });
  });

  it("passes isClosed false to reopen", async () => {
    const { runSetCouchClosedAction } = await import("./actions");
    const setCouchClosed = vi.fn(async () => ({ ok: true as const, value: {} as never }));

    await expect(
      runSetCouchClosedAction({ error: null }, form({ couchId: "couch-1", isClosed: "false" }), {
        getCurrentUser: signedIn,
        setCouchClosed,
      }),
    ).rejects.toThrow("REDIRECT:/couch/couch-1");

    expect(setCouchClosed).toHaveBeenCalledWith({}, { couchId: "couch-1", actingUserId: "user-1", isClosed: false });
  });

  it("maps forbidden (a non-host) to a user message", async () => {
    const { runSetCouchClosedAction } = await import("./actions");
    const setCouchClosed = vi.fn(async () => ({ ok: false as const, error: "forbidden" as const }));

    const result = await runSetCouchClosedAction(
      { error: null },
      form({ couchId: "couch-1", isClosed: "true" }),
      { getCurrentUser: signedIn, setCouchClosed },
    );

    expect(result.error).toBe("You do not have permission to do that.");
  });
});
