import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestCouches, createTestUser } from "./couch-test-support";
import {
  assertDatabaseEnv,
  createCouch,
  createPrismaClient,
  getCouch,
  joinCouch,
  listPublicCouches,
  MAX_CATALOG_PAGE_SIZE,
  setCouchClosed,
  type PrismaClient,
} from "./index";

assertDatabaseEnv(process.env, "test-suite");

const run = randomBytes(4).toString("hex");
const userIds: string[] = [];
const MISSING_ID = "00000000-0000-7000-8000-000000000000";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createPrismaClient({ connectionString: process.env.DATABASE_URL ?? "" });
});

afterAll(async () => {
  await cleanupTestCouches(prisma, userIds);
  await prisma.$disconnect();
});

async function makeUser(label: string) {
  const user = await createTestUser(prisma, label);
  userIds.push(user.id);
  return user;
}

const name = (text: string) => `TEST FIXTURE ${run} ${text}`;

async function listedIds(text: string): Promise<string[]> {
  const page = await listPublicCouches(prisma, { query: name(text), limit: MAX_CATALOG_PAGE_SIZE });
  return page.items.map((item) => item.id);
}

describe("setCouchClosed", () => {
  it("defaults to open", async () => {
    const owner = await makeUser("default-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: name("default") });
    expect(couch.isClosed).toBe(false);
  });

  it("lets the host close and reopen", async () => {
    const owner = await makeUser("toggle-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: name("toggle") });

    const closed = await setCouchClosed(prisma, { couchId: couch.id, actingUserId: owner.id, isClosed: true });
    expect(closed.ok && closed.value.isClosed).toBe(true);
    expect((await getCouch(prisma, couch.id))?.isClosed).toBe(true);

    const reopened = await setCouchClosed(prisma, { couchId: couch.id, actingUserId: owner.id, isClosed: false });
    expect(reopened.ok && reopened.value.isClosed).toBe(false);
  });

  it("refuses a participant and a non-member, leaving the couch unchanged", async () => {
    const owner = await makeUser("forbid-owner");
    const member = await makeUser("forbid-member");
    const stranger = await makeUser("forbid-stranger");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: name("forbid") });
    await joinCouch(prisma, { couchId: couch.id, userId: member.id });

    for (const actor of [member, stranger]) {
      const result = await setCouchClosed(prisma, { couchId: couch.id, actingUserId: actor.id, isClosed: true });
      expect(result).toEqual({ ok: false, error: "forbidden" });
    }
    expect((await getCouch(prisma, couch.id))?.isClosed).toBe(false);
  });

  it("returns couch_not_found for an unknown couch", async () => {
    const owner = await makeUser("missing-owner");
    const result = await setCouchClosed(prisma, { couchId: MISSING_ID, actingUserId: owner.id, isClosed: true });
    expect(result).toEqual({ ok: false, error: "couch_not_found" });
  });
});

describe("joinCouch on a closed couch", () => {
  it("refuses a new joiner, keeps existing members, and joins again after reopening", async () => {
    const owner = await makeUser("join-owner");
    const member = await makeUser("join-member");
    const newcomer = await makeUser("join-newcomer");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: name("join") });
    await joinCouch(prisma, { couchId: couch.id, userId: member.id });

    await setCouchClosed(prisma, { couchId: couch.id, actingUserId: owner.id, isClosed: true });

    expect(await joinCouch(prisma, { couchId: couch.id, userId: newcomer.id })).toEqual({
      ok: false,
      error: "couch_closed",
    });
    const rejoin = await joinCouch(prisma, { couchId: couch.id, userId: member.id });
    expect(rejoin.ok && rejoin.value.role).toBe("participant");
    const hostRejoin = await joinCouch(prisma, { couchId: couch.id, userId: owner.id });
    expect(hostRejoin.ok && hostRejoin.value.role).toBe("host");
    expect(await prisma.couchMember.count({ where: { couchId: couch.id } })).toBe(2);

    await setCouchClosed(prisma, { couchId: couch.id, actingUserId: owner.id, isClosed: false });
    const joined = await joinCouch(prisma, { couchId: couch.id, userId: newcomer.id });
    expect(joined.ok && joined.value.role).toBe("participant");
  });
});

describe("listPublicCouches and closed couches", () => {
  it("leaves out a closed public couch and lists it again once reopened", async () => {
    const owner = await makeUser("list-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: name("list"), isPublic: true });
    expect(await listedIds("list")).toEqual([couch.id]);

    await setCouchClosed(prisma, { couchId: couch.id, actingUserId: owner.id, isClosed: true });
    expect(await listedIds("list")).toEqual([]);

    await setCouchClosed(prisma, { couchId: couch.id, actingUserId: owner.id, isClosed: false });
    expect(await listedIds("list")).toEqual([couch.id]);
  });
});
