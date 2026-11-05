// Where a "..." menu or other drop-down opens (owner test 2026-11-05: on the
// student profile the menu was cut off by its card and could not scroll). The
// menu is drawn in front of the page, next to its button: below it when it fits,
// above it when there is more room there, never past the screen's edges, and
// scrolling inside when it is taller than the room it has.

export type Rect = { top: number; bottom: number; left: number; right: number };
export type Placed = { top: number; left: number; maxHeight: number; up: boolean };

export function placeMenu(o: {
  anchor: Rect; menu: { width: number; height: number }; viewport: { width: number; height: number };
  align?: "left" | "right"; gap?: number; margin?: number;
}): Placed {
  const gap = o.gap ?? 6;
  const margin = o.margin ?? 8;
  const below = o.viewport.height - o.anchor.bottom - gap - margin;
  const above = o.anchor.top - gap - margin;
  const up = o.menu.height > below && above > below;
  const room = Math.max(up ? above : below, 120);
  const height = Math.min(o.menu.height, room);
  const top = up ? Math.max(margin, o.anchor.top - gap - height) : o.anchor.bottom + gap;
  const width = Math.min(o.menu.width, o.viewport.width - 2 * margin);
  const wanted = (o.align ?? "right") === "right" ? o.anchor.right - width : o.anchor.left;
  const left = Math.min(Math.max(margin, wanted), Math.max(margin, o.viewport.width - margin - width));
  return { top: Math.round(top), left: Math.round(left), maxHeight: Math.floor(room), up };
}
