"use client";

import { useEffect, useRef } from "react";

/**
 * Placed inside a <details>: closes it on a click outside it, on Escape, or when focus leaves it.
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
    // Tabbing out of an open menu closes it, so it never covers content the keyboard has moved on to.
    function onFocusOut(event: FocusEvent) {
      if (details?.open && event.relatedTarget instanceof Node && !details.contains(event.relatedTarget)) {
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
    details.addEventListener("focusout", onFocusOut);
    return () => {
      details.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return <span ref={marker} hidden />;
}
