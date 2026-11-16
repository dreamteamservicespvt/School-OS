// One way to show a class on every screen (layman loop 6, L6-16): the same class read
// "class 1" on Admissions, "Class 1 A" on Pickup, "class 1 A" on Fees and "1 A" on the
// Dashboard, because each screen showed the name as the school typed it, or cut it.
// The name stays as saved; screens show it through these. Pure, so client screens can use it.

import type { T } from "./i18n/t";

const ROMAN = /^(?:i{1,3}|iv|v|vi{0,3}|ix|x|xi{1,2})$/i;

/** "class 1" → "Class 1", "1" → "Class 1", "1 A" → "Class 1 A", "XII" → "Class XII"; "LKG", "Nursery" and "Grade 3" stay as they are. */
export function classTitle(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  const m = /^class\b\s*(.*)$/i.exec(n);
  if (m) return m[1] ? `Class ${m[1]}` : "Class";
  const first = n.split(" ")[0];
  if (/^\d{1,2}$/.test(first) || ROMAN.test(first)) return `Class ${n}`;
  return n;
}

/** A section with its class: "Class 1 A" (and "Class 1" when there is no section name). */
export function classSection(className: string, sectionName?: string | null): string {
  const s = (sectionName ?? "").trim();
  return s ? `${classTitle(className)} ${s}` : classTitle(className);
}

/** The short form for tight places (tiles, chart bars): "class 1" and "Class 1" both give "1". */
export function classShort(name: string): string {
  return name.trim().replace(/^class\s+/i, "");
}

/** The class in the screen's language: "Class 1 A" with the word "Class" translated; "LKG A" as it is. */
export function classIn(t: T, label: string): string {
  const full = classTitle(label);
  return full.startsWith("Class ") ? t("Class {n}", { n: full.slice(6) }) : full;
}
