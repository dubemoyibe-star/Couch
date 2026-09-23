import Image from "next/image";

// Intrinsic size of the mark asset (public/brand/couch-mark.png).
const MARK_WIDTH = 713;
const MARK_HEIGHT = 385;

type LogoProps = {
  // "lockup" is the mark plus the wordmark, for headers and larger contexts.
  // "mark" is the icon alone, for compact contexts.
  variant?: "lockup" | "mark";
  // Height of the mark in px. The wordmark scales with it.
  size?: number;
  // "brand" uses the terracotta mark. "mono" paints the same silhouette in
  // the current text color (single-color use, per the branding rules).
  tone?: "brand" | "mono";
  className?: string;
};

function Mark({ size, tone }: { size: number; tone: "brand" | "mono" }) {
  const width = Math.round((size * MARK_WIDTH) / MARK_HEIGHT);
  if (tone === "mono") {
    return (
      <span
        aria-hidden="true"
        className="inline-block shrink-0 bg-current"
        style={{
          width,
          height: size,
          maskImage: "url(/brand/couch-mark-mono.png)",
          maskSize: "contain",
          maskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskImage: "url(/brand/couch-mark-mono.png)",
          WebkitMaskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
        }}
      />
    );
  }
  return (
    <Image
      src="/brand/couch-mark.png"
      alt=""
      width={width}
      height={size}
      priority
      className="shrink-0"
    />
  );
}

export function Logo({
  variant = "lockup",
  size = 28,
  tone = "brand",
  className,
}: LogoProps) {
  if (variant === "mark") {
    return (
      <span
        role="img"
        aria-label="Couch"
        className={`inline-flex items-center ${className ?? ""}`}
      >
        <Mark size={size} tone={tone} />
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <Mark size={size} tone={tone} />
      <span
        className="font-display font-semibold leading-none text-text"
        style={{ fontSize: Math.round(size * 0.85) }}
      >
        Couch
      </span>
    </span>
  );
}
