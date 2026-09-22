import { randomUUID } from "node:crypto";
import { ROOM_MEMBERS_MAX } from "@couch/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestMedia, fixtureMedia, newRunPrefix } from "./catalog-test-support";
import { cleanupTestCouches, createTestUser, createTestUsers } from "./couch-test-support";
import {
  assertDatabaseEnv,
  createCouch,
  createPrismaClient,
  generateInviteCode,
  getCouch,
  getCouchByInviteCode,
  getMembership,
  joinCouch,
  leaveCouch,
  listCouchesForUser,
  listMembers,
  removeMember,
  setCurrentMedia,
  upsertCatalogMedia,
  type PrismaClient,
} from "./index";

assertDatabaseEnv(process.env, "test-suite");

// Every user this file creates is tracked here, and every media row uses this
// run's provider prefix, so teardown removes exactly what this run created.
const providerPrefix = newRunPrefix();
const userIds: string[] = [];

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

async function makeUsers(label: string, count: number) {
  const ids = await createTestUsers(prisma, label, count);
  userIds.push(...ids);
  return ids;
}

describe("createCouch", () => {
  it("creates the couch and the owner's host membership together, atomically", async () => {
    const owner = await makeUser("create");
    const { couch, membership } = await createCouch(prisma, {
      ownerId: owner.id,
      name: "TEST FIXTURE Couch",
    });

    expect(couch.ownerId).toBe(owner.id);
    expect(couch.name).toBe("TEST FIXTURE Couch");
    expect(couch.currentMediaId).toBeNull();
    expect(typeof couch.inviteCode).toBe("string");
    expect(couch.inviteCode.length).toBeGreaterThan(0);

    expect(membership.couchId).toBe(couch.id);
    expect(membership.userId).toBe(owner.id);
    expect(membership.role).toBe("host");

    // Both rows exist together: the couch and the host membership.
    expect(await getCouch(prisma, couch.id)).toMatchObject({ id: couch.id, ownerId: owner.id });
    expect(await getMembership(prisma, { couchId: couch.id, userId: owner.id })).toMatchObject({
      role: "host",
    });

    const byInvite = await getCouchByInviteCode(prisma, couch.inviteCode);
    expect(byInvite?.id).toBe(couch.id);
  });

  it("rejects an invalid couch name and creates nothing", async () => {
    const owner = await makeUser("bad-name");
    await expect(createCouch(prisma, { ownerId: owner.id, name: "" })).rejects.toThrow();
    await expect(
      createCouch(prisma, { ownerId: owner.id, name: "line one\nline two" }),
    ).rejects.toThrow();
    expect(await prisma.couch.count({ where: { ownerId: owner.id } })).toBe(0);
  });

  it("retries invite code generation after a real unique collision", async () => {
    const owner = await makeUser("collision");
    const first = await createCouch(prisma, {
      ownerId: owner.id,
      name: "TEST FIXTURE Collision A",
    });

    let calls = 0;
    const generate = () => {
      calls += 1;
      return calls === 1 ? first.couch.inviteCode : generateInviteCode();
    };

    const second = await createCouch(
      prisma,
      { ownerId: owner.id, name: "TEST FIXTURE Collision B" },
      { generateInviteCode: generate },
    );

    expect(calls).toBeGreaterThanOrEqual(2);
    expect(second.couch.inviteCode).not.toBe(first.couch.inviteCode);
    expect(await prisma.couch.count({ where: { id: { in: [first.couch.id, second.couch.id] } } })).toBe(
      2,
    );
  });
});

describe("joinCouch", () => {
  it("returns couch_not_found for a couch that does not exist", async () => {
    const user = await makeUser("no-couch");
    expect(await joinCouch(prisma, { couchId: randomUUID(), userId: user.id })).toEqual({
      ok: false,
      error: "couch_not_found",
    });
  });

  it("is idempotent for an existing member, and never downgrades the host", async () => {
    const owner = await makeUser("join-idem-owner");
    const participant = await makeUser("join-idem-participant");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: "TEST FIXTURE Idempotent" });

    const joined = await joinCouch(prisma, { couchId: couch.id, userId: participant.id });
    expect(joined).toMatchObject({ ok: true, value: { role: "participant" } });
    const joinedId = joined.ok ? joined.value.id : null;

    const joinedAgain = await joinCouch(prisma, { couchId: couch.id, userId: participant.id });
    expect(joinedAgain).toMatchObject({ ok: true, value: { id: joinedId, role: "participant" } });

    // The host rejoining stays the host: never downgraded to participant.
    const hostJoin = await joinCouch(prisma, { couchId: couch.id, userId: owner.id });
    expect(hostJoin).toMatchObject({ ok: true, value: { role: "host" } });

    expect(await prisma.couchMember.count({ where: { couchId: couch.id } })).toBe(2);
  });

  it("rejects a direct duplicate membership row with the unique constraint", async () => {
    const owner = await makeUser("unique-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: "TEST FIXTURE Unique" });

    await expect(
      prisma.couchMember.create({
        data: { couchId: couch.id, userId: owner.id, role: "PARTICIPANT" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(await prisma.couchMember.count({ where: { couchId: couch.id } })).toBe(1);
  });

  it("refuses a new member once the couch is full, but an existing member can still rejoin", async () => {
    const owner = await makeUser("cap-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: "TEST FIXTURE Capacity" });

    // The host is 1 member. Fill the rest of the cap with participants in one
    // round trip, since joining ROOM_MEMBERS_MAX - 1 users one at a time would
    // be slow.
    const participantIds = await makeUsers("cap-participant", ROOM_MEMBERS_MAX - 1);
    await prisma.couchMember.createMany({
      data: participantIds.map((userId) => ({
        couchId: couch.id,
        userId,
        role: "PARTICIPANT" as const,
      })),
    });
    expect(await prisma.couchMember.count({ where: { couchId: couch.id } })).toBe(ROOM_MEMBERS_MAX);

    const overflow = await makeUser("cap-overflow");
    expect(await joinCouch(prisma, { couchId: couch.id, userId: overflow.id })).toEqual({
      ok: false,
      error: "couch_full",
    });

    // An existing member, including the host, still succeeds on a full couch.
    expect(await joinCouch(prisma, { couchId: couch.id, userId: owner.id })).toMatchObject({
      ok: true,
      value: { role: "host" },
    });
    const firstParticipant = participantIds[0];
    if (firstParticipant === undefined) throw new Error("expected at least one participant");
    expect(await joinCouch(prisma, { couchId: couch.id, userId: firstParticipant })).toMatchObject({
      ok: true,
    });

    expect(await prisma.couchMember.count({ where: { couchId: couch.id } })).toBe(ROOM_MEMBERS_MAX);
  });

  it("never lets concurrent joins push membership past the cap", async () => {
    const owner = await makeUser("race-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: "TEST FIXTURE Race" });

    // The host is 1 member. Leave exactly 2 free slots, then fire 10
    // simultaneous joins at the couch: exactly 2 may succeed. The couch row
    // is locked (SELECT ... FOR UPDATE) inside each join's transaction, so a
    // second join blocks until the first commits or rolls back and never
    // reads a membership count that is already stale.
    const freeSlots = 2;
    const fillCount = ROOM_MEMBERS_MAX - 1 - freeSlots;
    const fillerIds = await makeUsers("race-filler", fillCount);
    await prisma.couchMember.createMany({
      data: fillerIds.map((userId) => ({
        couchId: couch.id,
        userId,
        role: "PARTICIPANT" as const,
      })),
    });

    const racerIds = await makeUsers("race-joiner", 10);
    const results = await Promise.all(
      racerIds.map((userId) => joinCouch(prisma, { couchId: couch.id, userId })),
    );

    const succeeded = results.filter((result) => result.ok);
    const refused = results.filter((result) => !result.ok);
    expect(succeeded).toHaveLength(freeSlots);
    expect(refused).toHaveLength(racerIds.length - freeSlots);
    for (const result of refused) {
      if (!result.ok) expect(result.error).toBe("couch_full");
    }

    expect(await prisma.couchMember.count({ where: { couchId: couch.id } })).toBe(ROOM_MEMBERS_MAX);
  });
});

describe("leaveCouch", () => {
  it("refuses the host, and reports not_a_member for a non-member", async () => {
    const owner = await makeUser("leave-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: "TEST FIXTURE Leave" });

    expect(await leaveCouch(prisma, { couchId: couch.id, userId: owner.id })).toEqual({
      ok: false,
      error: "host_cannot_leave",
    });

    const stranger = await makeUser("leave-stranger");
    expect(await leaveCouch(prisma, { couchId: couch.id, userId: stranger.id })).toEqual({
      ok: false,
      error: "not_a_member",
    });
  });

  it("removes a participant's own membership", async () => {
    const owner = await makeUser("leave-owner-2");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: "TEST FIXTURE Leave 2" });
    const participant = await makeUser("leave-participant");
    await joinCouch(prisma, { couchId: couch.id, userId: participant.id });

    expect(await leaveCouch(prisma, { couchId: couch.id, userId: participant.id })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await getMembership(prisma, { couchId: couch.id, userId: participant.id })).toBeNull();
  });
});

describe("removeMember", () => {
  it("rejects a non-host actor with forbidden", async () => {
    const owner = await makeUser("remove-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: "TEST FIXTURE Remove" });
    const participant = await makeUser("remove-participant");
    const bystander = await makeUser("remove-bystander");
    await joinCouch(prisma, { couchId: couch.id, userId: participant.id });
    await joinCouch(prisma, { couchId: couch.id, userId: bystander.id });

    expect(
      await removeMember(prisma, {
        couchId: couch.id,
        actingUserId: participant.id,
        targetUserId: bystander.id,
      }),
    ).toEqual({ ok: false, error: "forbidden" });
    expect(await getMembership(prisma, { couchId: couch.id, userId: bystander.id })).not.toBeNull();
  });

  it("the host cannot remove self", async () => {
    const owner = await makeUser("remove-self-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: "TEST FIXTURE Self" });

    expect(
      await removeMember(prisma, { couchId: couch.id, actingUserId: owner.id, targetUserId: owner.id }),
    ).toEqual({ ok: false, error: "cannot_remove_self" });
    expect(await getMembership(prisma, { couchId: couch.id, userId: owner.id })).not.toBeNull();
  });

  it("reports not_a_member for a target who is not a member", async () => {
    const owner = await makeUser("remove-target-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: "TEST FIXTURE Target" });
    const outsider = await makeUser("remove-outsider");

    expect(
      await removeMember(prisma, {
        couchId: couch.id,
        actingUserId: owner.id,
        targetUserId: outsider.id,
      }),
    ).toEqual({ ok: false, error: "not_a_member" });
  });

  it("a host removes a member", async () => {
    const owner = await makeUser("remove-success-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: "TEST FIXTURE Success" });
    const participant = await makeUser("remove-success-participant");
    await joinCouch(prisma, { couchId: couch.id, userId: participant.id });

    expect(
      await removeMember(prisma, {
        couchId: couch.id,
        actingUserId: owner.id,
        targetUserId: participant.id,
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(await getMembership(prisma, { couchId: couch.id, userId: participant.id })).toBeNull();
  });
});

describe("listMembers", () => {
  it("lists members with display names, ordered deterministically", async () => {
    const owner = await makeUser("list-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: "TEST FIXTURE List" });
    const participant = await makeUser("list-participant");
    await joinCouch(prisma, { couchId: couch.id, userId: participant.id });

    const members = await listMembers(prisma, couch.id);
    expect(members.map((member) => member.userId)).toEqual([owner.id, participant.id]);
    expect(members[0]).toMatchObject({ role: "host", displayName: expect.any(String) });
    expect(members[1]).toMatchObject({ role: "participant", displayName: expect.any(String) });
  });
});

describe("listCouchesForUser", () => {
  it("returns an empty array for a user with no memberships", async () => {
    const user = await makeUser("list-couches-none");
    expect(await listCouchesForUser(prisma, user.id)).toEqual([]);
  });

  it("lists a couch the user hosts and one they participate in, with member counts, ordered by joinedAt descending", async () => {
    const user = await makeUser("list-couches-user");

    const { couch: hosted } = await createCouch(prisma, {
      ownerId: user.id,
      name: "TEST FIXTURE List Couches Hosted",
    });

    const otherOwner = await makeUser("list-couches-other-owner");
    const { couch: joined } = await createCouch(prisma, {
      ownerId: otherOwner.id,
      name: "TEST FIXTURE List Couches Joined",
    });
    await joinCouch(prisma, { couchId: joined.id, userId: user.id });

    // A bystander in the joined couch, so memberCount there is 2 (owner + user).
    const bystander = await makeUser("list-couches-bystander");
    await joinCouch(prisma, { couchId: joined.id, userId: bystander.id });

    // Fix the user's own joinedAt timestamps explicitly, so ordering is
    // deterministic instead of depending on the wall clock between two
    // round trips in the same test run.
    const earlier = new Date("2020-01-01T00:00:00.000Z");
    const later = new Date("2020-01-02T00:00:00.000Z");
    await prisma.couchMember.update({
      where: { couchId_userId: { couchId: hosted.id, userId: user.id } },
      data: { joinedAt: earlier },
    });
    await prisma.couchMember.update({
      where: { couchId_userId: { couchId: joined.id, userId: user.id } },
      data: { joinedAt: later },
    });

    const list = await listCouchesForUser(prisma, user.id);
    expect(list).toEqual([
      {
        couch: { id: joined.id, name: joined.name, inviteCode: joined.inviteCode },
        role: "participant",
        memberCount: 3,
      },
      {
        couch: { id: hosted.id, name: hosted.name, inviteCode: hosted.inviteCode },
        role: "host",
        memberCount: 1,
      },
    ]);
  });
});

describe("setCurrentMedia", () => {
  it("only a host may set it", async () => {
    const owner = await makeUser("media-forbidden-owner");
    const participant = await makeUser("media-forbidden-participant");
    const { couch } = await createCouch(prisma, {
      ownerId: owner.id,
      name: "TEST FIXTURE Media Forbidden",
    });
    await joinCouch(prisma, { couchId: couch.id, userId: participant.id });

    const authorized = await upsertCatalogMedia(
      prisma,
      fixtureMedia(providerPrefix, "forbidden-target", "TEST FIXTURE Forbidden Target"),
    );
    expect(authorized).not.toBeNull();
    const mediaId = authorized?.id;
    if (mediaId === undefined) throw new Error("expected media to be saved");

    expect(
      await setCurrentMedia(prisma, { couchId: couch.id, actingUserId: participant.id, mediaId }),
    ).toEqual({ ok: false, error: "forbidden" });
    expect(await getCouch(prisma, couch.id)).toMatchObject({ currentMediaId: null });
  });

  it("rejects an unauthorized item, an inactive item and a missing id; accepts an authorized item; null clears it", async () => {
    const owner = await makeUser("media-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: "TEST FIXTURE SetMedia" });

    const authorized = await upsertCatalogMedia(
      prisma,
      fixtureMedia(providerPrefix, "authorized", "TEST FIXTURE Authorized"),
    );
    expect(authorized).not.toBeNull();
    const authorizedId = authorized?.id;
    if (authorizedId === undefined) throw new Error("expected authorized media to be saved");

    const unauthorizedResult = await upsertCatalogMedia(
      prisma,
      fixtureMedia(providerPrefix, "unauthorized", "TEST FIXTURE Unauthorized", {
        license: { intendedUseAllowed: false },
      }),
    );
    expect(unauthorizedResult).toBeNull();
    const unauthorizedRow = await prisma.media.findFirstOrThrow({
      where: { providerId: providerPrefix, providerMediaId: "unauthorized" },
    });

    const inactive = await upsertCatalogMedia(
      prisma,
      fixtureMedia(providerPrefix, "inactive", "TEST FIXTURE Inactive"),
    );
    expect(inactive).not.toBeNull();
    const inactiveId = inactive?.id;
    if (inactiveId === undefined) throw new Error("expected inactive media to be saved");
    await prisma.media.update({ where: { id: inactiveId }, data: { isActive: false } });

    // Unauthorized item.
    expect(
      await setCurrentMedia(prisma, {
        couchId: couch.id,
        actingUserId: owner.id,
        mediaId: unauthorizedRow.id,
      }),
    ).toEqual({ ok: false, error: "media_unavailable" });

    // Inactive item.
    expect(
      await setCurrentMedia(prisma, { couchId: couch.id, actingUserId: owner.id, mediaId: inactiveId }),
    ).toEqual({ ok: false, error: "media_unavailable" });

    // Missing id.
    expect(
      await setCurrentMedia(prisma, {
        couchId: couch.id,
        actingUserId: owner.id,
        mediaId: randomUUID(),
      }),
    ).toEqual({ ok: false, error: "media_unavailable" });

    // None of the rejected writes changed the couch.
    expect(await getCouch(prisma, couch.id)).toMatchObject({ currentMediaId: null });

    // Authorized item: accepted.
    const accepted = await setCurrentMedia(prisma, {
      couchId: couch.id,
      actingUserId: owner.id,
      mediaId: authorizedId,
    });
    expect(accepted).toMatchObject({ ok: true, value: { currentMediaId: authorizedId } });

    // null clears it.
    const cleared = await setCurrentMedia(prisma, {
      couchId: couch.id,
      actingUserId: owner.id,
      mediaId: null,
    });
    expect(cleared).toMatchObject({ ok: true, value: { currentMediaId: null } });
  });
});
