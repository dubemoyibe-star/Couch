import { describe, expect, it, vi } from "vitest";

vi.mock("@couch/database", () => ({
  getPrismaClient: vi.fn(() => ({})),
}));

// Every test here exercises `runSetCurrentMediaAction` with a stubbed
// `deps.getCurrentUser`, never the real one, but `./actions` imports it at
// module scope for the thin `"use server"`-wrapped export. Left unmocked,
// that import pulls in `./auth`, which loads the `better-auth` package for
// real: a one-time, unavoidable multi-second module load the first time any
// process imports it, that these tests have no reason to pay.
vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

function fakeCouch() {
  return {
    id: "couch-1",
    name: "Movie night",
    ownerId: "host-1",
    inviteCode: "abc123",
    currentMediaId: "media-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("runSetCurrentMediaAction", () => {
  it("rejects when getCurrentUser returns null, without calling setCurrentMedia", async () => {
    const { runSetCurrentMediaAction } = await import("./actions");
    const setCurrentMedia = vi.fn();
    const formData = new FormData();
    formData.set("couchId", "couch-1");
    formData.set("mediaId", "media-1");

    const result = await runSetCurrentMediaAction(
      { error: null },
      formData,
      { getCurrentUser: async () => null, setCurrentMedia },
    );

    expect(result.error).toBe("You must be signed in to do that.");
    expect(setCurrentMedia).not.toHaveBeenCalled();
  });

  it("maps forbidden (a non-host acting) to a clear message instead of redirecting", async () => {
    const { runSetCurrentMediaAction } = await import("./actions");
    const setCurrentMedia = vi.fn(async () => ({ ok: false as const, error: "forbidden" as const }));
    const formData = new FormData();
    formData.set("couchId", "couch-1");
    formData.set("mediaId", "media-1");

    const result = await runSetCurrentMediaAction(
      { error: null },
      formData,
      {
        getCurrentUser: async () => ({ id: "user-2", email: "b@b.com", displayName: "B" }),
        setCurrentMedia,
      },
    );

    expect(result.error).toBe("You do not have permission to do that.");
  });

  it("maps media_unavailable (unauthorized, inactive, or nonexistent media) to a clear message", async () => {
    const { runSetCurrentMediaAction } = await import("./actions");
    const setCurrentMedia = vi.fn(async () => ({
      ok: false as const,
      error: "media_unavailable" as const,
    }));
    const formData = new FormData();
    formData.set("couchId", "couch-1");
    formData.set("mediaId", "media-404");

    const result = await runSetCurrentMediaAction(
      { error: null },
      formData,
      {
        getCurrentUser: async () => ({ id: "host-1", email: "h@b.com", displayName: "H" }),
        setCurrentMedia,
      },
    );

    expect(result.error).toBe("That media is not available right now.");
  });

  it("sets the current media with the signed-in user as actor, then redirects to the couch", async () => {
    const { runSetCurrentMediaAction } = await import("./actions");
    const setCurrentMedia = vi.fn(async () => ({ ok: true as const, value: fakeCouch() }));
    const formData = new FormData();
    formData.set("couchId", "couch-1");
    formData.set("mediaId", "media-1");

    await expect(
      runSetCurrentMediaAction(
        { error: null },
        formData,
        {
          getCurrentUser: async () => ({ id: "host-1", email: "h@b.com", displayName: "H" }),
          setCurrentMedia,
        },
      ),
    ).rejects.toThrow("REDIRECT:/couch/couch-1");

    expect(setCurrentMedia).toHaveBeenCalledWith(
      {},
      { couchId: "couch-1", actingUserId: "host-1", mediaId: "media-1" },
    );
  });

  it("treats a missing mediaId field as clearing the current media (null)", async () => {
    const { runSetCurrentMediaAction } = await import("./actions");
    const setCurrentMedia = vi.fn(async () => ({ ok: true as const, value: fakeCouch() }));
    const formData = new FormData();
    formData.set("couchId", "couch-1");

    await expect(
      runSetCurrentMediaAction(
        { error: null },
        formData,
        {
          getCurrentUser: async () => ({ id: "host-1", email: "h@b.com", displayName: "H" }),
          setCurrentMedia,
        },
      ),
    ).rejects.toThrow("REDIRECT:/couch/couch-1");

    expect(setCurrentMedia).toHaveBeenCalledWith(
      {},
      { couchId: "couch-1", actingUserId: "host-1", mediaId: null },
    );
  });

  it("rejects a missing couchId before calling setCurrentMedia", async () => {
    const { runSetCurrentMediaAction } = await import("./actions");
    const setCurrentMedia = vi.fn();
    const formData = new FormData();
    formData.set("mediaId", "media-1");

    const result = await runSetCurrentMediaAction(
      { error: null },
      formData,
      {
        getCurrentUser: async () => ({ id: "host-1", email: "h@b.com", displayName: "H" }),
        setCurrentMedia,
      },
    );

    expect(result.error).toBeTruthy();
    expect(setCurrentMedia).not.toHaveBeenCalled();
  });
});
