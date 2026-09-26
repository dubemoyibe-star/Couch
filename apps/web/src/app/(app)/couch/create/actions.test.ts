import { describe, expect, it, vi } from "vitest";
import { couchNameSchema } from "@couch/contracts";

vi.mock("@couch/database", () => ({
  getPrismaClient: vi.fn(() => ({})),
}));

// Every test here exercises `runCreateCouchAction` with a stubbed
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

describe("runCreateCouchAction", () => {
  it("rejects when getCurrentUser returns null, without calling createCouch", async () => {
    const { runCreateCouchAction } = await import("./actions");
    const createCouch = vi.fn();
    const formData = new FormData();
    formData.set("name", "Movie night");

    const result = await runCreateCouchAction(
      { error: null },
      formData,
      { getCurrentUser: async () => null, createCouch },
    );

    expect(result.error).toBe("You must be signed in to create a couch.");
    expect(createCouch).not.toHaveBeenCalled();
  });

  it("rejects an invalid name before calling createCouch", async () => {
    const { runCreateCouchAction } = await import("./actions");
    const createCouch = vi.fn();
    const formData = new FormData();
    formData.set("name", "   ");

    const result = await runCreateCouchAction(
      { error: null },
      formData,
      {
        getCurrentUser: async () => ({ id: "user-1", email: "a@b.com", displayName: "A" }),
        createCouch,
      },
    );

    expect(result.error).toBeTruthy();
    expect(createCouch).not.toHaveBeenCalled();
    // Confirms the client and server share one name rule: the same input the
    // server rejects also fails the contracts schema directly.
    expect(couchNameSchema.safeParse("   ").success).toBe(false);
  });

  it("calls createCouch with the signed-in user as owner, then redirects to the new couch", async () => {
    const { runCreateCouchAction } = await import("./actions");
    const createCouch = vi.fn(async () => ({
      couch: {
        id: "couch-1",
        name: "Movie night",
        ownerId: "user-1",
        inviteCode: "abc",
        isPublic: false,
        currentMediaId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      membership: {
        id: "member-1",
        couchId: "couch-1",
        userId: "user-1",
        role: "host" as const,
        joinedAt: new Date(),
      },
    }));
    const formData = new FormData();
    formData.set("name", "Movie night");

    await expect(
      runCreateCouchAction(
        { error: null },
        formData,
        {
          getCurrentUser: async () => ({ id: "user-1", email: "a@b.com", displayName: "A" }),
          createCouch,
        },
      ),
    ).rejects.toThrow("REDIRECT:/couch/couch-1");

    expect(createCouch).toHaveBeenCalledWith({}, { ownerId: "user-1", name: "Movie night" });
  });
});
