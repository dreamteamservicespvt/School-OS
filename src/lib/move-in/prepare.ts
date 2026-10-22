// Turning one sheet of an old file into clean rows for the shared importer
// (workflow 15, step 4). Pure: it takes the sheet, the choices made on screen
// and the school's lists, and says for every row what it will import, what
// was tidied, and which words still need matching. Nothing is saved here.

import type { ImportColumn } from "../importer";
import { valueType, type ColumnMatch } from "./match";
import { findOption, findSection, sectionLabel, suggestOptions, suggestSections, type Lookups, type SectionOption } from "./lookups";
import { dateOrder, plain, splitClassSection, tidyBloodGroup, tidyDate, tidyDigits, tidyGender, tidyName, tidyPhone, tidyYesNo, type DateOrder } from "./tidy";

export type Choices = {
  headerRow: number; // from 1
  columnMatch: ColumnMatch;
  /** "class" → { "5th|B" → section id or "" }, "designation" / "department" → { word → option }. */
  valueMatch: Record<string, Record<string, string>>;
  rowFixes: Record<string, Record<string, string>>;
  leftOut: number[];
  tidy: boolean;
  /** Row number → the choice made for a row that may already be on record (read by the import's own check). */
  rowChoices?: Record<string, string>;
  /** Rows an earlier import of this file brought in: not checked or brought in again. */
  done?: number[];
};

export type Change = { key: string; from: string; to: string };
export type PreparedRow = { line: number; values: Record<string, string>; changes: Change[]; fixed: boolean };
export type Unmatched = { column: "class" | "designation" | "department"; value: string; label: string; count: number; lines: number[]; suggestions: { value: string; label: string }[]; chosen: string | null };

export type Prepared = {
  headers: string[];
  rows: PreparedRow[];
  /** Rows passed over: empty, the headings again (exports that repeat them on every page) and totals; rows left out by the person; rows an earlier import of the file brought in. */
  passed: { empty: number; headings: number; totals: number; leftOut: number; broughtIn: number };
  unmatched: Unmatched[];
  /** Tidy-ups by column: how many values, with a few examples. */
  tidied: { key: string; label: string; count: number; examples: Change[] }[];
  dateOrders: Record<string, DateOrder>;
};

export const classValueKey = (cls: string, sec: string) => `${cls.trim()}|${sec.trim()}`;

/** A cell from one or more columns of the file, joined with a space (first, middle, last name). */
function cellOf(row: string[], cols: number[] | undefined) {
  if (!cols?.length) return "";
  return cols.map((c) => (row[c] ?? "").trim()).filter(Boolean).join(" ");
}

function tidyValue(type: ReturnType<typeof valueType>, v: string, order: DateOrder) {
  switch (type) {
    case "name": return tidyName(v);
    case "phone": return tidyPhone(v);
    case "date": return tidyDate(v, order);
    case "gender": return tidyGender(v);
    case "blood": return tidyBloodGroup(v);
    case "digits": return tidyDigits(v);
    case "yesno": return tidyYesNo(v);
    default: return v.replace(/\s+/g, " ").trim();
  }
}

export function prepareSheet(kindKey: string, columns: ImportColumn[], grid: string[][], choices: Choices, lookups: Lookups): Prepared {
  const headerIndex = Math.max(0, Math.min(choices.headerRow - 1, Math.max(grid.length - 1, 0)));
  const headers = (grid[headerIndex] ?? []).map((h, i) => h.trim() || `Column ${i + 1}`);
  const m = choices.columnMatch;
  const keys = columns.map((c) => c.key);
  const leftOut = new Set(choices.leftOut);
  const done = new Set(choices.done ?? []);
  const passed = { empty: 0, headings: 0, totals: 0, leftOut: 0, broughtIn: 0 };
  const plainHeaders = headers.map(plain);

  // The order of day and month is worked out once per date column.
  const dateOrders: Record<string, DateOrder> = {};
  for (const k of keys) {
    if (valueType(kindKey, k) === "date" && m[k]?.length) dateOrders[k] = dateOrder(grid.slice(headerIndex + 1).map((r) => cellOf(r, m[k])));
  }

  const classSame = Boolean(m.className?.length && m.sectionName?.length && m.className.join() === m.sectionName.join());
  const usesClass = keys.includes("className");
  const rows: PreparedRow[] = [];
  const unmatchedMap = new Map<string, Unmatched>();
  const tidied = new Map<string, Change[]>();
  const counts = new Map<string, number>();

  for (let r = headerIndex + 1; r < grid.length; r++) {
    const line = r + 1;
    const raw = grid[r];
    const matchedCells = Object.values(m).flat().map((c) => (raw[c] ?? "").trim());
    const filled = matchedCells.filter(Boolean);
    if (filled.length === 0) { passed.empty++; continue; }
    if (raw.filter((c, i) => c.trim() && plain(c) === plainHeaders[i]).length >= 2) { passed.headings++; continue; }
    if (filled.length <= 2 && raw.some((c) => /^(grand\s*)?total\b|^sub\s*total\b|^count\b/i.test(c.trim()))) { passed.totals++; continue; }
    if (done.has(line)) { passed.broughtIn++; continue; }
    if (leftOut.has(line)) { passed.leftOut++; continue; }

    const fixes = choices.rowFixes[String(line)] ?? {};
    const values: Record<string, string> = {};
    const changes: Change[] = [];
    for (const k of keys) {
      const fromFile = k === "sectionName" && classSame ? "" : cellOf(raw, m[k]);
      const v = fixes[k] ?? fromFile;
      const type = valueType(kindKey, k);
      let out = v.trim();
      if (choices.tidy && out) out = tidyValue(type, out, dateOrders[k] ?? "DMY");
      if (out !== v.trim() && fixes[k] === undefined) changes.push({ key: k, from: v.trim(), to: out });
      values[k] = out;
    }

    // Class and section: matched to this year's sections, by any way of writing them.
    if (usesClass && values.className) {
      // "7 A" in one column is class 7, section A, even when no class 7 exists yet.
      if (choices.tidy && !values.sectionName) {
        const split = splitClassSection(values.className);
        if (split) { values.className = split.className; values.sectionName = split.sectionName; }
      }
      const rc = values.className;
      const rs = values.sectionName ?? "";
      const vk = classValueKey(rc, rs);
      const chosenId = choices.valueMatch.class?.[vk];
      const chosen = chosenId ? lookups.sections.find((s) => s.id === chosenId) ?? null : null;
      const found = chosen ?? (chosenId === "" ? null : findSection(lookups.sections, rc, rs));
      if (found) {
        if (found.className !== rc || found.sectionName !== rs) {
          if (choices.tidy || chosen) changes.push({ key: "className", from: [rc, rs].filter(Boolean).join(" "), to: sectionLabel(found) });
          if (choices.tidy || chosen) { values.className = found.className; values.sectionName = found.sectionName; }
        }
      } else {
        // The import says "Class 9 C is not set up" itself; "Class Class 9" would read wrongly.
        values.className = rc.replace(/^class\s+/i, "");
        addUnmatched(unmatchedMap, "class", vk, [rc, rs].filter(Boolean).join(" "), line, chosenId === "" ? "" : null,
          () => suggestSections(lookups.sections, rc, rs).map((s: SectionOption) => ({ value: s.id, label: sectionLabel(s) })));
      }
    }
    for (const k of ["designation", "department"] as const) {
      if (!keys.includes(k) || !values[k] || valueType(kindKey, k) !== "lookup") continue;
      const options = k === "designation" ? lookups.designations : lookups.departments;
      const word = values[k];
      const chosen = choices.valueMatch[k]?.[word];
      const found = chosen ? options.find((o) => o === chosen) ?? null : chosen === "" ? null : findOption(options, word, k);
      if (found) {
        if (found !== word) { changes.push({ key: k, from: word, to: found }); values[k] = found; }
      } else {
        addUnmatched(unmatchedMap, k, word, word, line, chosen === "" ? "" : null, () => suggestOptions(options, word).map((o) => ({ value: o, label: o })));
      }
    }

    for (const c of changes) {
      counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
      const list = tidied.get(c.key) ?? [];
      if (list.length < 3 && !list.some((x) => x.from === c.from)) list.push(c);
      tidied.set(c.key, list);
    }
    rows.push({ line, values, changes, fixed: Object.keys(fixes).length > 0 });
  }

  const label = (k: string) => columns.find((c) => c.key === k)?.label ?? k;
  return {
    headers,
    rows,
    passed,
    unmatched: [...unmatchedMap.values()].sort((a, b) => b.count - a.count),
    tidied: [...counts.entries()].map(([key, count]) => ({ key, label: key === "className" ? "Class and section" : label(key), count, examples: tidied.get(key) ?? [] })).sort((a, b) => b.count - a.count),
    dateOrders,
  };
}

function addUnmatched(map: Map<string, Unmatched>, column: Unmatched["column"], value: string, label: string, line: number, chosen: string | null, suggest: () => Unmatched["suggestions"]) {
  const id = `${column}:${value}`;
  const u = map.get(id);
  if (u) { u.count++; if (u.lines.length < 20) u.lines.push(line); return; }
  map.set(id, { column, value, label, count: 1, lines: [line], suggestions: suggest(), chosen });
}

/** The cleaned rows as text in the import's own column order, for the shared importer. */
export function rowsForImport(columns: ImportColumn[], rows: PreparedRow[]): string[][] {
  return rows.map((r) => columns.map((c) => r.values[c.key] ?? ""));
}

const csvCell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** A CSV with the import's headings and the cleaned rows (read only by the shared importer). */
export function cleanCsv(columns: ImportColumn[], rows: PreparedRow[]): string {
  const header = columns.map((c) => csvCell(c.label)).join(",");
  const lines = rowsForImport(columns, rows).map((r) => r.map(csvCell).join(","));
  return "\ufeff" + [header, ...lines].join("\r\n") + "\r\n";
}

/** A cell for a file people open in Excel: text that Excel would run as a formula is kept as text. */
export const safeCell = (s: string) => csvCell(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
