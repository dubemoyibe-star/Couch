import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestCouches, testEmail } from "./couch-test-support";
import { assertDatabaseEnv, createPrismaClient, deleteUnverifiedUser, type PrismaClient } from "./index";

assertDatabaseEnv(process.env, "test-suite");

// Over Neon a round trip can take seconds, and this transaction stays open
// while the delete waits on it, so it needs more than Prisma's default 5s.
const WRITER_TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 30_000 };

describe("deleteUnverifiedUser", () => {
  let db: PrismaClient;
  const userIds: string[] = [];

  beforeAll(() => {
    db = createPrismaClient({ connectionString: process.env.DATABASE_URL ?? "" });
  });

  afterAll(async () => {
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await cleanupTestCouches(db, userIds);
    await db.$disconnect();
  });

  // An email/password style user: unverified, with a credential account row.
  async function createUser(label: string, emailVerified = false) {
    const email = testEmail(label);
    const user = await db.user.create({
      data: { email, displayName: `TEST FIXTURE ${label}`, emailVerified },
    });
    userIds.push(user.id);
    await db.account.create({
      data: { userId: user.id, accountId: user.id, providerId: "credential", password: "not-a-real-hash" },
    });
    return { id: user.id, email };
  }

  const stillThere = async (id: string) => (await db.user.count({ where: { id } })) === 1;

  it("deletes an unverified user with nothing attached, together with its accounts", async () => {
    const { id, email } = await createUser("clean");

    expect(await deleteUnverifiedUser(db, email)).toEqual({ ok: true });

    expect(await stillThere(id)).toBe(false);
    expect(await db.account.count({ where: { userId: id } })).toBe(0);
  });

  it("matches the email case-insensitively", async () => {
    const { id, email } = await createUser("case");

    expect(await deleteUnverifiedUser(db, email.toUpperCase())).toEqual({ ok: true });
    expect(await stillThere(id)).toBe(false);
  });

  it("reports not_found when no user has the email", async () => {
    expect(await deleteUnverifiedUser(db, testEmail("nobody"))).toEqual({ ok: false, reason: "not_found" });
  });

  it("refuses a verified user and leaves it and its accounts untouched", async () => {
    const { id, email } = await createUser("verified", true);

    expect(await deleteUnverifiedUser(db, email)).toEqual({ ok: false, reason: "verified" });

    expect(await stillThere(id)).toBe(true);
    expect(await db.account.count({ where: { userId: id } })).toBe(1);
  });

  // The three cases below build the data by inserting rows straight into the
  // tables, bypassing the app (which cannot produce them for an unverified
  // user). Each one is the only difference from the "nothing attached" test
  // above, which succeeds, so a refusal here can only come from the check.
  it("refuses an unverified user that owns a couch", async () => {
    const { id, email } = await createUser("owner");
    await db.couch.create({ data: { name: "TEST FIXTURE couch", ownerId: id, inviteCode: randomUUID() } });

    expect(await deleteUnverifiedUser(db, email)).toEqual({ ok: false, reason: "has_data" });

    expect(await stillThere(id)).toBe(true);
    expect(await db.account.count({ where: { userId: id } })).toBe(1);
  });

  it("refuses an unverified user that is a member of a couch", async () => {
    const owner = await createUser("host", true);
    const { id, email } = await createUser("member");
    const couch = await db.couch.create({
      data: { name: "TEST FIXTURE couch", ownerId: owner.id, inviteCode: randomUUID() },
    });
    await db.couchMember.create({ data: { couchId: couch.id, userId: id, role: "PARTICIPANT" } });

    expect(await deleteUnverifiedUser(db, email)).toEqual({ ok: false, reason: "has_data" });

    expect(await stillThere(id)).toBe(true);
  });

  it("refuses an unverified user that has a session", async () => {
    const { id, email } = await createUser("session");
    await db.session.create({
      data: { userId: id, token: randomUUID(), expiresAt: new Date(Date.now() + 60_000) },
    });

    expect(await deleteUnverifiedUser(db, email)).toEqual({ ok: false, reason: "has_data" });

    expect(await stillThere(id)).toBe(true);
  });

  it("re-checks under the row lock: data inserted by a transaction still open is seen", async () => {
    const { id, email } = await createUser("race");
    let insertDone!: () => void;
    const inserted = new Promise<void>((resolve) => (insertDone = resolve));
    let commit!: () => void;
    const gate = new Promise<void>((resolve) => (commit = resolve));

    // A transaction that has inserted a session but not yet committed.
    const writer = db.$transaction(async (tx) => {
      await tx.session.create({
        data: { userId: id, token: randomUUID(), expiresAt: new Date(Date.now() + 60_000) },
      });
      insertDone();
      await gate;
    }, WRITER_TRANSACTION_OPTIONS);
    await inserted;

    // The release has to wait for that transaction (the insert holds a lock on
    // the user row), so it decides only after the session is committed.
    const release = deleteUnverifiedUser(db, email);
    await new Promise((resolve) => setTimeout(resolve, 500));
    commit();
    await writer;

    expect(await release).toEqual({ ok: false, reason: "has_data" });
    expect(await stillThere(id)).toBe(true);
  });
});
