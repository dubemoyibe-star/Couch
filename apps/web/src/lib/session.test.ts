import { describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("./auth", () => ({
  getAuth: () => ({ api: { getSession: getSession } }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

describe("getCurrentUser", () => {
  it("returns null when there is no session", async () => {
    getSession.mockResolvedValueOnce(null);

    const { getCurrentUser } = await import("./session");
    expect(await getCurrentUser()).toBeNull();
  });

  it("maps a session's user to CurrentUser, reading displayName from name", async () => {
    getSession.mockResolvedValueOnce({
      user: { id: "user-1", email: "person@example.com", name: "Person One" },
    });

    const { getCurrentUser } = await import("./session");
    expect(await getCurrentUser()).toEqual({
      id: "user-1",
      email: "person@example.com",
      displayName: "Person One",
    });
  });
});
