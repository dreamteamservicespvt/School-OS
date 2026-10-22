// Photos of paper registers into the same import preview (gap list G43). A
// fake AI service reads the "photo": no test reaches the network. The rows it
// gives land in the one import engine's review, each marked as read from a
// photo; nothing is saved until Bring in, which is written as "prepared by
// AI, confirmed by <person>", and Undo takes it back. With the AI assistant
// off the photo option refuses in plain words, with the ready sheet as the
// way on, and nothing is sent. A role that cannot add the records sends nothing.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { useAiProvider, type AiProvider, type AiRequest } from "@/lib/ai";
import { REGISTER_SYSTEM, registerQuestion, sheetFromPages, UNCLEAR } from "@/lib/ai/register-photo";
import { addPhotoUpload, photoRefusal } from "@/lib/move-in/photos";
import { importFile, MoveInProblem, photosOf, settleImports, UNCLEAR_PROBLEM, workOn } from "@/lib/move-in/service";
import { undoImport } from "@/lib/importer";
import { runDueJobs } from "@/lib/jobs";
import { saveAssistant, setFeature } from "@/lib/settings/switches";
import { PhotoRowBadge, PHOTO_ROW_WORDS, photoOfLine } from "@/components/import/register-photos";
import type { PermissionMap } from "@/lib/permissions";
import { studentSchool } from "../students/fixtures";

describe("pages read into one sheet", () => {
  it("keeps the first page's headings, joins the pages in order and says which rows each gave", () => {
    const got = sheetFromPages([
      { headings: ["Adm No", "Name", "Class"], rows: [["1", "Arjun Rao", "5-A"], ["2", "Priya", "5-B"]] },
      // A continuation page with the headings written again: that line is not a record.
      { headings: [], rows: [["Adm No", "Name", "Class"], ["3", "Kiran", "5-A"], ["", "", ""]] },
    ]);
    expect(got.rows).toEqual([["Adm No", "Name", "Class"], ["1", "Arjun Rao", "5-A"], ["2", "Priya", "5-B"], ["3", "Kiran", "5-A"]]);
    expect(got.spans).toEqual([{ from: 2, to: 3 }, { from: 4, to: 4 }]);
  });

  it("never keeps a restricted column or an Aadhaar-shaped number from the answer", () => {
    const got = sheetFromPages([{ headings: ["Name", "Aadhaar No", "Bank A/c", "Mobile", "Notes"], rows: [["Arjun", "1234 5678 9012", "00112233", "919876511111", "2345 6789 0123"]] }]);
    expect(got.rows).toEqual([["Name", "Mobile", "Notes"], ["Arjun", "919876511111", ""]]);
    expect(got.dropped.sort()).toEqual(["Aadhaar", "bank details"]);
  });

  it("names the columns when no page has headings", () => {
    expect(sheetFromPages([{ headings: [], rows: [["Arjun", "5-A"]] }]).rows[0]).toEqual(["Column 1", "Column 2"]);
  });

  it("sends with the picture only the import's name and the columns School OS keeps", () => {
    expect(registerQuestion("Students", [{ label: "Full name" }, { label: "Class" }])).toEqual({ importing: "Students", columnsSchoolOsKeeps: ["Full name", "Class"] });
    expect(REGISTER_SYSTEM).toContain("Never correct, complete, guess or invent");
    expect(REGISTER_SYSTEM).toContain(UNCLEAR);
  });

  it("marks each row with the photo it came from", () => {
    const photos = [{ fileId: "a", fileName: "p1.jpg", contentType: "image/jpeg", from: 2, to: 3 }, { fileId: "b", fileName: "p2.jpg", contentType: "image/jpeg", from: 4, to: 4 }];
    expect(photoOfLine(photos, 4)).toBe(2);
    expect(photoOfLine(photos, 9)).toBeNull();
    expect(renderToStaticMarkup(createElement(PhotoRowBadge, { photos, line: 3 }))).toContain(`${PHOTO_ROW_WORDS} (photo 1)`);
    expect(renderToStaticMarkup(createElement(PhotoRowBadge, { photos: [], line: 3 }))).toBe("");
  });
});

let s: Awaited<ReturnType<typeof studentSchool>>;
let ctx: SchoolContext;
let perms: PermissionMap;
const ON = { features: new Set(["ai-assistant", "ai-smart-import"]), roles: [{ key: "school-admin" }], aiRoles: ["school-admin"] };

const HEADINGS = ["Admission No", "Student Name", "Father Name", "Mobile", "Class", "Date of Birth", "Gender"];
const ROWS = [
  ["REG-501", "Arjun Rao", "Srinivas Rao", "9876511111", "5-A", "14-03-2016", "M"],
  ["REG-502", "Priya Sharma", "Ramesh Sharma", "9876522222", "5-B", "02-11-2015", "F"],
  ["REG-503", `Kiran ${UNCLEAR}`, "Mohan Das", "9876533333", "5-A", "05-07-2016", "M"],
];

/** A fake AI service that "reads" the register page and keeps what it was sent. */
function fake(answer: unknown = { readable: true, headings: HEADINGS, rows: ROWS }) {
  const sent: AiRequest[] = [];
  const provider: AiProvider = {
    name: "fake",
    ask: async (req) => { sent.push(req); return { outcome: "ok", data: answer, usage: { inputTokens: 1600, outputTokens: 400, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: "claude-opus-5-5" }; },
  };
  return { provider, sent };
}

async function photo(name = "register-page-1.png") {
  const buf = await sharp({ create: { width: 60, height: 40, channels: 3, background: "white" } }).png().toBuffer();
  return new File([new Uint8Array(buf)], name, { type: "image/png" });
}

const countStudents = () => withSchool(ctx, (tx) => tx.student.count({ where: { archivedAt: null } }));
const countPhotos = () => withSchool(ctx, (tx) => tx.storedFile.count({ where: { purpose: "move-in-photo", archivedAt: null } }));

beforeAll(async () => {
  s = await studentSchool();
  ctx = s.ctx;
  perms = (await accessIn(s.admin.id, s.school.id))!.permissions;
});

afterEach(() => useAiProvider(null));

describe("with the AI assistant off", () => {
  it("says plainly that photos need the AI assistant switched on in Settings, and suggests the ready sheet", () => {
    useAiProvider(fake().provider);
    const off = photoRefusal({ features: new Set(), roles: [{ key: "school-admin" }] })!;
    expect(off).toContain("needs the AI assistant switched on in Settings, Modules On/Off");
    expect(off).toContain("download the ready Excel sheet");
    expect(photoRefusal({ ...ON, features: new Set(["ai-assistant"]) })).toContain("switched on in Settings");
    expect(photoRefusal({ ...ON, roles: [{ key: "class-teacher" }] })).toContain("not turned on for your role");
    useAiProvider(null);
    expect(photoRefusal(ON)).toContain("not connected yet");
    expect(photoRefusal(ON)).toContain("ready Excel sheet");
  });

  it("refuses the upload before anything is kept or sent", async () => {
    const f = fake();
    useAiProvider(f.provider);
    const before = await countPhotos();
    await expect(addPhotoUpload(ctx, { features: new Set(), roles: [{ key: "school-admin" }], permissions: perms }, { files: [await photo()], kind: "students", privateCovered: true }))
      .rejects.toThrow(/needs the AI assistant switched on in Settings/);
    expect(f.sent).toHaveLength(0);
    expect(await countPhotos()).toBe(before);
  });

  it("is refused by the gateway too when the school's own switch is off, and the photo is put away", async () => {
    // The screen thought AI was on; the gateway reads the school's switches itself.
    const f = fake();
    useAiProvider(f.provider);
    await expect(addPhotoUpload(ctx, { ...ON, permissions: perms }, { files: [await photo()], kind: "students", privateCovered: true }))
      .rejects.toThrow("The AI assistant is off for this school.");
    expect(f.sent).toHaveLength(0);
    expect(await countPhotos()).toBe(0);
  });
});

describe("with Smart Import on", () => {
  let fileId = "";

  beforeAll(async () => {
    await withSchool(ctx, async (tx) => {
      await saveAssistant(tx, ctx, { on: true, roles: ["school-admin"] });
      await setFeature(tx, ctx, "ai-smart-import", true);
    });
  });

  it("sends nothing for a role that cannot add the records, or before the private numbers are covered", async () => {
    const f = fake();
    useAiProvider(f.provider);
    const teacher = (await accessIn(s.teacherUser.id, s.school.id))!.permissions;
    await expect(addPhotoUpload({ schoolId: s.school.id, userId: s.teacherUser.id }, { ...ON, permissions: teacher }, { files: [await photo()], kind: "students", privateCovered: true }))
      .rejects.toThrow(MoveInProblem);
    await expect(addPhotoUpload(ctx, { ...ON, permissions: perms }, { files: [await photo()], kind: "students", privateCovered: false }))
      .rejects.toThrow(/Cover or cut out Aadhaar/);
    expect(f.sent).toHaveLength(0);
  });

  it("reads the photo into rows that land in the same review, each marked, with nothing saved", async () => {
    const f = fake();
    useAiProvider(f.provider);
    const students = await countStudents();
    const r = await addPhotoUpload(ctx, { ...ON, permissions: perms }, { files: [await photo()], kind: "students", privateCovered: true });
    expect(r.ids).toHaveLength(1);
    fileId = r.ids[0];

    // Only the picture went, with the import's name and column names: never a record.
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0].images).toHaveLength(1);
    expect(f.sent[0].images[0].mediaType).toBe("image/jpeg");
    expect(f.sent[0].text).toContain("Students");
    for (const v of ROWS.flat()) if (v.length > 2) expect(f.sent[0].text).not.toContain(v);
    const call = await withSchool(ctx, (tx) => tx.aiCall.findFirstOrThrow({ where: { purpose: "Read a register photo" }, orderBy: { createdAt: "desc" } }));
    expect(call).toMatchObject({ feature: "ai-smart-import", outcome: "ok", sent: true, userLoginId: s.admin.id });

    const file = await withSchool(ctx, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id: fileId } }));
    expect(file.fileName).toBe("register-page-1 (read from a photo).csv");
    expect(photosOf(file)).toMatchObject([{ fileName: "register-page-1.png", contentType: "image/jpeg", from: 2, to: 4 }]);
    // Column matching is the engine's own.
    expect((file.columnMatch as Record<string, number[]>).admissionNo).toEqual([0]);

    const w = await withSchool(ctx, (tx) => workOn(tx, ctx, fileId, { check: true }));
    expect(w.checked!.ready.map((x) => x.line)).toEqual([2, 3]);
    // A part the reader could not read is a problem until a person types it in.
    expect(w.checked!.problems).toMatchObject([{ line: 4, problems: [UNCLEAR_PROBLEM] }]);
    expect(await countStudents()).toBe(students);

    const audit = await withSchool(ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "Move-in File", recordId: fileId, action: "uploaded" } }));
    expect(audit.after).toMatchObject({ readFromPhotos: ["register-page-1.png"] });
  });

  it("brings in only when the person presses Bring in, written as prepared by AI, confirmed by them, and Undo takes it back", async () => {
    const students = await countStudents();
    await withSchool(ctx, (tx) => importFile(tx, ctx, fileId));
    for (let i = 0; i < 10; i++) if ((await runDueJobs(50, { schoolId: ctx.schoolId })) === 0) break;
    await withSchool(ctx, (tx) => settleImports(tx));
    expect(await countStudents()).toBe(students + 2);
    const audit = await withSchool(ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "Move-in File", recordId: fileId, action: "import-started" } }));
    expect(audit.actorNote).toBe("prepared by AI, confirmed by Admin");
    expect(audit.after).toMatchObject({ rows: 2, leftWithProblems: 1, readFromPhotos: true });

    const f = await withSchool(ctx, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id: fileId } }));
    await withSchool(ctx, (tx) => undoImport(tx, ctx, f.batchIds.at(-1)!));
    expect(await countStudents()).toBe(students);
  });

  it("reads a PDF scan as a document, and says so plainly when a page cannot be read", async () => {
    const pdf = new File([new TextEncoder().encode("%PDF-1.4\n%fake scan\n")], "scan.pdf", { type: "application/pdf" });
    const unreadable = fake({ readable: false, headings: [], rows: [] });
    useAiProvider(unreadable.provider);
    const before = await countPhotos();
    await expect(addPhotoUpload(ctx, { ...ON, permissions: perms }, { files: [pdf], kind: "students", privateCovered: true }))
      .rejects.toThrow("“scan.pdf” could not be read as a register page.");
    expect(unreadable.sent[0].images[0].mediaType).toBe("application/pdf");
    expect(await countPhotos()).toBe(before);
  });
});
