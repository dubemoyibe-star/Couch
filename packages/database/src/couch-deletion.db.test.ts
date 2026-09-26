import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestMedia, fixtureMedia, newRunPrefix } from "./catalog-test-support";
import { cleanupTestCouches, createTestUser } from "./couch-test-support";
import {
  assertDatabaseEnv,
  createCouch,
  createPrismaClient,
  deleteCouch,
  getCouch,
  getMembership,
  joinCouch,
  setCurrentMedia,
  upsertCatalogMedia,
  type PrismaClient,
} from "./index";

assertDatabaseEnv(process.env, "test-suite");

const run = randomBytes(4).toString("hex");
const providerPrefix = newRunPrefix();
const userIds: string[] = [];
const MISSING_ID = "00000000-0000-7000-8000-000000000000";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createPrismaClient({ connectionString: process.env.DATABASE_URL ?? "" });
});

afterAll(async () => {
  await cleanupTestCouches(prisma, userIds);
  await cleanupTestMedia(prisma, providerPrefix);
  await prisma.$disconnect();
});

async function makeUser(label: string) {
  const user = await createTestUser(prisma, label);
  userIds.push(user.id);
  return user;
}

const name = (text: string) => `TEST FIXTURE ${run} ${text}`;

describe("deleteCouch", () => {
  it("lets the host delete the couch and its memberships, leaving media and license rows untouched", async () => {
    const owner = await makeUser("del-owner");
    const member = await makeUser("del-member");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: name("delete") });
    await joinCouch(prisma, { couchId: couch.id, userId: member.id });

    const media = await upsertCatalogMedia(
      prisma,
      fixtureMedia(providerPrefix, "deleted-couch-media", "TEST FIXTURE Deleted Couch Media"),
    );
    if (!media) throw new Error("fixture media should be authorized");
    const set = await setCurrentMedia(prisma, { couchId: couch.id, actingUserId: owner.id, mediaId: media.id });
    expect(set.ok && set.value.currentMediaId).toBe(media.id);
    const mediaRow = await prisma.media.findUniqueOrThrow({ where: { id: media.id } });
    expect(await prisma.couchMember.count({ where: { couchId: couch.id } })).toBe(2);

    const result = await deleteCouch(prisma, { couchId: couch.id, actingUserId: owner.id });
    expect(result).toEqual({ ok: true, value: undefined });

    expect(await getCouch(prisma, couch.id)).toBeNull();
    expect(await prisma.couchMember.count({ where: { couchId: couch.id } })).toBe(0);
    expect(await getMembership(prisma, { couchId: couch.id, userId: owner.id })).toBeNull();

    // The users are not deleted, and the media and its license are unchanged.
    expect(await prisma.user.count({ where: { id: { in: [owner.id, member.id] } } })).toBe(2);
    expect(await prisma.media.findUnique({ where: { id: media.id } })).toEqual(mediaRow);
    expect(await prisma.licenseRecord.count({ where: { id: mediaRow.licenseRecordId } })).toBe(1);
  });

  it("does not affect another couch that uses the same media", async () => {
    const owner = await makeUser("shared-owner");
    const other = await makeUser("shared-other");
    const media = await upsertCatalogMedia(
      prisma,
      fixtureMedia(providerPrefix, "shared-media", "TEST FIXTURE Shared Media"),
    );
    if (!media) throw new Error("fixture media should be authorized");
    const first = await createCouch(prisma, { ownerId: owner.id, name: name("shared-a") });
    const second = await createCouch(prisma, { ownerId: other.id, name: name("shared-b") });
    await setCurrentMedia(prisma, { couchId: first.couch.id, actingUserId: owner.id, mediaId: media.id });
    await setCurrentMedia(prisma, { couchId: second.couch.id, actingUserId: other.id, mediaId: media.id });

    await deleteCouch(prisma, { couchId: first.couch.id, actingUserId: owner.id });

    expect((await getCouch(prisma, second.couch.id))?.currentMediaId).toBe(media.id);
    expect(await prisma.couchMember.count({ where: { couchId: second.couch.id } })).toBe(1);
  });

  it("refuses a participant and a non-member, deleting nothing", async () => {
    const owner = await makeUser("forbid-owner");
    const member = await makeUser("forbid-member");
    const stranger = await makeUser("forbid-stranger");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: name("forbid") });
    await joinCouch(prisma, { couchId: couch.id, userId: member.id });

    for (const actor of [member, stranger]) {
      const result = await deleteCouch(prisma, { couchId: couch.id, actingUserId: actor.id });
      expect(result).toEqual({ ok: false, error: "forbidden" });
    }
    expect(await getCouch(prisma, couch.id)).not.toBeNull();
    expect(await prisma.couchMember.count({ where: { couchId: couch.id } })).toBe(2);
  });

  it("returns couch_not_found for an unknown couch", async () => {
    const owner = await makeUser("missing-owner");
    const result = await deleteCouch(prisma, { couchId: MISSING_ID, actingUserId: owner.id });
    expect(result).toEqual({ ok: false, error: "couch_not_found" });
  });

  it("answers couch_not_found the second time the host deletes the same couch", async () => {
    const owner = await makeUser("twice-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: name("twice") });

    expect((await deleteCouch(prisma, { couchId: couch.id, actingUserId: owner.id })).ok).toBe(true);
    expect(await deleteCouch(prisma, { couchId: couch.id, actingUserId: owner.id })).toEqual({
      ok: false,
      error: "couch_not_found",
    });
  });
});
