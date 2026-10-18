// Smart Import, the first real user of the AI service (gap list G18): the
// rules match first; for the columns left, the AI is asked with only the
// headings and a description of each column's values, never a value; its
// answer is a "Suggestion" the person ticks; a ticked match is written as
// "prepared by AI, confirmed by <person>"; and the confirmed match is
// remembered, so the next file from the same software matches by itself.
// A fake provider answers: no test reaches the network.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExcelJS from "exceljs";
import { withSchool, type SchoolContext } from "@/lib/db";
import { saveFile, SHEET_TYPES } from "@/lib/files";
import { accessIn } from "@/lib/auth/access";
import { useAiProvider, type AiProvider, type AiRequest } from "@/lib/ai";
import { columnQuestion, headingForAi, readColumnAnswer, shapeOf } from "@/lib/ai/import-columns";
import { suggestColumnsByAi } from "@/lib/ai/smart-import";
import { acceptAiColumns, addUpload, aiColumnInput, importFile, saveExpected, workOn } from "@/lib/move-in/service";
import { applyRemembered, headerKeyOf, mergeRemembered } from "@/lib/move-in/memory";
import { saveAssistant, setFeature } from "@/lib/settings/switches";
import { AiColumnSuggestionCard } from "@/components/import/ai-column-suggestions";
import { studentSchool } from "../students/fixtures";

describe("what may be sent about a column", () => {
  it("describes the values by their kind, never by the values", () => {
    const phones = ["9876511111", "9876522222", "+91 98765 33333"];
    expect(shapeOf(phones)).toBe("10-digit mobile numbers starting 6 to 9");
    expect(shapeOf(["14-03-2016", "02-11-2015", "30-01-2016"])).toBe("dates written DD-MM-YYYY");
    expect(shapeOf(["2016-03-14", "2015-11-02"])).toBe("dates written YYYY-MM-DD");
    expect(shapeOf(["Srinivas Rao", "Ramesh Sharma", "Mohan"])).toBe("words of letters, 1 to 2 words");
    expect(shapeOf(["5-A", "VII B", "10 C"])).toBe("class with section, such as 5-A or VII B");
    expect(shapeOf(["SS/2026/00123", "SS/2026/00124", "SS/2026/00125"])).toBe("codes shaped like AA/9999/99999");
    expect(shapeOf(["1234 5678 9012", "2345 6789 0123"])).toBe("12-digit numbers");
    expect(shapeOf(["M", "F", "M", "F", "M", "F", "M", "F", "M", "F", "", "", ""])).toBe("gender values such as Male and Female, only 2 different values, 23% empty");
    expect(shapeOf(["", " "])).toBe("empty");
  });

  it("drops a heading that looks like a value: the heading row may be a row of records", () => {
    expect(headingForAi("Pita Ka Naam")).toBe("Pita Ka Naam");
    expect(headingForAi("9876511111")).toBe("(no heading)");
    expect(headingForAi("14-03-2016")).toBe("(no heading)");
    expect(headingForAi("ravi@mail.com")).toBe("(no heading)");
    expect(headingForAi("")).toBe("(no heading)");
  });

  it("asks only about the fields and columns the rules left, and keeps the answer to what was asked", () => {
    const headers = ["Adm No", "Stu Name", "Pita Ka Naam", "Notes"];
    const rows = [["OLD-1", "Arjun Rao", "Srinivas Rao", ""], ["OLD-2", "Priya Sharma", "Ramesh Sharma", ""]];
    const q = columnQuestion({ importing: "Students", fields: [{ key: "admissionNo", label: "Admission number" }, { key: "fullName", label: "Full name" }, { key: "guardianName", label: "Father's or guardian's name" }], headers, rows, matched: new Set(["admissionNo", "fullName"]), used: new Set([0, 1]) })!;
    expect(q.fields.map((f) => f.field)).toEqual(["guardianName"]);
    // The empty "Notes" column is not sent either.
    expect(q.columns).toEqual([{ column: 2, heading: "Pita Ka Naam", values: "words of letters, 2 words each" }]);
    expect(JSON.stringify(q)).not.toMatch(/Srinivas|Ramesh|Arjun|OLD-1/);
    const got = readColumnAnswer(q, { matches: [{ column: 2, field: "guardianName", reason: "Hindi for father's name" }, { column: 2, field: "motherName", reason: "x" }, { column: 0, field: "guardianName", reason: "x" }, { column: 3, field: "fullName", reason: "x" }] }, headers);
    expect(got).toEqual([{ key: "guardianName", label: "Father's or guardian's name", index: 2, header: "Pita Ka Naam", why: "Hindi for father's name" }]);
  });

  it("remembers a match by heading text, so it still fits when the columns move", () => {
    const columns = { admissionNo: ["admno"], guardianName: ["pitakanaam"], fullName: ["firstname", "lastname"] };
    expect(applyRemembered(columns, ["Pita Ka Naam", "Adm No", "First Name", "Last Name"])).toEqual({ guardianName: [0], admissionNo: [1], fullName: [2, 3] });
    // A heading no longer in the file leaves its column to the rules.
    expect(applyRemembered(columns, ["Adm No", "First Name"])).toEqual({ admissionNo: [0] });
    expect(mergeRemembered({ guardianName: [3], fullName: [0] }, { fullName: [1] })).toEqual({ guardianName: [3], fullName: [1] });
    expect(mergeRemembered({ motherName: [1] }, { guardianName: [1] })).toEqual({ guardianName: [1] });
    expect(headerKeyOf(["Adm No", "Stu Name"])).toBe(headerKeyOf(["stu name", "ADM NO"]));
  });

  it("shows the AI's answer labelled Suggestion, with nothing ticked until the person ticks it", () => {
    const html = renderToStaticMarkup(createElement(AiColumnSuggestionCard, { suggestions: [{ key: "guardianName", label: "Father's or guardian's name", index: 2, header: "Pita Ka Naam", why: "Hindi for father's name" }], ticked: new Set<string>() }));
    expect(html).toContain("Suggestion");
    expect(html).toContain("Pita Ka Naam");
    expect(html).toMatch(/<input type="checkbox"(?![^>]*checked)[^>]*>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Use the ticked matches/);
  });
});

let s: Awaited<ReturnType<typeof studentSchool>>;
let ctx: SchoolContext;
let perms: import("@/lib/permissions").PermissionMap;

async function workbook(rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function upload(buf: Buffer, name: string) {
  return withSchool(ctx, async (tx) => {
    const saved = await saveFile(tx, ctx, { file: new File([new Uint8Array(buf)], name), purpose: "move-in", allowed: SHEET_TYPES });
    return addUpload(tx, ctx, perms, { fileId: saved.id, fileName: name, kind: "students" });
  });
}

/** A fake AI service: matches "Pita Ka Naam" to the father's name, and keeps what it was sent. */
function fake() {
  const sent: AiRequest[] = [];
  const provider: AiProvider = {
    name: "fake",
    ask: async (req) => {
      sent.push(req);
      const q = JSON.parse(req.text) as { columns: { column: number; heading: string }[] };
      const col = q.columns.find((c) => c.heading === "Pita Ka Naam");
      return { outcome: "ok", data: { matches: col ? [{ column: col.column, field: "guardianName", reason: "Hindi for father's name" }, { column: 99, field: "nonsense", reason: "x" }] : [] }, usage: { inputTokens: 900, outputTokens: 60, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: "claude-opus-5-5" };
    },
  };
  return { provider, sent };
}

const HEADINGS = ["Adm No", "Stu Name", "Pita Ka Naam", "Sampark", "Class & Sec", "D.O.B", "Sex"];
const ROWS = [
  ["OLD-201", "Arjun Rao", "Srinivas Rao", "9876511111", "5-A", "14-03-2016", "M"],
  ["OLD-202", "Priya Sharma", "Ramesh Sharma", "9876522222", "5-B", "02-11-2015", "F"],
  ["OLD-203", "Kiran Das", "Mohan Das", "9876533333", "5-A", "05-07-2016", "M"],
];

beforeAll(async () => {
  s = await studentSchool();
  ctx = s.ctx;
  perms = (await accessIn(s.admin.id, s.school.id))!.permissions;
  await withSchool(ctx, async (tx) => {
    await saveAssistant(tx, ctx, { on: true, roles: ["school-admin"] });
    await setFeature(tx, ctx, "ai-smart-import", true);
    await saveExpected(tx, ctx, { oldSoftware: "Fedena", expected: {}, goLiveDate: null });
  });
});

afterEach(() => useAiProvider(null));

describe("Smart Import in Switching to School OS", () => {
  let first = "";

  it("asks the AI about the column the rules left, sending only headings and kinds of values", async () => {
    [first] = await upload(await workbook([HEADINGS, ...ROWS]), "fedena-export.xlsx");
    const before = await withSchool(ctx, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id: first } }));
    const match = before.columnMatch as Record<string, number[]>;
    expect(match.guardianName).toBeUndefined();
    expect(match.guardianPhone).toEqual([3]);

    const f = fake();
    useAiProvider(f.provider);
    const input = await withSchool(ctx, (tx) => aiColumnInput(tx, first));
    const r = await suggestColumnsByAi(ctx, input);
    expect(r).toMatchObject({ ok: true, suggestions: [{ key: "guardianName", index: 2, header: "Pita Ka Naam", why: "Hindi for father's name" }] });
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0].text).toContain("Pita Ka Naam");
    expect(f.sent[0].text).toContain("words of letters, 2 words each");
    for (const v of ROWS.flat()) if (v.length > 2) expect(f.sent[0].text).not.toContain(v);
    // Asking changes nothing.
    const after = await withSchool(ctx, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id: first } }));
    expect(after.columnMatch).toEqual(before.columnMatch);
    const call = await withSchool(ctx, (tx) => tx.aiCall.findFirstOrThrow({ orderBy: { createdAt: "desc" } }));
    expect(call).toMatchObject({ feature: "ai-smart-import", purpose: "Match import columns", outcome: "ok", userLoginId: s.admin.id });
  });

  it("sends nothing while no heading is recognised, or for a role the school did not choose", async () => {
    const f = fake();
    useAiProvider(f.provider);
    const nothing = await suggestColumnsByAi(ctx, { importing: "Students", fields: [{ key: "fullName", label: "Full name" }], headers: ["Arjun Rao"], rows: [["Priya"]], matched: new Set(), used: new Set() });
    expect(nothing.ok).toBe(false);
    const teacher = { schoolId: s.school.id, userId: s.teacherUser.id };
    const input = await withSchool(ctx, (tx) => aiColumnInput(tx, first));
    const r = await suggestColumnsByAi(teacher, input);
    expect(r).toMatchObject({ ok: false, message: "Your role does not use the AI assistant in this school." });
    expect(f.sent).toHaveLength(0);
  });

  it("uses only what the person ticked, and writes it as prepared by AI, confirmed by them", async () => {
    const n = await withSchool(ctx, (tx) => acceptAiColumns(tx, ctx, first, [{ key: "guardianName", index: 2 }, { key: "fullName", index: 2 }]));
    expect(n).toBe(1);
    const f = await withSchool(ctx, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id: first } }));
    expect((f.columnMatch as Record<string, number[]>).guardianName).toEqual([2]);
    expect((f.columnMatch as Record<string, number[]>).fullName).toEqual([1]);
    const audit = await withSchool(ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "Move-in File", recordId: first, action: "columns-matched" } }));
    expect(audit.actorNote).toBe("prepared by AI, confirmed by Admin");
    expect(audit.after).toMatchObject({ columns: [{ column: "Father's or guardian's name", heading: "Pita Ka Naam" }] });
    const w = await withSchool(ctx, (tx) => workOn(tx, ctx, first, { check: true }));
    expect(w.checked!.ready).toHaveLength(3);
  });

  it("remembers the confirmed match when the file is brought in, and the next Fedena file matches by itself", async () => {
    await withSchool(ctx, (tx) => importFile(tx, ctx, first));
    const m = await withSchool(ctx, (tx) => tx.importMapping.findFirstOrThrow({ where: { kind: "students" } }));
    expect(m).toMatchObject({ source: "Fedena", fileName: "fedena-export.xlsx", timesUsed: 0 });
    expect((m.columns as Record<string, string[]>).guardianName).toEqual(["pitakanaam"]);
    const audit = await withSchool(ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "Import Mapping", recordId: m.id } }));
    expect(audit.action).toBe("created");

    // The same software's next export, with its columns in another order: nobody matches the father's name again.
    const order = [6, 1, 0, 2, 3, 4, 5];
    const next = [order.map((i) => HEADINGS[i]), ...[["OLD-301", "Sita Rao", "Rama Rao", "9876544444", "5-A", "01-01-2016", "F"]].map((r) => order.map((i) => r[i]))];
    const [second] = await upload(await workbook(next), "fedena-export-2.xlsx");
    const f2 = await withSchool(ctx, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id: second } }));
    expect((f2.columnMatch as Record<string, number[]>).guardianName).toEqual([3]);
    const w = await withSchool(ctx, (tx) => workOn(tx, ctx, second, { check: false }));
    expect(w.remembered).toMatchObject({ source: "Fedena" });
    expect(w.remembered!.keys).toContain("guardianName");
    expect((await withSchool(ctx, (tx) => tx.importMapping.findUniqueOrThrow({ where: { id: m.id } }))).timesUsed).toBe(1);
    const upAudit = await withSchool(ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "Move-in File", recordId: second, action: "uploaded" } }));
    expect(upAudit.after).toMatchObject({ matchedAsLastTime: ["Fedena"] });
  });
});
