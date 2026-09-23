type StatusIconProps = { readonly kind: "error" | "success" };

/** Decorative icon so status is never carried by color alone. Pair it with text. */
export function StatusIcon({ kind }: StatusIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="mt-0.5 size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="10" r="8" />
      {kind === "error" ? (
        <path d="M10 6v4.5M10 13.5h.01" />
      ) : (
        <path d="M6.5 10.2l2.4 2.4 4.6-4.9" />
      )}
    </svg>
  );
}
