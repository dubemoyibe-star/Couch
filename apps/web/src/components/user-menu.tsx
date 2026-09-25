import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { CloseDetailsOnOutside } from "@/components/close-details-on-outside";
import { SignOutButton } from "@/components/sign-out-button";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
import { signOutAction } from "@/app/sign-out/actions";

/**
 * Account control with a sign-out action. Built on a native <details>, so it
 * opens and closes with no client code and works from the keyboard.
 * `compact` shows only the avatar (top bar); otherwise the name and a chevron.
 */
export function UserMenu({
  name,
  compact = false,
  placement = "below",
}: {
  readonly name: string;
  readonly compact?: boolean;
  readonly placement?: "below" | "above";
}) {
  return (
    <details className="group relative">
      <CloseDetailsOnOutside />
      <summary
        aria-label={`Account menu for ${name}`}
        className={cx(
          "flex cursor-pointer list-none items-center gap-3 rounded-md [&::-webkit-details-marker]:hidden",
          compact ? "rounded-full" : "w-full p-2 hover:bg-surface-muted",
          calmTransition,
          focusRing,
        )}
      >
        <Avatar name={name} />
        {compact ? null : (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{name}</span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 text-text-muted motion-safe:transition-transform group-open:rotate-180"
            />
          </>
        )}
      </summary>
      <div
        className={cx(
          "absolute z-40 min-w-44 rounded-md border border-border bg-surface p-1 shadow-xl",
          placement === "above" ? "bottom-full left-0 right-0 mb-2" : "right-0 top-full mt-2",
        )}
      >
        <form action={signOutAction}>
          <SignOutButton />
        </form>
      </div>
    </details>
  );
}
