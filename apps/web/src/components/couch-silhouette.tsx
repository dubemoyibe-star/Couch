/** A quiet line drawing of a couch with a blanket over one arm, for the empty living room. */
export function CouchSilhouette({ className }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 180"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="44" y="34" width="232" height="76" rx="28" />
      <rect x="28" y="92" width="264" height="52" rx="20" />
      <rect x="12" y="66" width="46" height="84" rx="20" />
      <rect x="262" y="66" width="46" height="84" rx="20" />
      <path d="M160 96v44" />
      <path d="M50 150v14M270 150v14" />
      <path
        className="text-primary"
        d="M224 66c12 30 8 58 26 84h50c-4-32-10-60-32-84z"
        fill="currentColor"
        fillOpacity="0.25"
      />
      <path className="text-primary" d="M236 96c14 4 30 4 48-4M242 120c12 4 26 4 40-2" />
    </svg>
  );
}
