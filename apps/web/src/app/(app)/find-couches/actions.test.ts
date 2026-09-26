import { describe, expect, it, vi } from "vitest";

vi.mock("@couch/database", () => ({
  getPrismaClient: vi.fn(() => ({})),
}));

// See join/[code]/actions.test.ts: avoids loading better-auth for real.
vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

function fakeCouch(isPublic = true) {
  return {
    id: "couch-1",
    name: "Movie night",
    ownerId: "host-1",
    inviteCode: "abc123",
    isPublic,
    isClosed: false,
    currentMediaId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const signedIn = async () => ({ id: "user-2", email: "b@b.com", displayName: "B" });

function form(couchId?: string) {
  const formData = new FormData();
  if (couchId !== undefined) formData.set("couchId", couchId);
  return formData;
}

describe("runJoinPublicCouchAction", () => {
  it("rejects when getCurrentUser returns null, without loading the couch or joining", async () => {
    const { runJoinPublicCouchAction } = await import("./actions");
    const getCouch = vi.fn();
    const joinCouch = vi.fn();

    const result = await runJoinPublicCouchAction({ error: null }, form("couch-1"), {
      getCurrentUser: async () => null,
      getCouch,
      joinCouch,
    });

    expect(result.error).toBe("You must be signed in to join a couch.");
    expect(getCouch).not.toHaveBeenCalled();
    expect(joinCouch).not.toHaveBeenCalled();
  });

  it("rejects a missing couch id without joining", async () => {
    const { runJoinPublicCouchAction } = await import("./actions");
    const joinCouch = vi.fn();

    const result = await runJoinPublicCouchAction({ error: null }, form(), {
      getCurrentUser: signedIn,
      getCouch: vi.fn(),
      joinCouch,
    });

    expect(result.error).toBe("That couch could not be found.");
    expect(joinCouch).not.toHaveBeenCalled();
  });

  it("rejects an unknown couch id without joining", async () => {
    const { runJoinPublicCouchAction } = await import("./actions");
    const joinCouch = vi.fn();

    const result = await runJoinPublicCouchAction({ error: null }, form("nope"), {
      getCurrentUser: signedIn,
      getCouch: vi.fn(async () => null),
      joinCouch,
    });

    expect(result.error).toBe("That couch could not be found.");
    expect(joinCouch).not.toHaveBeenCalled();
  });

  it("refuses a private couch by id, so the invite code stays its only way in", async () => {
    const { runJoinPublicCouchAction } = await import("./actions");
    const joinCouch = vi.fn();

    const result = await runJoinPublicCouchAction({ error: null }, form("couch-1"), {
      getCurrentUser: signedIn,
      getCouch: vi.fn(async () => fakeCouch(false)),
      joinCouch,
    });

    expect(result.error).toBe("That couch could not be found.");
    expect(joinCouch).not.toHaveBeenCalled();
  });

  it("maps couch_full to a clear message instead of redirecting", async () => {
    const { runJoinPublicCouchAction } = await import("./actions");
    const joinCouch = vi.fn(async () => ({ ok: false as const, error: "couch_full" as const }));

    const result = await runJoinPublicCouchAction({ error: null }, form("couch-1"), {
      getCurrentUser: signedIn,
      getCouch: vi.fn(async () => fakeCouch()),
      joinCouch,
    });

    expect(result.error).toBe("This couch is full.");
  });

  it("joins with the signed-in user, never an id from the payload, then redirects", async () => {
    const { runJoinPublicCouchAction } = await import("./actions");
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
    const formData = form("couch-1");
    formData.set("userId", "attacker");

    await expect(
      runJoinPublicCouchAction({ error: null }, formData, {
        getCurrentUser: signedIn,
        getCouch: vi.fn(async () => fakeCouch()),
        joinCouch,
      }),
    ).rejects.toThrow("REDIRECT:/couch/couch-1");

    expect(joinCouch).toHaveBeenCalledWith({}, { couchId: "couch-1", userId: "user-2" });
  });
});
