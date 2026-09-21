import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDatabaseEnv, createPrismaClient, type PrismaClient } from "./index";

assertDatabaseEnv(process.env, "test-suite");

// UUIDv7: version nibble 7, RFC 4122 variant.
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("User", () => {
  let prisma: PrismaClient;
  // A unique address per run, so parallel or repeated runs never collide.
  const email = `user-${randomUUID()}@example.test`;

  beforeAll(() => {
    prisma = createPrismaClient({ connectionString: process.env.DATABASE_URL ?? "" });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("creates a user with a UUID id and reads it back", async () => {
    const created = await prisma.user.create({
      data: { email, displayName: "Db Test" },
    });
    expect(created.id).toMatch(UUID_V7);

    const found = await prisma.user.findUnique({ where: { id: created.id } });
    expect(found).toMatchObject({ id: created.id, email, displayName: "Db Test" });
  });

  it("rejects a second user with the same email", async () => {
    await expect(
      prisma.user.create({ data: { email, displayName: "Duplicate" } }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });
});
