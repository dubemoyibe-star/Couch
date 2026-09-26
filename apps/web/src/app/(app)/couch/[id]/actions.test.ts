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
    isPublic: false,
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

describe("runRemoveMemberAction", () => {
  it("rejects when getCurrentUser returns null, without calling removeMember", async () => {
    const { runRemoveMemberAction } = await import("./actions");
    const removeMember = vi.fn();
    const formData = new FormData();
    formData.set("couchId", "couch-1");
    formData.set("targetUserId", "user-2");

    const result = await runRemoveMemberAction(
      { error: null },
      formData,
      { getCurrentUser: async () => null, removeMember },
    );

    expect(result.error).toBe("You must be signed in to do that.");
    expect(removeMember).not.toHaveBeenCalled();
  });

  it("maps forbidden (a non-host acting) to a clear message instead of redirecting", async () => {
    const { runRemoveMemberAction } = await import("./actions");
    const removeMember = vi.fn(async () => ({ ok: false as const, error: "forbidden" as const }));
    const formData = new FormData();
    formData.set("couchId", "couch-1");
    formData.set("targetUserId", "user-2");

    const result = await runRemoveMemberAction(
      { error: null },
      formData,
      {
        getCurrentUser: async () => ({ id: "user-3", email: "c@b.com", displayName: "C" }),
        removeMember,
      },
    );

    expect(result.error).toBe("You do not have permission to do that.");
  });

  it("maps cannot_remove_self to a clear message instead of redirecting", async () => {
    const { runRemoveMemberAction } = await import("./actions");
    const removeMember = vi.fn(async () => ({
      ok: false as const,
      error: "cannot_remove_self" as const,
    }));
    const formData = new FormData();
    formData.set("couchId", "couch-1");
    formData.set("targetUserId", "host-1");

    const result = await runRemoveMemberAction(
      { error: null },
      formData,
      {
        getCurrentUser: async () => ({ id: "host-1", email: "h@b.com", displayName: "H" }),
        removeMember,
      },
    );

    expect(result.error).toBe("You cannot remove yourself from the couch.");
  });

  it("removes the target member as the signed-in actor, then redirects to the couch", async () => {
    const { runRemoveMemberAction } = await import("./actions");
    const removeMember = vi.fn(async () => ({ ok: true as const, value: undefined }));
    const formData = new FormData();
    formData.set("couchId", "couch-1");
    formData.set("targetUserId", "user-2");

    await expect(
      runRemoveMemberAction(
        { error: null },
        formData,
        {
          getCurrentUser: async () => ({ id: "host-1", email: "h@b.com", displayName: "H" }),
          removeMember,
        },
      ),
    ).rejects.toThrow("REDIRECT:/couch/couch-1");

    expect(removeMember).toHaveBeenCalledWith(
      {},
      { couchId: "couch-1", actingUserId: "host-1", targetUserId: "user-2" },
    );
  });

  it("rejects a missing targetUserId before calling removeMember", async () => {
    const { runRemoveMemberAction } = await import("./actions");
    const removeMember = vi.fn();
    const formData = new FormData();
    formData.set("couchId", "couch-1");

    const result = await runRemoveMemberAction(
      { error: null },
      formData,
      {
        getCurrentUser: async () => ({ id: "host-1", email: "h@b.com", displayName: "H" }),
        removeMember,
      },
    );

    expect(result.error).toBeTruthy();
    expect(removeMember).not.toHaveBeenCalled();
  });
});

describe("runLeaveCouchAction", () => {
  it("rejects when getCurrentUser returns null, without calling leaveCouch", async () => {
    const { runLeaveCouchAction } = await import("./actions");
    const leaveCouch = vi.fn();
    const formData = new FormData();
    formData.set("couchId", "couch-1");

    const result = await runLeaveCouchAction(
      { error: null },
      formData,
      { getCurrentUser: async () => null, leaveCouch },
    );

    expect(result.error).toBe("You must be signed in to do that.");
    expect(leaveCouch).not.toHaveBeenCalled();
  });

  it("maps host_cannot_leave to a clear message instead of redirecting", async () => {
    const { runLeaveCouchAction } = await import("./actions");
    const leaveCouch = vi.fn(async () => ({
      ok: false as const,
      error: "host_cannot_leave" as const,
    }));
    const formData = new FormData();
    formData.set("couchId", "couch-1");

    const result = await runLeaveCouchAction(
      { error: null },
      formData,
      {
        getCurrentUser: async () => ({ id: "host-1", email: "h@b.com", displayName: "H" }),
        leaveCouch,
      },
    );

    expect(result.error).toBe("As the host, you cannot leave this couch.");
  });

  it("leaves the couch as the signed-in user, then redirects to the dashboard", async () => {
    const { runLeaveCouchAction } = await import("./actions");
    const leaveCouch = vi.fn(async () => ({ ok: true as const, value: undefined }));
    const formData = new FormData();
    formData.set("couchId", "couch-1");

    await expect(
      runLeaveCouchAction(
        { error: null },
        formData,
        {
          getCurrentUser: async () => ({ id: "user-2", email: "b@b.com", displayName: "B" }),
          leaveCouch,
        },
      ),
    ).rejects.toThrow("REDIRECT:/");

    expect(leaveCouch).toHaveBeenCalledWith({}, { couchId: "couch-1", userId: "user-2" });
  });

  it("rejects a missing couchId before calling leaveCouch", async () => {
    const { runLeaveCouchAction } = await import("./actions");
    const leaveCouch = vi.fn();
    const formData = new FormData();

    const result = await runLeaveCouchAction(
      { error: null },
      formData,
      {
        getCurrentUser: async () => ({ id: "user-2", email: "b@b.com", displayName: "B" }),
        leaveCouch,
      },
    );

    expect(result.error).toBeTruthy();
    expect(leaveCouch).not.toHaveBeenCalled();
  });
});
