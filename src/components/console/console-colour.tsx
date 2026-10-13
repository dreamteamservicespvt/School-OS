"use client";

import { useEffect } from "react";

/** The console always uses School OS's own Royal blue, whatever colour a school chose. */
export function ConsoleColour() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.getAttribute("data-accent") !== "royal") root.setAttribute("data-accent", "royal");
  }, []);
  return null;
}
