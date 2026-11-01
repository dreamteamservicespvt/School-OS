// Security audit run-3 (~/security-audit-skill/School-OS/run-3), batch B: the
// One-campus limit (20-settings.md, Users & Permissions, scope "One campus")
// on the records a person names by id, and on the students a page lists.
// A person kept to one campus sees and changes only that campus's students
// and staff, in every list and every action; another campus's record is "not
// found". The school here has two campuses, Main and North; North Admin is a
// School Admin kept to North.
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
import { createEvent, registerStudents, type EventInput } from "@/lib/events/events";
import { makeSchool, makeUser } from "./helpers";
import { addStudent } from "./students/fixtures";

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const DAY = 86_400_000;
const soon = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

let school: Awaited<ReturnType<typeof makeSchool>>;
let ctx: SchoolContext;
const run = <T>(fn: (tx: Tx) => Promise<T>) => withSchool(ctx, fn, { timeout: 60_000 });
type Side = { campusId: string; yearId: string; classId: string; sectionId: string; studentId: string; alumId: string; staffId: string };
let main: Side;
let north: Side;
let users: { admin: string; northAdmin: string };
let cur: Record<keyof typeof users, Current>;

async function currentFor(userId: string): Promise<Current> {
  const access = await accessIn(userId, school.id);
  return { ...access!, ctx: { schoolId: school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null, support: null } as unknown as Current;
}

/** Every string in a server component's element tree, element props and plain data (sheet lists) included. */
function textOf(n: unknown, seen = new WeakSet<object>()): string {
  if (n === null || n === undefined || typeof n === "boolean" || typeof n === "function" || typeof n === "symbol") return "";
  if (typeof n === "string" || typeof n === "number" || typeof n === "bigint") return String(n);
  if (typeof n !== "object" || seen.has(n)) return "";
  seen.add(n);
  if (Array.isArray(n)) return n.map((x) => textOf(x, seen)).join(" ");
  if ("props" in n) return textOf((n as { props: unknown }).props, seen);
  if (n instanceof Map) return [...n.values()].map((x) => textOf(x, seen)).join(" ");
  if (n instanceof Date || n instanceof Set) return "";
  return Object.values(n as Record<string, unknown>).map((x) => textOf(x, seen)).join(" ");
}

const NAMES = {
  main: { student: "Mohan Kumar", alum: "Manoj Alumnus", staff: "Madhavi Teacher" },
  north: { student: "Neha Kumar", alum: "Nandini Alumna", staff: "Naveen Teacher" },
};

beforeAll(async () => {
  school = await makeSchool("Run-3 Campus School");
  const make = (roleKeys: string[], name: string) => makeUser({ schools: [{ id: school.id, roleKeys }], name });
  users = {
    admin: (await make(["school-admin"], "Whole Admin")).id,
    northAdmin: (await make(["school-admin"], "North Admin")).id,
  };
  ctx = { schoolId: school.id, userId: users.admin };
  const sid = school.id;
  const side = async (tx: Tx, campusId: string, start: string, end: string, n: typeof NAMES.main, code: string) => {
    const year = await tx.academicYear.create({ data: { schoolId: sid, campusId, name: "2026-27", startDate: day(start), endDate: day(end), status: "ACTIVE" } });
    const cls = await tx.schoolClass.create({ data: { schoolId: sid, campusId, name: "Class 5", sortOrder: 5 } });
    const sec = await tx.section.create({ data: { schoolId: sid, classId: cls.id, academicYearId: year.id, name: "A", seats: 40 } });
    const [first, last] = n.alum.split(" ");
    const alum = await tx.student.create({ data: { schoolId: sid, campusId, admissionNo: `${code}-AL`, firstName: first, lastName: last, fullName: n.alum, status: "ALUMNI" } });
    const [sf, sl] = n.staff.split(" ");
    const staff = await tx.staff.create({ data: { schoolId: sid, campusId, staffCode: `${code}-T1`, firstName: sf, lastName: sl, fullName: n.staff, phone: code === "M" ? "9876500301" : "9876500302", designation: "Teacher", joiningDate: day("2020-06-01") } });
    return { campusId, yearId: year.id, classId: cls.id, sectionId: sec.id, alumId: alum.id, staffId: staff.id };
  };
  const made = await run(async (tx) => {
    const northCampus = (await tx.campus.create({ data: { schoolId: sid, name: "North Campus" } })).id;
    await tx.schoolAccess.updateMany({ where: { schoolId: sid, userLoginId: users.northAdmin }, data: { scope: "CAMPUS", campusId: northCampus } });
    return {
      main: await side(tx, school.campus.id, "2026-04-01", "2027-03-31", NAMES.main, "M"),
      north: await side(tx, northCampus, "2026-06-01", "2027-05-31", NAMES.north, "N"),
    };
  });
  main = { ...made.main, studentId: (await addStudent(ctx, made.main.sectionId, { fullName: NAMES.main.student, applyFeePlan: false })).student.id };
  north = { ...made.north, studentId: (await addStudent(ctx, made.north.sectionId, { fullName: NAMES.north.student, applyFeePlan: false })).student.id };
  cur = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([k, id]) => [k, await currentFor(id)]))) as Record<keyof typeof users, Current>;
}, 240_000);

const input = (name: string, campusId: string | null, over: Partial<EventInput> = {}): EventInput => ({
  name, type: "Celebration", date: soon(10), startMin: 600, endMin: 720, venue: null, audienceKind: "school", classIds: [],
  registrationOn: true, seats: null, feePaise: null, reminder: "none", description: null, campusId, ...over,
});
const makeEvent = (name: string, campusId: string | null, over: Partial<EventInput> = {}) => run(async (tx) => (await createEvent(tx, ctx, input(name, campusId, over))).id);
const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
};
const act = async (name: string, fields: Record<string, string | string[]>, as = cur.northAdmin) => {
  who.current = as;
  const actions = await import("@/app/(school)/events-calendar/actions");
  const fn = (actions as unknown as Record<string, (s: unknown, fd: FormData) => Promise<{ ok: boolean; message?: string }>>)[name];
  return fn(null, form(fields));
};
const eventPage = async (id: string, sp: Record<string, string> = {}, as = cur.northAdmin) => {
  who.current = as;
  const { default: Page } = await import("@/app/(school)/events-calendar/events/[id]/page");
  return textOf(await Page({ params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) } as never));
};
const regCount = (eventId: string, studentId: string) => run((tx) => tx.eventRegistration.count({ where: { eventId, studentId, withdrawnAt: null } }));

describe("Events actions keep the students and staff they name to the person's campus (run-3, low)", () => {
  let alumniEvent = "";
  beforeAll(async () => {
    alumniEvent = await makeEvent("North Alumni Meet", north.campusId, { audienceKind: "alumni" });
  });

  it("registers the person's own campus's alumnus for their campus's alumni event", async () => {
    const r = await act("registerAction", { eventId: alumniEvent, studentIds: north.alumId });
    expect(r.ok).toBe(true);
    expect(await regCount(alumniEvent, north.alumId)).toBe(1);
  }, 120_000);

  it("refuses another campus's alumnus, or student, on the person's own campus's event", async () => {
    const r = await act("registerAction", { eventId: alumniEvent, studentIds: main.alumId });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/your own campus/);
    expect(await regCount(alumniEvent, main.alumId)).toBe(0);
    const schoolEvent = await makeEvent("North Quiz", north.campusId);
    const r2 = await act("registerAction", { eventId: schoolEvent, studentIds: [north.studentId, main.studentId] });
    expect(r2.message).toMatch(/your own campus/);
    expect(await regCount(schoolEvent, main.studentId)).toBe(0);
    expect(await regCount(schoolEvent, north.studentId)).toBe(0);
  }, 120_000);

  it("an alumni event of one campus takes only that campus's alumni, even from someone who works for the whole school", async () => {
    await expect(run((tx) => registerStudents(tx, ctx, alumniEvent, [main.alumId], soon(0)))).rejects.toThrow("These students are not in Alumni, North Campus.");
    expect(await regCount(alumniEvent, main.alumId)).toBe(0);
  });

  it("the Register sheet of a campus's alumni event lists that campus's alumni only", async () => {
    const shown = await eventPage(alumniEvent, { do: "register" });
    expect(shown).toContain(NAMES.north.alum);
    expect(shown).not.toContain(NAMES.main.alum);
    const wholeSchool = await eventPage(alumniEvent, { do: "register" }, cur.admin);
    expect(wholeSchool).not.toContain(NAMES.main.alum);
  }, 120_000);

  it("refuses to tag another campus's student in a photo of the person's campus's album", async () => {
    const mediaId = await run(async (tx) => {
      const album = await tx.album.create({ data: { schoolId: school.id, number: "AL-N-1", name: "North Alumni Meet photos", eventId: alumniEvent, date: day(soon(10)) } });
      return (await tx.mediaItem.create({ data: { schoolId: school.id, albumId: album.id, fileId: north.studentId } })).id;
    });
    const r = await act("tagAction", { mediaId, studentIds: [main.studentId] });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/your own campus/);
    expect(await run((tx) => tx.mediaTag.count({ where: { mediaId } }))).toBe(0);
    expect((await act("tagAction", { mediaId, studentIds: [north.studentId] })).ok).toBe(true);
  }, 120_000);

  it("refuses another campus's student or staff member as a volunteer, without their name", async () => {
    const before = await run((tx) => tx.eventVolunteer.count({ where: { eventId: alumniEvent } }));
    for (const [kind, personId, name] of [["student", main.studentId, NAMES.main.student], ["staff", main.staffId, NAMES.main.staff]] as const) {
      const r = await act("volunteerAction", { eventId: alumniEvent, kind, personId, name: "x", duty: "First aid" });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/another campus/);
      expect(r.message).not.toContain(name);
    }
    expect(await run((tx) => tx.eventVolunteer.count({ where: { eventId: alumniEvent } }))).toBe(before);
    const ok = await act("volunteerAction", { eventId: alumniEvent, kind: "staff", personId: north.staffId, name: "x", duty: "First aid" });
    expect(ok.message).toContain(NAMES.north.staff);
  }, 120_000);

  it("the Volunteer sheet lists the person's own campus's staff only", async () => {
    const shown = await eventPage(alumniEvent, { do: "volunteer", tab: "vol" });
    expect(shown).toContain(NAMES.north.staff);
    expect(shown).not.toContain(NAMES.main.staff);
  }, 120_000);
});
