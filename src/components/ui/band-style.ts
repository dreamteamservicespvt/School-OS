import type { CSSProperties } from "react";

// The coloured summary band. In light mode it is the school colour with light text.
// In dark mode the school colour is pale (so text on the page reads well), which made
// the band a glaring slab: there it becomes a deep shade of the school colour with
// light text. `light-dark()` follows the page's colour scheme; a browser without it
// keeps the bg-brand / text-brandink classes.
export const BAND_STYLE: CSSProperties = {
  backgroundColor: "light-dark(rgb(var(--brand)), color-mix(in srgb, rgb(var(--brand)) 30%, rgb(var(--bg))))",
  color: "light-dark(rgb(var(--brand-ink)), rgb(var(--ink)))",
};
