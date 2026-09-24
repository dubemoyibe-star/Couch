import { cx } from "@/components/ui/cx";

/**
 * A dim, warm living room drawn in SVG: window onto a night street, a lamp,
 * a couch with a blanket, a plant and a coffee table. The colours are fixed
 * on purpose. It is a night scene, so it does not follow the light palette.
 */
export function LivingRoomScene({ className }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 900 420"
      preserveAspectRatio="xMaxYMax slice"
      className={cx("pointer-events-none", className)}
    >
      <defs>
        <linearGradient id="lr-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b130e" />
          <stop offset="1" stopColor="#0f0a07" />
        </linearGradient>
        <linearGradient id="lr-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a2233" />
          <stop offset="1" stopColor="#33221a" />
        </linearGradient>
        <linearGradient id="lr-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a110b" />
          <stop offset="1" stopColor="#0b0705" />
        </linearGradient>
        <radialGradient id="lr-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffb867" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#e08a3c" stopOpacity="0.18" />
          <stop offset="1" stopColor="#e08a3c" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="900" height="420" fill="url(#lr-wall)" />
      <rect y="360" width="900" height="60" fill="url(#lr-floor)" />

      {/* Window onto a night street */}
      <g>
        <rect x="500" y="40" width="160" height="180" fill="url(#lr-sky)" stroke="#2f2119" strokeWidth="7" />
        <path d="M580 40v180M500 130h160" stroke="#2f2119" strokeWidth="5" />
        {[
          [512, 176, 10, 30],
          [530, 160, 12, 46],
          [552, 182, 10, 24],
          [596, 168, 14, 38],
          [618, 180, 10, 26],
          [636, 158, 12, 48],
        ].map(([x, y, w, h]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} fill="#e9b062" opacity="0.28" />
        ))}
      </g>

      {/* Framed picture */}
      <g>
        <rect x="330" y="70" width="112" height="82" fill="#22160f" stroke="#2f2119" strokeWidth="6" />
        <path d="M336 146l34-40 24 26 18-20 24 34z" fill="#3a2718" />
        <circle cx="410" cy="94" r="8" fill="#a56a38" opacity="0.7" />
      </g>

      {/* Lamp glow and lamp */}
      <circle cx="770" cy="110" r="210" fill="url(#lr-glow)" />
      <path d="M770 128v214" stroke="#3a2a20" strokeWidth="5" />
      <path d="M766 340h8l14 12h-36z" fill="#3a2a20" />
      <path d="M732 62h76l16 62h-108z" fill="#f2b36b" />
      <path d="M732 62h76l4 14h-84z" fill="#ffd79a" opacity="0.6" />

      {/* Plant */}
      <g>
        <path d="M676 350h44l-6 -36h-32z" fill="#2a1a12" />
        <path d="M698 314c-30-30-34-64-14-96 14 30 22 62 14 96z" fill="#28321f" />
        <path d="M698 314c8-36 30-62 58-76-6 34-24 62-58 76z" fill="#34402a" />
        <path d="M698 314c-4-40 6-76 26-108 6 36 0 76-26 108z" fill="#222b1a" />
      </g>

      {/* Couch */}
      <g>
        <rect x="380" y="214" width="400" height="118" rx="44" fill="#26180f" />
        <rect x="360" y="290" width="440" height="70" rx="26" fill="#2f1f15" />
        <rect x="346" y="250" width="64" height="112" rx="28" fill="#33221a" />
        <rect x="750" y="250" width="64" height="112" rx="28" fill="#33221a" />
        <path d="M570 296v62" stroke="#1d120b" strokeWidth="3" />
        {/* Throw pillows */}
        <rect x="428" y="238" width="86" height="70" rx="18" fill="#4a3021" transform="rotate(-8 471 273)" />
        <rect x="634" y="240" width="86" height="70" rx="18" fill="#5a3a26" transform="rotate(7 677 275)" />
        {/* Blanket over the left arm */}
        <path d="M346 262c30-14 70-10 84 24 8 22 4 52 16 76h-92c-14-26-20-64-8-100z" fill="#6b3f26" />
        <path d="M362 300c22 6 44 4 62-6M366 326c22 6 40 4 58-4" stroke="#8a5535" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M356 358v10M786 358v10" stroke="#120b07" strokeWidth="6" strokeLinecap="round" />
      </g>

      {/* Coffee table with a mug */}
      <g>
        <ellipse cx="590" cy="392" rx="150" ry="20" fill="#1c120c" />
        <ellipse cx="590" cy="386" rx="150" ry="18" fill="#2a1a11" />
        <rect x="548" y="364" width="24" height="22" rx="5" fill="#d9c7b0" />
        <path d="M572 370c9 0 9 12 0 12" stroke="#d9c7b0" strokeWidth="3" fill="none" />
        <rect x="610" y="376" width="52" height="9" rx="2" fill="#7a4a2a" />
        <rect x="614" y="368" width="46" height="8" rx="2" fill="#8a5a36" />
      </g>
    </svg>
  );
}
