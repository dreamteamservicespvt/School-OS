// Security audit run-2, low findings (docs/qa/2026-10-31-security-audit-run-2.md
// section 4): paths that let a person reach records outside what they may
// touch inside one school. Most are the One-campus limit (00-global.md §5):
// a login whose School Access is "One campus" sees and changes only that
// campus's records, on detail pages, previews, files and undo too, not only in
// lists. tests/campus-scope.test.ts covers the lists and searches.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    getCurrent: async () => who.current as Current,
    requireCurrent,
    requirePage: async () => who.current as Current,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers({ host: "school.test" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
  unstable_rethrow: () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { examScope } from "@/lib/exams/scope";
import { saveCompetencyLevels } from "@/lib/exams/report-cards";
import { pastExports } from "@/lib/reports/government";
import { recordData } from "@/lib/documents/records";
import { createEvent, type EventInput } from "@/lib/events/events";
import { addEntry } from "@/lib/events/calendar";
import { makeSchool, makeUser } from "./helpers";
import { addStudent } from "./students/fixtures";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

let school: Awaited<ReturnType<typeof makeSchool>>;
let ctx: SchoolContext;
const run = <T>(fn: (tx: Tx) => Promise<T>) => withSchool(ctx, fn, { timeout: 60_000 });
let main: { campusId: string; yearId: string; classId: string; sectionId: string; studentId: string };
let north: { campusId: string; yearId: string; classId: string; sectionId: string; sectionB: string; studentId: string; studentB: string };
let users: { admin: string; northAdmin: string };
let cur: Record<keyof typeof users, Current>;

async function currentFor(userId: string): Promise<Current> {
  const access = await accessIn(userId, school.id);
  return { ...access!, ctx: { schoolId: school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null, support: null } as unknown as Current;
}

beforeAll(async () => {
  school = await makeSchool("Two Campus Limits School");
  const make = (roleKeys: string[], name: string) => makeUser({ schools: [{ id: school.id, roleKeys }], name });
  users = {
    admin: (await make(["school-admin"], "Whole Admin")).id,
    northAdmin: (await make(["school-admin"], "North Admin")).id,
  };
  ctx = { schoolId: school.id, userId: users.admin };
  const sid = school.id;
  const made = await run(async (tx) => {
    const mainCampus = school.campus.id;
    const northCampus = (await tx.campus.create({ data: { schoolId: sid, name: "North Campus" } })).id;
    const mainYear = await tx.academicYear.create({ data: { schoolId: sid, campusId: mainCampus, name: "2026-27", startDate: day("2026-04-01"), endDate: day("2027-03-31"), status: "ACTIVE" } });
    const northYear = await tx.academicYear.create({ data: { schoolId: sid, campusId: northCampus, name: "2026-27", startDate: day("2026-06-01"), endDate: day("2027-05-31"), status: "ACTIVE" } });
    const mainClass = await tx.schoolClass.create({ data: { schoolId: sid, campusId: mainCampus, name: "Class 5", sortOrder: 5 } });
    const northClass = await tx.schoolClass.create({ data: { schoolId: sid, campusId: northCampus, name: "Class 5", sortOrder: 5 } });
    const mainSec = await tx.section.create({ data: { schoolId: sid, classId: mainClass.id, academicYearId: mainYear.id, name: "A", seats: 40 } });
    const northSec = await tx.section.create({ data: { schoolId: sid, classId: northClass.id, academicYearId: northYear.id, name: "A", seats: 40 } });
    const northSecB = await tx.section.create({ data: { schoolId: sid, classId: northClass.id, academicYearId: northYear.id, name: "B", seats: 40 } });
    await tx.schoolAccess.updateMany({ where: { schoolId: sid, userLoginId: users.northAdmin }, data: { scope: "CAMPUS", campusId: northCampus } });
    return { mainCampus, northCampus, mainYear: mainYear.id, northYear: northYear.id, mainClass: mainClass.id, northClass: northClass.id, mainSec: mainSec.id, northSec: northSec.id, northSecB: northSecB.id };
  });
  const mainStudent = await addStudent(ctx, made.mainSec, { fullName: "Mohan Kumar", applyFeePlan: false });
  const northStudent = await addStudent(ctx, made.northSec, { fullName: "Neha Kumar", applyFeePlan: false });
  const northStudentB = await addStudent(ctx, made.northSecB, { fullName: "Nikhil Rao", applyFeePlan: false });
  main = { campusId: made.mainCampus, yearId: made.mainYear, classId: made.mainClass, sectionId: made.mainSec, studentId: mainStudent.student.id };
  north = { campusId: made.northCampus, yearId: made.northYear, classId: made.northClass, sectionId: made.northSec, sectionB: made.northSecB, studentId: northStudent.student.id, studentB: northStudentB.student.id };
  cur = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([k, id]) => [k, await currentFor(id)]))) as Record<keyof typeof users, Current>;
}, 240_000);

describe("competency levels are bound to the section's roster", () => {
  let competencyId: string;
  beforeAll(async () => {
    competencyId = await run(async (tx) => {
      const sid = school.id;
      const term = await tx.term.create({ data: { schoolId: sid, academicYearId: north.yearId, name: "Term 1", startDate: day("2026-06-01"), endDate: day("2026-11-30"), sortOrder: 1 } });
      const type = await tx.examType.create({ data: { schoolId: sid, name: "Half-yearly" } });
      await tx.exam.create({ data: { schoolId: sid, academicYearId: north.yearId, termId: term.id, examTypeId: type.id, title: "Half-yearly", startDate: day("2026-10-01"), endDate: day("2026-10-10"), classIds: [north.classId], status: "PUBLISHED" } });
      const subject = await tx.subject.create({ data: { schoolId: sid, name: "English", code: "ENG" } });
      return (await tx.competency.create({ data: { schoolId: sid, subjectId: subject.id, name: "Reads with understanding" } })).id;
    });
  });

  const save = (studentId: string) => run(async (tx) => {
    const scope = await examScope(tx, cur.northAdmin, north.yearId);
    return saveCompetencyLevels(tx, cur.northAdmin.ctx, scope, { sectionId: north.sectionId, period: "year", rows: [{ studentId, competencyId, level: "Proficient" }] });
  });
  const levelOf = (studentId: string) => run((tx) => tx.competencyLevel.findFirst({ where: { studentId, competencyId } }));

  it("saves a level for a student of the section", async () => {
    expect(await save(north.studentId)).toBe(1);
  });

  it("refuses a student of another section of the same campus", async () => {
    await expect(save(north.studentB)).rejects.toThrow(/Reload the page/);
    expect(await levelOf(north.studentB)).toBeNull();
  });

  it("refuses a student of another campus", async () => {
    await expect(save(main.studentId)).rejects.toThrow(/Reload the page/);
    expect(await levelOf(main.studentId)).toBeNull();
  });

  it("refuses a made-up student id", async () => {
    await expect(save(randomUUID())).rejects.toThrow(/Reload the page/);
  });
});

describe("certificate detail page keeps to the viewer's campus", () => {
  const certFor = (studentId: string) => run(async (tx) => (await tx.certificate.create({ data: { schoolId: school.id, studentId, type: "BONAFIDE", issueDate: day("2026-10-01"), verifyCode: randomUUID().slice(0, 12) } })).id);
  const open = async (as: Current, id: string) => {
    who.current = as;
    const { default: Page } = await import("@/app/(school)/student-management/certificates/[id]/page");
    return Page({ params: Promise.resolve({ id }) });
  };

  it("shows a certificate of the viewer's own campus", async () => {
    await expect(open(cur.northAdmin, await certFor(north.studentId))).resolves.toBeTruthy();
  });

  it("shows any campus's certificate to a whole-school viewer", async () => {
    await expect(open(cur.admin, await certFor(main.studentId))).resolves.toBeTruthy();
  });

  it("is not found for a certificate of another campus", async () => {
    await expect(open(cur.northAdmin, await certFor(main.studentId))).rejects.toThrow("NOT_FOUND");
  });
});

describe("Parent Link preview keeps to the viewer's campus", () => {
  let linkId: string;
  let mainSibling: string;
  beforeAll(async () => {
    const guardianId = await run(async (tx) => (await tx.studentGuardian.findFirstOrThrow({ where: { studentId: north.studentId } })).guardianId);
    mainSibling = (await addStudent(ctx, main.sectionId, { fullName: "Meera Kumar", applyFeePlan: false, linkGuardianId: guardianId })).student.id;
    const restricted = (await addStudent(ctx, main.sectionId, { fullName: "Manoj Kumar", applyFeePlan: false, linkGuardianId: guardianId })).student.id;
    linkId = await run(async (tx) => {
      await tx.studentGuardian.updateMany({ where: { studentId: restricted, guardianId }, data: { restriction: "Court order" } });
      return (await tx.parentLink.create({ data: { schoolId: school.id, guardianId, tokenHash: randomUUID(), tokenHint: "abcd" } })).id;
    });
  });

  // The page's element tree, unrendered: the guardian view it shows and the custody banner's words.
  const propsIn = (node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] => {
    if (Array.isArray(node)) node.forEach((n) => propsIn(n, out));
    else if (node && typeof node === "object" && "props" in node) {
      const p = (node as { props: Record<string, unknown> }).props;
      out.push(p);
      propsIn(p.children, out);
    }
    return out;
  };
  const preview = async (as: Current, child?: string) => {
    who.current = as;
    const { default: Page } = await import("@/app/(school)/communication/parent-link/[id]/preview/page");
    const props = propsIn(await Page({ params: Promise.resolve({ id: linkId }), searchParams: Promise.resolve({ child }) }));
    const view = props.find((p) => p.view)?.view as { children: { id: string }[]; child: { id: string } } | undefined;
    const banner = props.find((p) => p.title === "Custody restriction.");
    return { childIds: view?.children.map((c) => c.id) ?? [], shown: view?.child.id, restricted: JSON.stringify(banner?.children ?? "") };
  };

  it("shows a whole-school viewer every child and the restricted one", async () => {
    const p = await preview(cur.admin, mainSibling);
    expect(p.childIds.sort()).toEqual([north.studentId, mainSibling].sort());
    expect(p.shown).toBe(mainSibling);
    expect(p.restricted).toContain("Manoj Kumar");
  });

  it("shows a campus-limited viewer only their campus's children, even when another is asked for", async () => {
    const p = await preview(cur.northAdmin, mainSibling);
    expect(p.childIds).toEqual([north.studentId]);
    expect(p.shown).toBe(north.studentId);
    expect(p.restricted).not.toContain("Manoj Kumar");
  });
});

describe("government return files keep to the viewer's campus", () => {
  const ids: Record<"north" | "main" | "whole", string> = { north: "", main: "", whole: "" };
  beforeAll(async () => {
    await run(async (tx) => {
      for (const [k, campusId] of [["north", north.campusId], ["main", main.campusId], ["whole", null]] as const) {
        ids[k] = (await tx.governmentExport.create({ data: { schoolId: school.id, returnKey: "udise", title: "UDISE+", version: "2026", academicYearId: north.yearId, campusId, rows: 1, fileId: randomUUID(), exportedById: users.admin } })).id;
      }
    });
  });
  const download = async (as: Current, id: string) => {
    who.current = as;
    const { GET } = await import("@/app/(school)/reports-analytics/government/file/[id]/route");
    return (await GET(new Request(`http://school.test/reports-analytics/government/file/${id}`), { params: Promise.resolve({ id }) })).status;
  };

  it("lists every export to a whole-school viewer, and only the viewer's campus's to a campus-limited one", async () => {
    const listed = async (as: Current) => (await run((tx) => pastExports(tx, null, as))).map((x) => x.id).filter((id) => Object.values(ids).includes(id)).sort();
    expect(await listed(cur.admin)).toEqual(Object.values(ids).sort());
    expect(await listed(cur.northAdmin)).toEqual([ids.north]);
  });

  it("downloads only the viewer's campus's files", async () => {
    expect(await download(cur.admin, ids.main)).toBe(307);
    expect(await download(cur.northAdmin, ids.north)).toBe(307);
    expect(await download(cur.northAdmin, ids.main)).toBe(404);
    expect(await download(cur.northAdmin, ids.whole)).toBe(404);
  });
});

describe("document preview and person export keep to the viewer's campus", () => {
  let mainStaff: string;
  let mainGuardian: string;
  beforeAll(async () => {
    ({ mainStaff, mainGuardian } = await run(async (tx) => ({
      mainStaff: (await tx.staff.create({ data: { schoolId: school.id, campusId: main.campusId, staffCode: `S-${randomUUID().slice(0, 6)}`, firstName: "Meena", lastName: "Main", fullName: "Meena Main", phone: "9876500011", designation: "Teacher", staffType: "Teaching", joiningDate: day("2020-06-01") } })).id,
      mainGuardian: (await tx.studentGuardian.findFirstOrThrow({ where: { studentId: main.studentId } })).guardianId,
    })));
  });

  const exportOf = async (as: Current, type: string, id: string) => {
    who.current = as;
    const { GET } = await import("@/app/(school)/settings/data-security/privacy/person-export/route");
    return (await GET(new Request(`http://school.test/settings/data-security/privacy/person-export?type=${type}&id=${id}`))).status;
  };

  it("exports a person of the viewer's campus, and anyone to a whole-school viewer", async () => {
    expect(await exportOf(cur.northAdmin, "student", north.studentId)).toBe(200);
    expect(await exportOf(cur.admin, "student", main.studentId)).toBe(200);
    expect(await exportOf(cur.admin, "staff", mainStaff)).toBe(200);
  });

  it("does not export another campus's student, guardian or staff member", async () => {
    expect(await exportOf(cur.northAdmin, "student", main.studentId)).toBe(404);
    expect(await exportOf(cur.northAdmin, "guardian", mainGuardian)).toBe(404);
    expect(await exportOf(cur.northAdmin, "staff", mainStaff)).toBe(404);
  });

  it("previews a design with sample data, not another campus's record", async () => {
    const name = async (as: Current, id: string) => (await run((tx) => recordData(tx, as.ctx, "transfer-certificate", { kind: "student", id }, "Asia/Kolkata", as))).fields.student_name;
    expect(await name(cur.admin, main.studentId)).toBe("Mohan Kumar");
    expect(await name(cur.northAdmin, north.studentId)).toBe("Neha Kumar");
    expect(await name(cur.northAdmin, main.studentId)).not.toBe("Mohan Kumar");
  });

  it("finds only the viewer's campus's records to preview with", async () => {
    const { findRecords } = await import("@/app/(school)/settings/document-designs/actions");
    who.current = cur.northAdmin;
    const students = (await findRecords("student", "Kumar")).map((h) => h.id);
    expect(students).toContain(north.studentId);
    expect(students).not.toContain(main.studentId);
    expect((await findRecords("staff", "Meena")).map((h) => h.id)).not.toContain(mainStaff);
    expect((await findRecords("student", "")).map((h) => h.id)).not.toContain(main.studentId);
  });
});

describe("student import undo keeps to the viewer's campus", () => {
  const batchOf = (studentId: string) => run(async (tx) => (await tx.importBatch.create({ data: { schoolId: school.id, kind: "students", fileName: "students.csv", createdIds: [studentId], importedById: users.admin } })).id);
  const undo = async (as: Current, id: string) => {
    who.current = as;
    const { undoImportAction } = await import("@/app/(school)/student-management/_actions/import");
    const fd = new FormData();
    fd.set("id", id);
    return undoImportAction(fd);
  };
  const archived = (studentId: string) => run(async (tx) => (await tx.student.findUniqueOrThrow({ where: { id: studentId } })).archivedAt);

  it("undoes an import of the viewer's own campus", async () => {
    const s = (await addStudent(ctx, north.sectionId, { fullName: "Naina Imported", applyFeePlan: false })).student.id;
    expect(await undo(cur.northAdmin, await batchOf(s))).toBeUndefined();
    expect(await archived(s)).not.toBeNull();
  });

  it("refuses an import of another campus's students", async () => {
    const s = (await addStudent(ctx, main.sectionId, { fullName: "Madhu Imported", applyFeePlan: false })).student.id;
    const id = await batchOf(s);
    expect(await undo(cur.northAdmin, id)).toMatch(/not found, or is on another campus/);
    expect(await archived(s)).toBeNull();
    expect(await run(async (tx) => (await tx.importBatch.findUniqueOrThrow({ where: { id } })).undoneAt)).toBeNull();
  });
});

describe("Events & Calendar keep to the viewer's campus", () => {
  const DAY = 86_400_000;
  const soon = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
  const input = (name: string, campusId: string | null): EventInput => ({
    name, type: "Celebration", date: soon(10), startMin: 600, endMin: 720, venue: null, audienceKind: "school", classIds: [],
    registrationOn: false, seats: null, feePaise: null, reminder: "none", description: null, campusId,
  });
  const make = (name: string, campusId: string | null) => run(async (tx) => (await createEvent(tx, ctx, input(name, campusId))).id);
  const form = (fields: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.set(k, v); return fd; };
  const act = async (name: string, fields: Record<string, string>) => {
    who.current = cur.northAdmin;
    const actions = await import("@/app/(school)/events-calendar/actions");
    const fn = (actions as unknown as Record<string, (s: unknown, fd: FormData) => Promise<{ ok: boolean; message?: string }>>)[name];
    return fn(null, form(fields));
  };
  const statusOf = (id: string) => run(async (tx) => (await tx.event.findUniqueOrThrow({ where: { id } })).status);

  it("cancels an event of the viewer's own campus", async () => {
    const id = await make("North Sports Day", north.campusId);
    const r = await act("cancelEventAction", { eventId: id, reason: "Heavy rain is expected" });
    expect(r.ok).toBe(true);
    expect(await statusOf(id)).toBe("CANCELLED");
  });

  it("refuses to cancel another campus's event, or an event for every campus", async () => {
    for (const campusId of [main.campusId, null]) {
      const id = await make(`Main Day ${campusId ?? "all"}`, campusId);
      const r = await act("cancelEventAction", { eventId: id, reason: "Heavy rain is expected" });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/not found, or is on another campus/);
      expect(await statusOf(id)).not.toBe("CANCELLED");
    }
  });

  it("refuses to remind about, or register for, another campus's event", async () => {
    const id = await make("Main Annual Day", main.campusId);
    expect((await act("remindAction", { eventId: id })).message).toMatch(/another campus/);
    expect((await act("registerAction", { eventId: id, studentIds: main.studentId })).message).toMatch(/another campus/);
  });

  it("makes a new event for the viewer's own campus, whatever campus is asked for", async () => {
    const r = await act("saveEventAction", { name: "North Quiz", type: "Celebration", date: soon(12), startTime: "10:00", campusId: main.campusId, audienceKind: "school", reminder: "none" });
    expect(r.ok).toBe(true);
    const made = await run((tx) => tx.event.findFirstOrThrow({ where: { name: "North Quiz" } }));
    expect(made.campusId).toBe(north.campusId);
  });

  it("refuses to remove another campus's calendar entry", async () => {
    const entry = await run((tx) => addEntry(tx, ctx, { title: "Main Founders Day", type: "holiday", from: soon(20), to: null, attendanceOn: false, campusId: main.campusId, classIds: [], details: null }, { confirm: true, today: soon(0) }));
    expect((await act("removeEntryAction", { entryId: entry.id })).message).toMatch(/another campus/);
    expect(await run(async (tx) => (await tx.calendarEntry.findUniqueOrThrow({ where: { id: entry.id } })).archivedAt)).toBeNull();
  });

  it("opens the viewer's campus's events and every-campus events, not another campus's", async () => {
    who.current = cur.northAdmin;
    const { default: Page } = await import("@/app/(school)/events-calendar/events/[id]/page");
    const open = async (id: string) => Page({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) } as never);
    await expect(open(await make("North Fair", north.campusId))).resolves.toBeTruthy();
    await expect(open(await make("Whole Fair", null))).resolves.toBeTruthy();
    await expect(open(await make("Main Fair", main.campusId))).rejects.toThrow("NOT_FOUND");
  });

  it("refuses to cancel another campus's PTM", async () => {
    const ptm = await run((tx) => tx.ptm.create({ data: { schoolId: school.id, academicYearId: main.yearId, date: new Date(`${soon(15)}T00:00:00Z`), classIds: [main.classId], classesLabel: "Class 5", startMin: 600, endMin: 720, slotMinutes: 10 } }));
    expect((await act("cancelPtmAction", { ptmId: ptm.id, reason: "Clashes with the exams" })).message).toMatch(/another campus/);
  });
});

describe("Events activities (houses, clubs, teams, achievements, diary) keep to the viewer's campus", () => {
  const form = (fields: Record<string, string | string[]>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
    return fd;
  };
  const act = async (name: string, fields: Record<string, string | string[]>, as = cur.northAdmin) => {
    who.current = as;
    const actions = await import("@/app/(school)/events-calendar/activity-actions");
    const fn = (actions as unknown as Record<string, (s: unknown, fd: FormData) => Promise<{ ok: boolean; message?: string }>>)[name];
    return fn(null, form(fields));
  };
  const achievement = (studentId: string, yearId: string) => run(async (tx) => (await tx.achievement.create({ data: { schoolId: school.id, academicYearId: yearId, studentId, activity: "Inter-school quiz", kind: "Quiz", date: day("2026-07-10") } })).id);
  const archivedAt = (id: string) => run(async (tx) => (await tx.achievement.findUniqueOrThrow({ where: { id } })).archivedAt);

  it("takes the viewer's own campus's achievement off the record", async () => {
    const id = await achievement(north.studentId, north.yearId);
    const r = await act("archiveAchievementAction", { achievementId: id, reason: "Entered by mistake" });
    expect(r.message).not.toMatch(/another campus/);
    expect(await archivedAt(id)).not.toBeNull();
  });

  it("refuses to take off, or print a certificate for, another campus's achievement", async () => {
    const id = await achievement(main.studentId, main.yearId);
    expect((await act("archiveAchievementAction", { achievementId: id, reason: "Entered by mistake" })).message).toMatch(/another campus/);
    expect((await act("certificatesAction", { achievementIds: id })).message).toMatch(/another campus/);
    expect(await archivedAt(id)).toBeNull();
    expect(await run(async (tx) => (await tx.achievement.findUniqueOrThrow({ where: { id } })).certificateNo)).toBeNull();
  });

  it("refuses achievements, credits and fitness tests for another campus's student", async () => {
    expect((await act("achievementAction", { studentIds: [north.studentId, main.studentId], activity: "Inter-school quiz", kind: "Quiz", level: "School", result: "won", date: "2026-07-10" })).message).toMatch(/your own campus/);
    expect((await act("creditCorrectionAction", { studentId: main.studentId, points: "5", reason: "Missed last term" })).message).toMatch(/another campus/);
    expect((await act("fitnessAction", { studentId: main.studentId, date: "2026-07-10", heightCm: "130" })).message).toMatch(/another campus/);
  });

  it("refuses changes to houses, clubs and teams, which are for every campus", async () => {
    const [house, club] = await run(async (tx) => [
      await tx.house.create({ data: { schoolId: school.id, name: "Red House" } }),
      await tx.club.create({ data: { schoolId: school.id, name: "Science Club" } }),
    ]);
    expect((await act("houseAction", { houseId: house.id, name: "Blue House", colour: "info" })).message).toMatch(/every campus/);
    expect((await act("housePointsAction", { houseId: house.id, points: "10", reason: "Won the relay" })).message).toMatch(/every campus/);
    expect((await act("assignHousesAction", { mode: "turn" })).message).toMatch(/every campus/);
    expect((await act("clubAction", { clubId: club.id, name: "Maths Club" })).message).toMatch(/every campus/);
    expect((await act("teamAction", { name: "Under-14 Football", sport: "Football" })).message).toMatch(/every campus/);
    expect((await act("archiveGroupAction", { kind: "club", groupId: club.id })).message).toMatch(/every campus/);
    const after = await run(async (tx) => [await tx.house.findUniqueOrThrow({ where: { id: house.id } }), await tx.club.findUniqueOrThrow({ where: { id: club.id } })] as const);
    expect(after[0].name).toBe("Red House");
    expect(after[1].name).toBe("Science Club");
    expect(after[1].archivedAt).toBeNull();
  });

  it("refuses to add or take off another campus's student in a club, or move them into a house", async () => {
    const [house, club] = await run(async (tx) => [
      await tx.house.create({ data: { schoolId: school.id, name: "Green House" } }),
      await tx.club.create({ data: { schoolId: school.id, name: "Art Club" } }),
    ]);
    await run((tx) => tx.clubMember.create({ data: { schoolId: school.id, academicYearId: main.yearId, clubId: club.id, studentId: main.studentId } }));
    expect((await act("membersAction", { kind: "club", groupId: club.id, studentIds: main.studentId })).message).toMatch(/your own campus/);
    expect((await act("removeMemberAction", { kind: "club", groupId: club.id, studentId: main.studentId })).message).toMatch(/another campus/);
    expect((await act("sessionAction", { kind: "club", groupId: club.id, date: "2026-07-10", present: main.studentId })).message).toMatch(/another campus/);
    expect((await act("assignHousesAction", { mode: "hand", houseId: house.id, studentIds: main.studentId })).message).toMatch(/your own campus/);
    expect(await run((tx) => tx.clubMember.count({ where: { clubId: club.id, archivedAt: null } }))).toBe(1);
  });

  it("refuses a diary reminder for another campus's class", async () => {
    const sectionId = await run(async (tx) => {
      const cls = await tx.schoolClass.create({ data: { schoolId: school.id, campusId: main.campusId, name: "LKG", level: "Pre-primary", sortOrder: 0 } });
      return (await tx.section.create({ data: { schoolId: school.id, classId: cls.id, academicYearId: main.yearId, name: "A", seats: 30 } })).id;
    });
    expect((await act("remindDiaryAction", { sectionId })).message).toMatch(/another campus/);
  });
});
