import { Prisma, type PrismaClient } from "./generated/prisma/client";

/**
 * Why an unverified user was not deleted.
 * - `not_found`: no user has this email (nothing to delete).
 * - `verified`: the user's email is verified, so it is not an unverified squatter.
 * - `has_data`: the user owns a couch, is a couch member, or has a session.
 */
export type DeleteUnverifiedUserResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "not_found" | "verified" | "has_data" };

/**
 * Deletes the user with this email, and its accounts, only if the user is
 * unverified and has nothing attached: no owned couch, no couch membership, no
 * session. The checks and the delete run in one transaction and are decided
 * from the database at that moment, never from anything the caller remembered.
 *
 * Race safety: the user row is locked (`SELECT ... FOR UPDATE`) before the
 * checks. Inserting a couch, a membership or a session takes a key-share lock
 * on the user row for its foreign key, so a concurrent insert waits for this
 * transaction and then fails against the deleted row. The delete also repeats
 * the `emailVerified = false` condition, and the couch and membership foreign
 * keys are `onDelete: Restrict`, so the database itself refuses the delete if
 * data appeared anyway (reported as `has_data`).
 *
 * Deleting the user removes its `Account` rows (`onDelete: Cascade`); they are
 * deleted explicitly first so the intent does not depend on the cascade.
 */
export async function deleteUnverifiedUser(
  db: PrismaClient,
  email: string,
): Promise<DeleteUnverifiedUserResult> {
  const normalized = email.toLowerCase();
  try {
    return await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; emailVerified: boolean }[]>(
        Prisma.sql`SELECT id, "emailVerified" FROM "User" WHERE email = ${normalized} FOR UPDATE`,
      );
      const user = locked[0];
      if (!user) return { ok: false, reason: "not_found" } as const;
      if (user.emailVerified) return { ok: false, reason: "verified" } as const;

      const [couches, memberships, sessions] = await Promise.all([
        tx.couch.count({ where: { ownerId: user.id } }),
        tx.couchMember.count({ where: { userId: user.id } }),
        tx.session.count({ where: { userId: user.id } }),
      ]);
      if (couches + memberships + sessions > 0) return { ok: false, reason: "has_data" } as const;

      await tx.account.deleteMany({ where: { userId: user.id } });
      const deleted = await tx.user.deleteMany({ where: { id: user.id, emailVerified: false } });
      if (deleted.count !== 1) return { ok: false, reason: "verified" } as const;
      return { ok: true } as const;
    });
  } catch (error) {
    // P2003: a foreign key refused the delete because data was attached.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { ok: false, reason: "has_data" };
    }
    throw error;
  }
}
