import type { Role } from "@couch/contracts";
import type { CouchRole } from "./generated/prisma/enums";
import type { Couch as CouchRow, CouchMember as CouchMemberRow } from "./generated/prisma/client";

// Pure mapping between database rows and the plain types this package hands
// back to callers. No I/O, no clock, no database client, so it all runs in
// the unit tests.

/** A couch, as returned by the repository. Never a Prisma model type. */
export type Couch = {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  readonly inviteCode: string;
  /** Whether the couch appears in `listPublicCouches`. False unless a host set it. */
  readonly isPublic: boolean;
  /** Whether the couch refuses new members. Existing members are unaffected. */
  readonly isClosed: boolean;
  /** The couch's current media id, or null. Can point at media that has since
   * become unavailable: callers must resolve it through `getCatalogMedia`. */
  readonly currentMediaId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/** One user's membership in one couch. */
export type CouchMembership = {
  readonly id: string;
  readonly couchId: string;
  readonly userId: string;
  readonly role: Role;
  readonly joinedAt: Date;
};

/** One row of `listMembers`: the member plus their display name. */
export type CouchMemberListItem = {
  readonly userId: string;
  readonly displayName: string;
  readonly role: Role;
  readonly joinedAt: Date;
};

/** One row of `listCouchesForUser`: a couch summary plus the caller's role and the couch's member count. */
export type CouchListItem = {
  readonly couch: {
    readonly id: string;
    readonly name: string;
    readonly inviteCode: string;
  };
  readonly role: Role;
  readonly memberCount: number;
};

/** One row of `listPublicCouches`. `media` is null when there is none or it is no longer available. */
export type PublicCouchListItem = {
  readonly id: string;
  readonly name: string;
  readonly memberCount: number;
  readonly media: { readonly title: string; readonly posterUrl: string | null } | null;
};

/** Maps the database `CouchRole` enum to the lowercase contract role. */
export function toContractRole(role: CouchRole): Role {
  return role === "HOST" ? "host" : "participant";
}

/** Maps a contract role to the database `CouchRole` enum. */
export function toDbRole(role: Role): CouchRole {
  return role === "host" ? "HOST" : "PARTICIPANT";
}

export function toCouch(row: CouchRow): Couch {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    inviteCode: row.inviteCode,
    isPublic: row.isPublic,
    isClosed: row.isClosed,
    currentMediaId: row.currentMediaId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toMembership(row: CouchMemberRow): CouchMembership {
  return {
    id: row.id,
    couchId: row.couchId,
    userId: row.userId,
    role: toContractRole(row.role),
    joinedAt: row.joinedAt,
  };
}
