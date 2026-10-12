// The phone's offline queue for Take Attendance (08-platform-security.md §10).
// Each waiting save is kept in this browser's local storage under the
// signed-in person's id, and sent with its own id so a resend counts once.

import type { Entry } from "@/lib/attendance/marks";

export type QueuedSave = {
  clientId: string;
  sectionId: string;
  sectionName: string;
  date: string;
  dateText: string;
  periodNo: number;
  periodLabel: string | null;
  entries: Entry[];
  takenAt: string;
  summary: string;
  /** Set when the school said no for a reason that trying again will not fix. */
  problem?: string | null;
  link?: { href: string; label: string } | null;
};

export const QUEUE_EVENT = "sos:attendance-queue";

const keyFor = (userId: string) => `sos-attendance-queue:${userId}`;

export function readQueue(userId: string): QueuedSave[] {
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    const list = raw ? (JSON.parse(raw) as QueuedSave[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function writeQueue(userId: string, list: QueuedSave[]): boolean {
  try {
    if (list.length === 0) window.localStorage.removeItem(keyFor(userId));
    else window.localStorage.setItem(keyFor(userId), JSON.stringify(list));
    window.dispatchEvent(new Event(QUEUE_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Adds a save to the queue. A newer save of the same class, date and period replaces an older one still waiting. */
export function enqueueSave(userId: string, item: QueuedSave): boolean {
  const list = readQueue(userId).filter((q) => q.problem || !(q.sectionId === item.sectionId && q.date === item.date && q.periodNo === item.periodNo));
  return writeQueue(userId, [...list, item]);
}

export function newClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** A network failure (no internet), as opposed to an answer from the school. */
export function isNetworkError(e: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return e instanceof TypeError || /fetch|network|load failed|connection/i.test(msg);
}
