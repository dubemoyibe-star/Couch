import { Avatar } from "@/components/avatar";

// Static sample content. Friends, presence and activity are not built yet, so
// this rail shows fixed placeholder people and events rather than real data.
const friends = [
  { name: "Khalid", status: "Watching Sintel", online: true },
  { name: "Tomi", status: "In a couch", online: true },
  { name: "Zee", status: "In a couch", online: true },
] as const;

const activity = [
  { name: "Khalid", text: "started a new couch", detail: "Friday Night", when: "12m ago" },
  { name: "Tomi", text: "joined", detail: "Anime Night", when: "34m ago" },
  { name: "Zee", text: "added a movie to", detail: "Chill Vibes", when: "2h ago" },
] as const;

/** Right-hand rail: who is around and what has been happening. */
export function ActivityRail() {
  return (
    <aside aria-label="Friends and activity" className="flex flex-col gap-6 rounded-lg border border-border bg-surface/60 p-5">
      <section aria-labelledby="friends-online" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="friends-online" className="inline-flex items-center gap-2 text-sm font-semibold text-text">
            <span aria-hidden="true" className="size-2 rounded-full bg-success" />
            Friends online
          </h2>
          <span className="text-xs text-text-muted">{friends.length} online</span>
        </div>
        <ul className="flex flex-col gap-4">
          {friends.map((friend) => (
            <li key={friend.name} className="flex items-center gap-3">
              <Avatar name={friend.name} online={friend.online} className="size-10" />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-text">{friend.name}</span>
                <span className="truncate text-xs text-text-muted">{friend.status}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div role="separator" className="h-px bg-border" />

      <section aria-labelledby="recent-activity" className="flex flex-col gap-4">
        <h2 id="recent-activity" className="text-sm font-semibold text-text">
          Recent activity
        </h2>
        <ul className="flex flex-col gap-4">
          {activity.map((item) => (
            <li key={`${item.name}-${item.when}`} className="flex items-start gap-3">
              <Avatar name={item.name} className="size-10" />
              <span className="flex min-w-0 flex-col text-sm">
                <span className="text-text">
                  <span className="font-medium">{item.name}</span> {item.text}{" "}
                  <span className="font-medium">{item.detail}</span>
                </span>
                <span className="text-xs text-text-muted">{item.when}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
