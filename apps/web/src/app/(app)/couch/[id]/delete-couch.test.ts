import { describe, expect, it, vi } from "vitest";

vi.mock("@couch/database", () => ({
  getPrismaClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const signedIn = async () => ({ id: "user-1", email: "a@b.com", displayName: "A" });
const okDelete = () => vi.fn(async () => ({ ok: true as const, value: undefined }));

function form(fields: Readonly<Record<string, string | undefined>>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) formData.set(key, value);
  return formData;
}

describe("runDeleteCouchAction", () => {
  it("rejects when getCurrentUser returns null, without deleting or tearing down", async () => {
    const { runDeleteCouchAction } = await import("./actions");
    const deleteCouch = vi.fn();
    const requestTeardown = vi.fn();

    const result = await runDeleteCouchAction({ error: null }, form({ couchId: "couch-1" }), {
      getCurrentUser: async () => null,
      deleteCouch,
      requestTeardown,
      logError: vi.fn(),
    });

    expect(result.error).toBe("You must be signed in to do that.");
    expect(deleteCouch).not.toHaveBeenCalled();
    expect(requestTeardown).not.toHaveBeenCalled();
  });

  it("rejects a missing couchId", async () => {
    const { runDeleteCouchAction } = await import("./actions");
    const deleteCouch = vi.fn();

    const result = await runDeleteCouchAction({ error: null }, form({}), {
      getCurrentUser: signedIn,
      deleteCouch,
      requestTeardown: vi.fn(),
      logError: vi.fn(),
    });

    expect(result.error).toBe("Something went wrong. Please try again.");
    expect(deleteCouch).not.toHaveBeenCalled();
  });

  it("deletes with the session user as actor, then tears down and redirects with the deleted notice", async () => {
    const { runDeleteCouchAction } = await import("./actions");
    const deleteCouch = okDelete();
    const requestTeardown = vi.fn(async () => ({ ok: true as const }));
    const logError = vi.fn();

    await expect(
      runDeleteCouchAction({ error: null }, form({ couchId: "couch-1" }), {
        getCurrentUser: signedIn,
        deleteCouch,
        requestTeardown,
        logError,
      }),
    ).rejects.toThrow("REDIRECT:/?deleted=1");

    expect(deleteCouch).toHaveBeenCalledWith({}, { couchId: "couch-1", actingUserId: "user-1" });
    expect(requestTeardown).toHaveBeenCalledWith("couch-1");
    expect(deleteCouch.mock.invocationCallOrder[0]).toBeLessThan(requestTeardown.mock.invocationCallOrder[0] as number);
    expect(logError).not.toHaveBeenCalled();
  });

  it.each(["forbidden", "couch_not_found"] as const)(
    "shows the mapped error for %s and does not attempt teardown",
    async (kind) => {
      const { runDeleteCouchAction } = await import("./actions");
      const { mapToUserMessage } = await import("@/lib/repo-error-messages");
      const requestTeardown = vi.fn();

      const result = await runDeleteCouchAction({ error: null }, form({ couchId: "couch-1" }), {
        getCurrentUser: signedIn,
        deleteCouch: vi.fn(async () => ({ ok: false as const, error: kind })),
        requestTeardown,
        logError: vi.fn(),
      });

      expect(result.error).toBe(mapToUserMessage(kind));
      expect(requestTeardown).not.toHaveBeenCalled();
    },
  );

  it("still deletes, logs the failure and redirects as success when teardown fails", async () => {
    const { runDeleteCouchAction } = await import("./actions");
    const deleteCouch = okDelete();
    const logError = vi.fn();

    await expect(
      runDeleteCouchAction({ error: null }, form({ couchId: "couch-1" }), {
        getCurrentUser: signedIn,
        deleteCouch,
        requestTeardown: async () => ({ ok: false, reason: "HTTP 500, body: (empty)" }),
        logError,
      }),
    ).rejects.toThrow("REDIRECT:/?deleted=1");

    expect(deleteCouch).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]?.[0]).toContain("couch-1");
    expect(logError.mock.calls[0]?.[0]).toContain("HTTP 500");
  });
});
