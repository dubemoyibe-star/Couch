import {
  getCatalogMedia,
  getCouch,
  listCouchesForUser,
  type CouchListItem,
  type getPrismaClient,
} from "@couch/database";

type Db = ReturnType<typeof getPrismaClient>;

export type RoomMedia = {
  readonly id: string;
  readonly title: string;
  readonly posterUrl: string | null;
  /** Credit line to show with the title, or null when the license asks for none. */
};

export type CouchRoom = CouchListItem & { readonly media: RoomMedia | null };

/**
 * The signed-in user's couches, each with the media currently selected on it.
 * The stored media id is never trusted directly: it is re-resolved through the
 * catalog, which returns null for a taken-down item, so a couch whose pick was
 * removed simply shows as having nothing on.
 */
export async function loadCouchRooms(db: Db, userId: string): Promise<CouchRoom[]> {
  const items = await listCouchesForUser(db, userId);
  return Promise.all(
    items.map(async (item) => {
      const couch = await getCouch(db, item.couch.id);
      const media = couch?.currentMediaId
        ? await getCatalogMedia(db, couch.currentMediaId, {
            onExcluded: (exclusion) => {
              console.error(`dashboard: excluded ${exclusion.id} (${exclusion.reason})`);
            },
          })
        : null;
      return {
        ...item,
        media: media
          ? {
              id: media.id,
              title: media.title,
              posterUrl: media.posterUrl ?? null,
            }
          : null,
      };
    }),
  );
}
