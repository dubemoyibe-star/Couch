import { describe, expect, it, vi } from "vitest";

vi.mock("@couch/database", () => ({
  getPrismaClient: vi.fn(() => ({})),
}));

// Every test here exercises `runJoinCouchAction` with a stubbed
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
    currentMediaId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("runJoinCouchAction", () => {
  it("rejects when getCurrentUser returns null, without resolving the invite code or joining", async () => {
    const { runJoinCouchAction } = await import("./actions");
    const getCouchByInviteCode = vi.fn();
    const joinCouch = vi.fn();
    const formData = new FormData();
    formData.set("inviteCode", "abc123");

    const result = await runJoinCouchAction(
      { error: null },
      formData,
      { getCurrentUser: async () => null, getCouchByInviteCode, joinCouch },
    );

    expect(result.error).toBe("You must be signed in to join a couch.");
    expect(getCouchByInviteCode).not.toHaveBeenCalled();
    expect(joinCouch).not.toHaveBeenCalled();
  });

  it("rejects an invite code that does not resolve to a couch, without joining", async () => {
    const { runJoinCouchAction } = await import("./actions");
    const getCouchByInviteCode = vi.fn(async () => null);
    const joinCouch = vi.fn();
    const formData = new FormData();
    formData.set("inviteCode", "bad-code");

    const result = await runJoinCouchAction(
      { error: null },
      formData,
      {
        getCurrentUser: async () => ({ id: "user-1", email: "a@b.com", displayName: "A" }),
        getCouchByInviteCode,
        joinCouch,
      },
    );

    expect(result.error).toBe("This invite link is not valid.");
    expect(joinCouch).not.toHaveBeenCalled();
  });

  it("maps couch_full to a clear message instead of redirecting", async () => {
    const { runJoinCouchAction } = await import("./actions");
    const getCouchByInviteCode = vi.fn(async () => fakeCouch());
    const joinCouch = vi.fn(async () => ({ ok: false as const, error: "couch_full" as const }));
    const formData = new FormData();
    formData.set("inviteCode", "abc123");

    const result = await runJoinCouchAction(
      { error: null },
      formData,
      {
        getCurrentUser: async () => ({ id: "user-2", email: "b@b.com", displayName: "B" }),
        getCouchByInviteCode,
        joinCouch,
      },
    );

    expect(result.error).toBe("This couch is full.");
  });

  it("joins with the signed-in user against the invite code's couch, then redirects to it", async () => {
    const { runJoinCouchAction } = await import("./actions");
    const getCouchByInviteCode = vi.fn(async () => fakeCouch());
    const joinCouch = vi.fn(async () => ({
      ok: true as const,
      value: {
        id: "member-2",
        couchId: "couch-1",
        userId: "user-2",
        role: "participant" as const,
        joinedAt: new Date(),
      },
    }));
    const formData = new FormData();
    formData.set("inviteCode", "abc123");

    await expect(
      runJoinCouchAction(
        { error: null },
        formData,
        {
          getCurrentUser: async () => ({ id: "user-2", email: "b@b.com", displayName: "B" }),
          getCouchByInviteCode,
          joinCouch,
        },
      ),
    ).rejects.toThrow("REDIRECT:/couch/couch-1");

    expect(getCouchByInviteCode).toHaveBeenCalledWith({}, "abc123");
    expect(joinCouch).toHaveBeenCalledWith({}, { couchId: "couch-1", userId: "user-2" });
  });
});
