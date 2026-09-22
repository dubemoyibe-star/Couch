import { randomUUID } from "node:crypto";
import type { PrismaClient } from "./generated/prisma/client";

// Helpers for the couch database tests. This file is NOT exported from the
// package. `cleanupTestCouches` deletes rows, and the package exports no
// delete for users or couches. Every fixture is obviously fake: emails end in
// `@example.test` and couch names and display names start with "TEST FIXTURE".

/** A run-unique email, so parallel or repeated runs never collide. */
export function testEmail(label: string): string {
  return `couch-test-${label}-${randomUUID()}@example.test`;
}

/** Creates a throwaway user for a couch test. */
export async function createTestUser(
  db: PrismaClient,
  label: string,
  overrides: { displayName?: string } = {},
): Promise<{ id: string; email: string }> {
  const email = testEmail(label);
  const user = await db.user.create({
    data: { email, displayName: overrides.displayName ?? `TEST FIXTURE ${label}` },
  });
  return { id: user.id, email };
}

/**
 * Creates `count` throwaway users in one round trip (`createMany`) and
 * returns their ids, read back by the shared email prefix all of them got.
 * Used for tests that need to fill a couch close to `ROOM_MEMBERS_MAX`,
 * where creating users one at a time would be slow.
 */
export async function createTestUsers(db: PrismaClient, label: string, count: number): Promise<string[]> {
  const prefix = `couch-test-${label}-${randomUUID()}`;
  await db.user.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      email: `${prefix}-${i}@example.test`,
      displayName: `TEST FIXTURE ${label} ${i}`,
    })),
  });
  const created = await db.user.findMany({
    where: { email: { startsWith: prefix } },
    select: { id: true },
  });
  return created.map((row) => row.id);
}

/**
 * Deletes every row a suite could have created, given the user ids it
 * created. Members and couches are removed first, then the users, because
 * `CouchMember.userId` and `Couch.ownerId` are `onDelete: Restrict`.
 */
export async function cleanupTestCouches(db: PrismaClient, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await db.couchMember.deleteMany({ where: { userId: { in: userIds } } });
  await db.couch.deleteMany({ where: { ownerId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
}
