"use client";

import { useEffect, useRef } from "react";

/**
 * Placed inside a <details>: closes it on a click outside it or on Escape.
 * Renders nothing; the <details> keeps working without script for open and close.
 */
export function CloseDetailsOnOutside() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const details = marker.current?.closest("details");
    if (!details) return;

    function onPointerDown(event: PointerEvent) {
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && details?.open) {
        details.open = false;
        details.querySelector("summary")?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return <span ref={marker} hidden />;
}
