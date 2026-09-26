import { couchNameSchema, ROOM_MEMBERS_MAX } from "@couch/contracts";
import { getCatalogMedia, MAX_CATALOG_PAGE_SIZE } from "./catalog";
import { escapeLikePattern } from "./catalog-mapping";
import {
  toContractRole,
  toCouch,
  toMembership,
  type Couch,
  type CouchListItem,
  type CouchMemberListItem,
  type CouchMembership,
  type PublicCouchListItem,
} from "./couch-mapping";
import { generateInviteCode, withInviteCodeRetry } from "./invite-code";
import { Prisma, type PrismaClient } from "./generated/prisma/client";

// The couch repository. The client is always the first argument, and every
// function returns the plain types in `couch-mapping.ts`, never a Prisma
// model type. Expected domain failures come back as `{ ok: false, error }`;
// only unexpected failures (a connection error, for example) throw. Couch
// name validation reuses the contracts rule (`couchNameSchema`) rather than
// duplicating it.
//
// `Couch.currentMediaId` can point at media that has since become
// unavailable (a takedown deactivates the row, it does not delete it), so a
// caller must always resolve it through `getCatalogMedia` and treat a null
// result the same as a null `currentMediaId`. `setCurrentMedia` enforces this
// at write time: a non-null id must resolve through `getCatalogMedia` in the
// same transaction, or the write is refused.

/** A result type for a repository function that can fail with an expected domain error. */
export type RepoResult<T, E extends string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

function err<E extends string>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

/**
 * True when `error` is a unique constraint violation (Prisma P2002) on
 * `field`. What names the violated constraint inside `error.meta` depends on
 * the database and driver: the classic query engine puts the field name in
 * `meta.target`, while the `@prisma/adapter-pg` driver adapter this package
 * uses nests the Postgres constraint name (for example `Couch_inviteCode_key`,
 * which contains the field name) several levels down instead, at
 * `meta.driverAdapterError.cause.constraint.index`. Rather than pin to one
 * shape, this searches the whole `meta` value as JSON for `field`, which
 * matches either form and stays correct if the shape changes again.
 */
function isUniqueConstraintOn(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  return JSON.stringify(error.meta ?? "").includes(field);
}

export type CreateCouchInput = {
  readonly ownerId: string;
  readonly name: string;
  /** Whether the couch is publicly listed. Defaults to false. */
  readonly isPublic?: boolean;
};

export type CreateCouchDeps = {
  /** Overrides the invite code generator. Used by tests to force a collision. */
  readonly generateInviteCode?: () => string;
};

/**
 * Creates a couch and the owner's HOST membership in one transaction: the two
 * rows exist together or not at all. `name` is validated with the contracts
 * couch name rule and throws (a ZodError) on an invalid name, since a bad
 * name from a trusted caller is a bug, not an expected domain outcome.
 *
 * The invite code is generated server-side (`generateInviteCode`) and retried
 * on a unique collision up to `MAX_INVITE_CODE_ATTEMPTS` times; see
 * `invite-code.ts` for the collision retry mechanics.
 */
export async function createCouch(
  db: PrismaClient,
  input: CreateCouchInput,
  deps: CreateCouchDeps = {},
): Promise<{ couch: Couch; membership: CouchMembership }> {
  const name = couchNameSchema.parse(input.name);

  return withInviteCodeRetry(
    async (inviteCode) =>
      db.$transaction(async (tx) => {
        const couchRow = await tx.couch.create({
          data: { name, ownerId: input.ownerId, inviteCode, isPublic: input.isPublic ?? false },
        });
        const memberRow = await tx.couchMember.create({
          data: { couchId: couchRow.id, userId: input.ownerId, role: "HOST" },
        });
        return { couch: toCouch(couchRow), membership: toMembership(memberRow) };
      }),
    {
      generate: deps.generateInviteCode ?? generateInviteCode,
      isCollision: (error) => isUniqueConstraintOn(error, "inviteCode"),
    },
  );
}

/** One couch by its internal id, or null when it does not exist. */
export async function getCouch(db: PrismaClient, id: string): Promise<Couch | null> {
  const row = await db.couch.findUnique({ where: { id } });
  return row ? toCouch(row) : null;
}

/** One couch by its invite code, or null when no couch has that code. */
export async function getCouchByInviteCode(
  db: PrismaClient,
  inviteCode: string,
): Promise<Couch | null> {
  const row = await db.couch.findUnique({ where: { inviteCode } });
  return row ? toCouch(row) : null;
}

export type JoinCouchInput = {
  readonly couchId: string;
  readonly userId: string;
};

export type JoinCouchError = "couch_not_found" | "couch_closed" | "couch_full";

/**
 * Joins a couch, or returns the existing membership unchanged if the user is
 * already a member (idempotent), including when they are the host: an
 * existing member is never downgraded, and an existing member can rejoin a
 * couch that is otherwise full.
 *
 * A new member is refused with `couch_closed` when the host has closed the
 * couch, and then with `couch_full` once the couch already has
 * `ROOM_MEMBERS_MAX` members. Both checks come after the existing-member
 * check, so a member can always rejoin.
 *
 * Atomicity: the couch row is locked (`SELECT ... FOR UPDATE`) inside the
 * transaction before the membership count is read. A second, concurrent join
 * on the same couch blocks on that lock until the first transaction commits
 * or rolls back, so two simultaneous joins can never both observe room under
 * the cap and both insert: the count each sees already reflects the other's
 * outcome. See `couch.db.test.ts` for a concurrency test that drives many
 * simultaneous joins at the cap.
 *
 * Many simultaneous joins on one couch queue up behind that lock, so this
 * transaction is given a longer wait and run budget than Prisma's default
 * (2s to acquire a slot, 5s to run): `JOIN_TRANSACTION_OPTIONS` below.
 */
export async function joinCouch(
  db: PrismaClient,
  input: JoinCouchInput,
): Promise<RepoResult<CouchMembership, JoinCouchError>> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "Couch" WHERE id = ${input.couchId} FOR UPDATE`,
    );
    if (locked.length === 0) return err("couch_not_found");

    const existing = await tx.couchMember.findUnique({
      where: { couchId_userId: { couchId: input.couchId, userId: input.userId } },
    });
    if (existing) return ok(toMembership(existing));

    const couchState = await tx.couch.findUnique({
      where: { id: input.couchId },
      select: { isClosed: true },
    });
    if (couchState?.isClosed) return err("couch_closed");

    const memberCount = await tx.couchMember.count({ where: { couchId: input.couchId } });
    if (memberCount >= ROOM_MEMBERS_MAX) return err("couch_full");

    const created = await tx.couchMember.create({
      data: { couchId: input.couchId, userId: input.userId, role: "PARTICIPANT" },
    });
    return ok(toMembership(created));
  }, JOIN_TRANSACTION_OPTIONS);
}

/**
 * `maxWait`: how long a join waits to acquire a transaction slot, which
 * includes queueing behind the couch row lock other joins on the same couch
 * hold. `timeout`: how long the transaction may then run. Both are raised
 * well above Prisma's defaults (2s / 5s), since many simultaneous joins on
 * one couch queue up in turn behind that lock.
 */
const JOIN_TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 15_000 };

export type LeaveCouchInput = {
  readonly couchId: string;
  readonly userId: string;
};

export type LeaveCouchError = "not_a_member" | "host_cannot_leave";

/**
 * Removes a member's own membership. The host cannot leave (host transfer is
 * out of scope), and a non-member gets `not_a_member`.
 */
export async function leaveCouch(
  db: PrismaClient,
  input: LeaveCouchInput,
): Promise<RepoResult<void, LeaveCouchError>> {
  const membership = await db.couchMember.findUnique({
    where: { couchId_userId: { couchId: input.couchId, userId: input.userId } },
  });
  if (!membership) return err("not_a_member");
  if (membership.role === "HOST") return err("host_cannot_leave");

  await db.couchMember.delete({ where: { id: membership.id } });
  return ok(undefined);
}

/** One user's membership in one couch, or null when they are not a member. */
export async function getMembership(
  db: PrismaClient,
  input: { readonly couchId: string; readonly userId: string },
): Promise<CouchMembership | null> {
  const row = await db.couchMember.findUnique({
    where: { couchId_userId: { couchId: input.couchId, userId: input.userId } },
  });
  return row ? toMembership(row) : null;
}

/**
 * Every member of a couch, with their display name, ordered deterministically
 * (joined ascending, then user id ascending, so ties resolve the same way
 * every time). Online status is not stored here: it is a realtime concern.
 */
export async function listMembers(db: PrismaClient, couchId: string): Promise<CouchMemberListItem[]> {
  const rows = await db.couchMember.findMany({
    where: { couchId },
    include: { user: { select: { displayName: true } } },
    orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
  });
  return rows.map((row) => ({
    userId: row.userId,
    displayName: row.user.displayName,
    role: row.role === "HOST" ? ("host" as const) : ("participant" as const),
    joinedAt: row.joinedAt,
  }));
}

/**
 * The couches a user is a member of, for the dashboard: a couch summary, the
 * user's own role and the couch's total member count, ordered by the user's
 * own `joinedAt` descending (most recently joined first). This is a summary
 * list, not a membership dump: it does not name other members. `listMembers`
 * already covers that per couch.
 */
export async function listCouchesForUser(db: PrismaClient, userId: string): Promise<CouchListItem[]> {
  const rows = await db.couchMember.findMany({
    where: { userId },
    include: {
      couch: {
        select: {
          id: true,
          name: true,
          inviteCode: true,
          _count: { select: { members: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });
  return rows.map((row) => ({
    couch: {
      id: row.couch.id,
      name: row.couch.name,
      inviteCode: row.couch.inviteCode,
    },
    role: toContractRole(row.role),
    memberCount: row.couch._count.members,
  }));
}

export type RemoveMemberInput = {
  readonly couchId: string;
  readonly actingUserId: string;
  readonly targetUserId: string;
};

export type RemoveMemberError = "forbidden" | "cannot_remove_self" | "not_a_member";

/**
 * Removes a member from a couch. Only a HOST may remove; an actor who is not
 * a member, or who is a member but not the host, gets `forbidden`. The host
 * cannot remove themselves (`cannot_remove_self`; host transfer is out of
 * scope). A target who is not a member gets `not_a_member`.
 */
export async function removeMember(
  db: PrismaClient,
  input: RemoveMemberInput,
): Promise<RepoResult<void, RemoveMemberError>> {
  const actor = await db.couchMember.findUnique({
    where: { couchId_userId: { couchId: input.couchId, userId: input.actingUserId } },
  });
  if (!actor || actor.role !== "HOST") return err("forbidden");
  if (input.targetUserId === input.actingUserId) return err("cannot_remove_self");

  const target = await db.couchMember.findUnique({
    where: { couchId_userId: { couchId: input.couchId, userId: input.targetUserId } },
  });
  if (!target) return err("not_a_member");

  await db.couchMember.delete({ where: { id: target.id } });
  return ok(undefined);
}

export type SetCurrentMediaInput = {
  readonly couchId: string;
  readonly actingUserId: string;
  /** The media to switch to, or null to clear the current media. */
  readonly mediaId: string | null;
};

export type SetCurrentMediaError = "forbidden" | "media_unavailable";

/**
 * Sets, or clears, a couch's current media. Only a HOST may call this. A
 * non-null `mediaId` MUST resolve through `getCatalogMedia` (authorized,
 * active, well-formed) inside the same transaction, or the write is refused
 * with `media_unavailable`; this is the licensing rule enforced at write
 * time. `null` always succeeds and clears the current media.
 */
export async function setCurrentMedia(
  db: PrismaClient,
  input: SetCurrentMediaInput,
): Promise<RepoResult<Couch, SetCurrentMediaError>> {
  return db.$transaction(async (tx) => {
    const actor = await tx.couchMember.findUnique({
      where: { couchId_userId: { couchId: input.couchId, userId: input.actingUserId } },
    });
    if (!actor || actor.role !== "HOST") return err("forbidden");

    if (input.mediaId !== null) {
      const media = await getCatalogMedia(tx, input.mediaId);
      if (!media) return err("media_unavailable");
    }

    const row = await tx.couch.update({
      where: { id: input.couchId },
      data: { currentMediaId: input.mediaId },
    });
    return ok(toCouch(row));
  });
}

// Re-export the role mapper and the plain types callers need to build their
// own values (for example a realtime layer assembling a `room.state` payload).
export { toContractRole, toDbRole } from "./couch-mapping";
export type {
  Couch,
  CouchMembership,
  CouchMemberListItem,
  CouchListItem,
  PublicCouchListItem,
} from "./couch-mapping";

export type SetCouchVisibilityInput = {
  readonly couchId: string;
  readonly actingUserId: string;
  readonly isPublic: boolean;
};

export type SetCouchVisibilityError = "forbidden" | "couch_not_found";

/**
 * Makes a couch public or private. Only a HOST may call this: a non-host
 * member, or a user who is not a member, gets `forbidden`, and a couch that
 * does not exist gets `couch_not_found`.
 */
export async function setCouchVisibility(
  db: PrismaClient,
  input: SetCouchVisibilityInput,
): Promise<RepoResult<Couch, SetCouchVisibilityError>> {
  return db.$transaction(async (tx) => {
    const couch = await tx.couch.findUnique({ where: { id: input.couchId }, select: { id: true } });
    if (!couch) return err("couch_not_found");

    const actor = await tx.couchMember.findUnique({
      where: { couchId_userId: { couchId: input.couchId, userId: input.actingUserId } },
    });
    if (!actor || actor.role !== "HOST") return err("forbidden");

    const row = await tx.couch.update({
      where: { id: input.couchId },
      data: { isPublic: input.isPublic },
    });
    return ok(toCouch(row));
  });
}

export type SetCouchClosedInput = {
  readonly couchId: string;
  readonly actingUserId: string;
  readonly isClosed: boolean;
};

export type SetCouchClosedError = "forbidden" | "couch_not_found";

/**
 * Closes or reopens a couch. A closed couch refuses new members
 * (`joinCouch`) and is left out of `listPublicCouches`; existing members are
 * unaffected. Only a HOST may call this: a non-host member, or a user who is
 * not a member, gets `forbidden`, and a couch that does not exist gets
 * `couch_not_found`.
 */
export async function setCouchClosed(
  db: PrismaClient,
  input: SetCouchClosedInput,
): Promise<RepoResult<Couch, SetCouchClosedError>> {
  return db.$transaction(async (tx) => {
    const couch = await tx.couch.findUnique({ where: { id: input.couchId }, select: { id: true } });
    if (!couch) return err("couch_not_found");

    const actor = await tx.couchMember.findUnique({
      where: { couchId_userId: { couchId: input.couchId, userId: input.actingUserId } },
    });
    if (!actor || actor.role !== "HOST") return err("forbidden");

    const row = await tx.couch.update({
      where: { id: input.couchId },
      data: { isClosed: input.isClosed },
    });
    return ok(toCouch(row));
  });
}

export type DeleteCouchInput = {
  readonly couchId: string;
  readonly actingUserId: string;
};

export type DeleteCouchError = "forbidden" | "couch_not_found";

/**
 * Permanently deletes a couch. Only a HOST may call this: a non-host member,
 * or a user who is not a member, gets `forbidden`, and a couch that does not
 * exist gets `couch_not_found`. The couch's memberships go with it
 * (`CouchMember.couchId` is `onDelete: Cascade`). Media and license rows
 * belong to the catalog, not to a couch, and are never touched.
 *
 * This is the one deliberate couch delete. The host check and the delete run
 * in one transaction, and `deleteMany` keeps a concurrent delete of the same
 * couch from throwing: the loser sees a count of zero and answers
 * `couch_not_found`.
 */
export async function deleteCouch(
  db: PrismaClient,
  input: DeleteCouchInput,
): Promise<RepoResult<void, DeleteCouchError>> {
  return db.$transaction(async (tx) => {
    const couch = await tx.couch.findUnique({ where: { id: input.couchId }, select: { id: true } });
    if (!couch) return err("couch_not_found");

    const actor = await tx.couchMember.findUnique({
      where: { couchId_userId: { couchId: input.couchId, userId: input.actingUserId } },
    });
    if (!actor || actor.role !== "HOST") return err("forbidden");

    const { count } = await tx.couch.deleteMany({ where: { id: input.couchId } });
    if (count === 0) return err("couch_not_found");
    return ok(undefined);
  });
}

export type ListPublicCouchesOptions = {
  /** Case-insensitive substring of the couch name. `%`, `_` and `\` are literal text. */
  readonly query?: string;
  /** An integer from 1 to `MAX_CATALOG_PAGE_SIZE`. Anything else throws a RangeError. */
  readonly limit: number;
  /** The `nextCursor` of the previous page. */
  readonly cursor?: string;
};

export type PublicCouchPage = {
  readonly items: PublicCouchListItem[];
  /** Pass it as `cursor` to get the next page. Null when there are no more rows. */
  readonly nextCursor: string | null;
};

/**
 * One page of public couches, ordered by name and then id, both ascending,
 * paged by the id of the last row like `listCatalogMedia`. Only `isPublic`
 * couches that are not closed are returned. `media` is resolved through `getCatalogMedia`, never
 * from the stored id alone, so a couch whose media was taken down, made
 * inactive or is no longer authorized reports `media: null`. A cursor that
 * matches no couch throws a RangeError, whether the caller made it up or the
 * couch was deleted between pages.
 */
export async function listPublicCouches(
  db: PrismaClient,
  options: ListPublicCouchesOptions,
): Promise<PublicCouchPage> {
  const { query, limit, cursor } = options;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CATALOG_PAGE_SIZE) {
    throw new RangeError(`limit must be an integer from 1 to ${MAX_CATALOG_PAGE_SIZE}`);
  }

  // Same escaping as the catalog title search: the client does not escape
  // `%` and `_` in `contains`.
  const nameFilter = query
    ? { name: { contains: escapeLikePattern(query), mode: "insensitive" as const } }
    : {};

  // Keyset paging, as in `listCatalogMedia`. The cursor row is read without
  // the public filter: it may have gone private since the last page, and that
  // must not skip a valid row.
  let afterCursor = {};
  if (cursor !== undefined) {
    const anchor = await db.couch.findUnique({
      where: { id: cursor },
      select: { id: true, name: true },
    });
    if (!anchor) throw new RangeError("cursor does not match a couch");
    afterCursor = {
      OR: [{ name: { gt: anchor.name } }, { name: anchor.name, id: { gt: anchor.id } }],
    };
  }

  // One extra row tells whether another page exists.
  const rows = await db.couch.findMany({
    where: { AND: [{ isPublic: true }, { isClosed: false }, nameFilter, afterCursor] },
    select: {
      id: true,
      name: true,
      currentMediaId: true,
      _count: { select: { members: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: limit + 1,
  });

  const page = rows.slice(0, limit);
  const items: PublicCouchListItem[] = [];
  for (const row of page) {
    const media = row.currentMediaId ? await getCatalogMedia(db, row.currentMediaId) : null;
    items.push({
      id: row.id,
      name: row.name,
      memberCount: row._count.members,
      media: media ? { title: media.title, posterUrl: media.posterUrl } : null,
    });
  }

  const last = page[page.length - 1];
  return { items, nextCursor: rows.length > limit && last ? last.id : null };
}
