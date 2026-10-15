// Importing the holiday list from a spreadsheet (18 §2 School Calendar, "Import
// the holiday list from a spreadsheet"). Each row is a holiday or a vacation;
// it is added like one typed on the School Calendar. Imported by
// src/lib/import-registry.ts.
import "server-only";

import { defineImport } from "../importer";
import { addEntry } from "./calendar";
import { localNow } from "./jobs";
import { EventsProblem } from "./problem";

type Row = { title: string; type: "holiday" | "vacation"; from: string; to: string | null };

function isoFrom(raw: string): string | null {
  const v = raw.trim();
  const a = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(v);
  const iso = a ? `${a[3]}-${a[2].padStart(2, "0")}-${a[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

defineImport<Row>({
  key: "calendar-holidays",
  label: "Holiday list (School Calendar)",
  columns: [
    { key: "name", label: "Name", required: true, example: "Republic Day", aliases: ["holiday", "title"] },
    { key: "type", label: "Type", example: "Holiday", help: "Holiday or Vacation. Empty means Holiday." },
    { key: "from", label: "Date", required: true, example: "26-01-2027", help: "DD-MM-YYYY. For a vacation, the first day.", aliases: ["from", "start date"] },
    { key: "to", label: "Last day", example: "", help: "For a vacation: the last day off.", aliases: ["to", "end date"] },
  ],
  check: async (tx, ctx, row, seen) => {
    const problems: string[] = [];
    const title = (row.name ?? "").trim().replace(/\s+/g, " ");
    if (title.length < 2) problems.push("Name is needed.");
    const t = (row.type ?? "").trim().toLowerCase();
    const type = !t || t === "holiday" ? "holiday" : t === "vacation" ? "vacation" : null;
    if (!type) problems.push("Type is Holiday or Vacation.");
    const from = isoFrom(row.from ?? "");
    if (!from) problems.push("Date must be like 26-01-2027.");
    const to = row.to?.trim() ? isoFrom(row.to) : null;
    if (row.to?.trim() && !to) problems.push("Last day must be like 16-01-2027.");
    if (type === "vacation" && !to) problems.push("A vacation needs its last day.");
    if (from && to && to < from) problems.push("The last day is before the first day.");
    const key = `${title.toLowerCase()}|${from}`;
    if (seen.has(key)) problems.push("This holiday is twice in the file.");
    seen.add(key);
    if (from && !problems.length) {
      const same = await tx.calendarEntry.findFirst({ where: { archivedAt: null, title: { equals: title, mode: "insensitive" }, startDate: new Date(`${from}T00:00:00Z`) } });
      if (same) problems.push("This holiday is already on the calendar.");
    }
    void ctx;
    return problems.length ? { ok: false, problems } : { ok: true, value: { title, type: type!, from: from!, to } };
  },
  save: async (tx, ctx, v) => {
    const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
    const today = localNow(new Date(), school?.timeZone ?? "Asia/Kolkata").today;
    try {
      const e = await addEntry(tx, ctx, { title: v.title, type: v.type, from: v.from, to: v.to, attendanceOn: false }, { confirm: true, today });
      return { id: e.id, created: true };
    } catch (err) {
      if (err instanceof EventsProblem) throw new Error(`${v.title}: ${err.message}`);
      throw err;
    }
  },
  undo: async (tx, ctx, ids) => {
    await tx.calendarEntry.updateMany({ where: { id: { in: ids }, source: null }, data: { archivedAt: new Date(), updatedById: ctx.userId } });
  },
});
