// Recent and pinned pages, kept on this device for this person (inferred:
// stored in the browser for now; they move to the person's profile later so
// they follow them to other devices).
import type { PageLink } from "./nav-data";

export const storageKey = (userId: string, list: "recent" | "pinned") => `sos:${userId}:${list}`;

export function readList(key: string): PageLink[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p?.href === "string" && typeof p?.label === "string") : [];
  } catch {
    return [];
  }
}

export function writeList(key: string, list: PageLink[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage can be full or blocked; recent pages are a convenience only.
  }
}

export function recordRecent(userId: string, page: PageLink) {
  const key = storageKey(userId, "recent");
  writeList(key, [page, ...readList(key).filter((p) => p.href !== page.href)].slice(0, 8));
}

export function togglePinned(userId: string, page: PageLink): boolean {
  const key = storageKey(userId, "pinned");
  const list = readList(key);
  const isPinned = list.some((p) => p.href === page.href);
  writeList(key, isPinned ? list.filter((p) => p.href !== page.href) : [...list, page].slice(0, 12));
  return !isPinned;
}

export function isPinned(userId: string, href: string): boolean {
  return readList(storageKey(userId, "pinned")).some((p) => p.href === href);
}
