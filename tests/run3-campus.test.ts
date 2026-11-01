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

describe("Event and album pages list only the person's own campus's students (run-3, low)", () => {
  // An event or album for every campus opens for a person kept to one campus,
  // but its student lists (registrations, fee by student, consent, the
  // Register and Tag sheets) are of their campus only.
  let wholeEvent = "";
  let consentEvent = "";
  let openEvent = "";
  const albumPage = async (id: string, sp: Record<string, string>, as = cur.northAdmin) => {
    who.current = as;
    const { default: Page } = await import("@/app/(school)/events-calendar/gallery/[id]/page");
    return textOf(await Page({ params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) } as never));
  };
  const photoIn = (number: string, eventId: string | null) => run(async (tx) => {
    const album = await tx.album.create({ data: { schoolId: school.id, number, name: `Album ${number}`, eventId, date: day(soon(10)) } });
    const media = await tx.mediaItem.create({ data: { schoolId: school.id, albumId: album.id, fileId: north.studentId } });
    return { albumId: album.id, mediaId: media.id };
  });
  beforeAll(async () => {
    wholeEvent = await makeEvent("Annual Day", null);
    await run((tx) => registerStudents(tx, ctx, wholeEvent, [main.studentId, north.studentId], soon(0)));
    consentEvent = await makeEvent("Zoo trip", null, { consentOn: true });
    openEvent = await makeEvent("Science Fair", null);
  }, 120_000);

  it("the registrations of an event for every campus are the person's campus's only", async () => {
    const shown = await eventPage(wholeEvent);
    expect(shown).toContain(north.studentId);
    expect(shown).not.toContain(main.studentId);
    const all = await eventPage(wholeEvent, {}, cur.admin);
    expect(all).toContain(north.studentId);
    expect(all).toContain(main.studentId);
  }, 120_000);

  it("the Consent tab lists and counts the person's campus's students only", async () => {
    const shown = await eventPage(consentEvent, { tab: "con" });
    expect(shown).toContain(NAMES.north.student);
    expect(shown).not.toContain(NAMES.main.student);
    expect(shown).toContain("1 students · 0 given · 1 waiting · 0 declined");
    expect(await eventPage(consentEvent, { tab: "con" }, cur.admin)).toContain("2 students · 0 given · 2 waiting · 0 declined");
  }, 120_000);

  it("the Register sheet of an event for every campus lists the person's campus's students only", async () => {
    const shown = await eventPage(openEvent, { do: "register" }, cur.admin);
    expect(shown).toContain(NAMES.main.student);
    expect(shown).toContain(NAMES.north.student);
    const mine = await eventPage(openEvent, { do: "register" });
    expect(mine).toContain(NAMES.north.student);
    expect(mine).not.toContain(NAMES.main.student);
  }, 120_000);

  it("the Tag sheet of an album with no event works in each campus's year, and the person's campus's only", async () => {
    // Both campuses' years cover the album's date: a year found by date alone is one campus's.
    const { albumId, mediaId } = await photoIn("AL-W-1", null);
    const all = await albumPage(albumId, { do: "tag", media: mediaId }, cur.admin);
    expect(all).toContain(NAMES.main.student);
    expect(all).toContain(NAMES.north.student);
    const mine = await albumPage(albumId, { do: "tag", media: mediaId });
    expect(mine).toContain(NAMES.north.student);
    expect(mine).not.toContain(NAMES.main.student);
  }, 120_000);

  it("the Tag sheet of an every-campus event's album lists the person's campus's registered students only", async () => {
    const { albumId, mediaId } = await photoIn("AL-W-2", wholeEvent);
    const mine = await albumPage(albumId, { do: "tag", media: mediaId });
    expect(mine).toContain(NAMES.north.student);
    expect(mine).not.toContain(NAMES.main.student);
  }, 120_000);
});

describe("Hostel, Library and Transport refuse another campus's student or staff member (run-3, low)", () => {
  // Hostels, books and routes are the whole school's; the person named on a
  // bed, a library card or a bus place is narrowed to the person's campus.
  let northStaff: { hostel: Current; library: Current; transport: Current };
  let bedId = "";
  let route: { id: string; stopId: string };
  const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const MODS = {
    hostel: () => import("@/app/(school)/hostel-management/actions"),
    library: () => import("@/app/(school)/library-management/actions"),
    transport: () => import("@/app/(school)/transport-management/actions"),
  };
  const call = async (mod: keyof typeof MODS, name: string, fields: Record<string, string | string[]>, as: Current) => {
    who.current = as;
    const actions = (await MODS[mod]()) as unknown as Record<string, (s: unknown, fd: FormData) => Promise<{ ok: boolean; message?: string }>>;
    return actions[name](null, form(fields));
  };
  beforeAll(async () => {
    const sid = school.id;
    await run(async (tx) => {
      await tx.role.updateMany({ where: { key: { in: ["hostel-warden", "librarian", "transport-in-charge"] } }, data: { isEnabled: true } });
      for (const moduleKey of ["hostel-management", "library-management", "transport-management"]) {
        await tx.schoolModule.upsert({ where: { schoolId_moduleKey: { schoolId: sid, moduleKey } }, create: { schoolId: sid, moduleKey, isOn: true }, update: { isOn: true } });
      }
    });
    const made: Record<string, string> = {};
    for (const [k, role] of [["hostel", "hostel-warden"], ["library", "librarian"], ["transport", "transport-in-charge"]] as const) {
      made[k] = (await makeUser({ schools: [{ id: sid, roleKeys: [role] }], name: `North ${k}` })).id;
    }
    const { addHostel, setWardens } = await import("@/lib/hostel/settings");
    const { addRoom } = await import("@/lib/hostel/rooms");
    const { addRoute, addStop } = await import("@/lib/transport/routes");
    ({ bedId, route } = await run(async (tx) => {
      await tx.schoolAccess.updateMany({ where: { schoolId: sid, userLoginId: { in: Object.values(made) } }, data: { scope: "CAMPUS", campusId: north.campusId } });
      const wardenStaff = await tx.staff.create({ data: { schoolId: sid, campusId: north.campusId, staffCode: "N-W1", firstName: "Nagesh", lastName: "Warden", fullName: "Nagesh Warden", phone: "9876500303", designation: "Hostel Warden", joiningDate: day("2020-06-01"), userLoginId: made.hostel } });
      const hostel = await addHostel(tx, ctx, { name: "School Hostel", gender: "BOYS", floors: ["Ground"], note: null });
      for (const id of [main.studentId, north.studentId]) await tx.student.update({ where: { id }, data: { gender: "Male" } });
      await addRoom(tx, ctx, { hostelId: hostel.id, floor: "Ground", roomNo: "H-1", beds: 2, roomType: "Non-AC" });
      await setWardens(tx, ctx, hostel.id, [{ staffId: wardenStaff.id, title: "Warden" }], day(today()));
      const bed = await tx.hostelBed.findFirstOrThrow({ where: { room: { hostelId: hostel.id } }, orderBy: { bedNo: "asc" } });
      const r = await addRoute(tx, ctx, { name: "Main Road", vehicleId: null, driverId: null, attendantId: null, feeTwoWayPaise: BigInt(150000), feeOneWayPaise: BigInt(100000), schoolArrivalMin: 500, eveningDepartMin: 930 });
      const stop = await addStop(tx, ctx, r.id, { name: "Clock Tower", before: null, pickupMin: 440, dropMin: null, lat: 17.46, lng: 78.45, feeTwoWayPaise: null, feeOneWayPaise: null });
      return { bedId: bed.id, route: { id: r.id, stopId: stop.id } };
    }));
    northStaff = { hostel: await currentFor(made.hostel), library: await currentFor(made.library), transport: await currentFor(made.transport) };
  }, 240_000);

  it("Hostel: refuses a bed for another campus's student, gives one to the warden's own campus's", async () => {
    const give = (studentId: string) => call("hostel", "allocateAction", { studentId, bedId, startDate: today(), feePlanId: "none" }, northStaff.hostel);
    const r = await give(main.studentId);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not found, or is on another campus/);
    expect(await run((tx) => tx.bedAllocation.count({ where: { studentId: main.studentId } }))).toBe(0);
    const ok = await give(north.studentId);
    expect(ok.message).toContain(NAMES.north.student);
    expect(await run((tx) => tx.bedAllocation.count({ where: { studentId: north.studentId } }))).toBe(1);
  }, 120_000);

  it("Library: refuses to block another campus's student or staff member, blocks the librarian's own campus's", async () => {
    const block = (member: string) => call("library", "blockAction", { member, blocked: "1", reason: "Lost two books" }, northStaff.library);
    for (const member of [`S:${main.studentId}`, `T:${main.staffId}`]) {
      const r = await block(member);
      expect(r.ok).toBe(false);
      expect(r.message).not.toMatch(/Madhavi|Mohan/);
    }
    expect(await run((tx) => tx.libraryMember.count({ where: { blockedAt: { not: null }, OR: [{ studentId: main.studentId }, { staffId: main.staffId }] } }))).toBe(0);
    expect((await block(`S:${north.studentId}`)).message).toContain(NAMES.north.student);
  }, 120_000);

  it("Library: the Members list shows the librarian's own campus's students and staff only", async () => {
    who.current = northStaff.library;
    const { default: Page } = await import("@/app/(school)/library-management/members/page");
    const students = textOf(await Page({ searchParams: Promise.resolve({}) } as never));
    expect(students).toContain(NAMES.north.student);
    expect(students).not.toContain(NAMES.main.student);
    const staff = textOf(await Page({ searchParams: Promise.resolve({ type: "staff" }) } as never));
    expect(staff).toContain(NAMES.north.staff);
    expect(staff).not.toContain(NAMES.main.staff);
  }, 120_000);

  it("Transport: refuses a bus place for, or a change to the place of, another campus's student", async () => {
    const { assignStudents } = await import("@/lib/transport/places");
    const place = (await run((tx) => assignStudents(tx, ctx, { studentIds: [main.studentId], routeId: route.id, stopId: route.stopId, type: "TWO_WAY", fromDate: day(today()), reason: null }, day(today())))).placed[0].assignmentId;
    const r = await call("transport", "assignAction", { studentIds: [north.studentId, main.studentId], routeId: route.id, stopId: route.stopId, type: "TWO_WAY", fromDate: today() }, northStaff.transport);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not found, or is on another campus/);
    expect(await run((tx) => tx.transportAssignment.count({ where: { studentId: north.studentId } }))).toBe(0);
    const stop = await call("transport", "stopPlaceAction", { assignmentIds: place, lastDate: today(), reason: "Moving house" }, northStaff.transport);
    expect(stop.message).toMatch(/not found, or is on another campus/);
    expect((await run((tx) => tx.transportAssignment.findUniqueOrThrow({ where: { id: place } }))).toDate).toBeNull();
    const ok = await call("transport", "assignAction", { studentIds: north.studentId, routeId: route.id, stopId: route.stopId, type: "TWO_WAY", fromDate: today() }, northStaff.transport);
    expect(ok.ok).toBe(true);
  }, 120_000);
});

describe("Merging parent records keeps to the viewer's campus (run-3 side note)", () => {
  // A parent can have children on two campuses. Merging moves every child of
  // the merged record and archives it, so a person kept to one campus would
  // change the other campus's children's parent records. They merge only
  // parents whose children are all on their campus.
  let northB = "";
  const parent = (name: string, phone: string, children: string[]) => run(async (tx) => {
    const g = await tx.guardian.create({ data: { schoolId: school.id, name, relationship: "Mother", phone } });
    for (const studentId of children) await tx.studentGuardian.create({ data: { schoolId: school.id, guardianId: g.id, studentId, relationship: "Mother" } });
    return g.id;
  });
  const merge = async (keepId: string, mergeId: string, as = cur.northAdmin) => {
    who.current = as;
    const { mergeAction } = await import("@/app/(school)/student-management/_actions/guardians");
    try {
      return await mergeAction(keepId, { ok: false } as never, form({ mergeId }));
    } catch (e) {
      return { ok: true, message: String((e as Error).message) };
    }
  };
  const archived = (id: string) => run(async (tx) => (await tx.guardian.findUniqueOrThrow({ where: { id } })).archivedAt);
  beforeAll(async () => {
    northB = await run(async (tx) => (await tx.student.create({ data: { schoolId: school.id, campusId: north.campusId, admissionNo: "N-B", firstName: "Nikhil", lastName: "Rao", fullName: "Nikhil Rao", status: "ACTIVE" } })).id);
  });

  it("refuses to merge a parent who also has a child on another campus, either way round", async () => {
    const keep = await parent("Kavya Devi", "9876500401", [north.studentId]);
    const shared = await parent("Kavya D", "9876500402", [northB, main.studentId]);
    for (const [k, m] of [[keep, shared], [shared, keep]]) {
      const r = await merge(k, m);
      expect(r?.ok).toBe(false);
      expect(r?.message).toMatch(/another campus/);
    }
    expect(await archived(shared)).toBeNull();
    expect(await archived(keep)).toBeNull();
    expect(await run((tx) => tx.studentGuardian.count({ where: { guardianId: shared, studentId: main.studentId, archivedAt: null } }))).toBe(1);
  }, 120_000);

  it("merges two parents whose children are all on the viewer's campus", async () => {
    const keep = await parent("Latha Devi", "9876500403", [north.studentId]);
    const other = await parent("Latha D", "9876500404", [northB]);
    expect((await merge(keep, other))?.message).toMatch(/REDIRECT/);
    expect(await archived(other)).not.toBeNull();
  }, 120_000);

  it("lets someone who works for the whole school merge a parent with children on two campuses", async () => {
    const keep = await parent("Meera Devi", "9876500405", [north.studentId]);
    const shared = await parent("Meera D", "9876500406", [northB, main.studentId]);
    expect((await merge(keep, shared, cur.admin))?.message).toMatch(/REDIRECT/);
    expect(await archived(shared)).not.toBeNull();
  }, 120_000);
});

// ---------- Run-3 follow-up: the leftovers batch B found ----------

const TZ = "Asia/Kolkata";
/** The school's clock (India) `plusMin` minutes from now: [date, "HH:MM"]. */
const istAt = (plusMin = 0) => { const s = new Date(Date.now() + (330 + plusMin) * 60_000).toISOString(); return [s.slice(0, 10), s.slice(11, 16)] as const; };
const todayIst = () => istAt()[0];
/** A page that hands its work to one server component (Roll Call -> IncidentsView): that component's tree. */
async function pageText(Page: (props: never) => unknown, sp: Record<string, string> = {}) {
  const el = (await Page({ searchParams: Promise.resolve(sp) } as never)) as { type?: unknown; props?: unknown } | null;
  const inner = el && typeof el.type === "function" ? await (el.type as (p: unknown) => unknown)(el.props) : el;
  return textOf(inner);
}
const switchOn = (moduleKey: string, roleKey: string) => run(async (tx) => {
  await tx.role.updateMany({ where: { key: roleKey }, data: { isEnabled: true } });
  await tx.schoolModule.upsert({ where: { schoolId_moduleKey: { schoolId: school.id, moduleKey } }, create: { schoolId: school.id, moduleKey, isOn: true }, update: { isOn: true } });
});

describe("Hostel incidents, outings and visitors keep to the person's campus (run-3 follow-up)", () => {
  // Hostels are the whole school's, so another campus's student can live in a
  // hostel that a warden kept to one campus works in (someone who works for
  // the whole school gave the bed). For that warden the student is not found:
  // in the incident, pass and visitor forms, in the work on a pass, a visit or
  // a bed, and in the lists and their exports.
  const B = { main: "Manohar Boarder", north: "Nikhil Boarder" };
  let warden: Current;
  let mainBoarder = "";
  let northBoarder = "";
  let mainPass = "";
  let mainVisit = "";
  let mainBed = "";
  const hostelAct = async (name: string, fields: Record<string, string | string[]>) => {
    who.current = warden;
    const actions = (await import("@/app/(school)/hostel-management/actions")) as unknown as Record<string, (s: unknown, fd: FormData) => Promise<{ ok: boolean; message?: string }>>;
    return actions[name](null, form(fields));
  };
  beforeAll(async () => {
    const sid = school.id;
    await switchOn("hostel-management", "hostel-warden");
    const user = (await makeUser({ schools: [{ id: sid, roleKeys: ["hostel-warden"] }], name: "North Warden" })).id;
    mainBoarder = (await addStudent(ctx, main.sectionId, { fullName: B.main, gender: "Male", applyFeePlan: false })).student.id;
    northBoarder = (await addStudent(ctx, north.sectionId, { fullName: B.north, gender: "Male", applyFeePlan: false })).student.id;
    const { addHostel, setWardens } = await import("@/lib/hostel/settings");
    const { addRoom } = await import("@/lib/hostel/rooms");
    const { allocate } = await import("@/lib/hostel/allocation");
    const { recordIncident } = await import("@/lib/hostel/incidents");
    const { recordVisitor } = await import("@/lib/hostel/visitors");
    ({ mainPass, mainVisit, mainBed } = await run(async (tx) => {
      await tx.schoolAccess.updateMany({ where: { schoolId: sid, userLoginId: user }, data: { scope: "CAMPUS", campusId: north.campusId } });
      const staff = await tx.staff.create({ data: { schoolId: sid, campusId: north.campusId, staffCode: "N-W2", firstName: "Nirmala", lastName: "Warden", fullName: "Nirmala Warden", phone: "9876500304", designation: "Hostel Warden", joiningDate: day("2020-06-01"), userLoginId: user } });
      const h = await addHostel(tx, ctx, { name: "Lake View Hostel", gender: "BOYS", floors: ["Ground"], note: null });
      await addRoom(tx, ctx, { hostelId: h.id, floor: "Ground", roomNo: "L-1", beds: 2, roomType: "Non-AC" });
      await setWardens(tx, ctx, h.id, [{ staffId: staff.id, title: "Warden" }], day(todayIst()));
      const beds = await tx.hostelBed.findMany({ where: { room: { hostelId: h.id } }, orderBy: { bedNo: "asc" } });
      const now = new Date();
      const open = { now, today: day(todayIst()), assertHostel: () => {} };
      const bed = await allocate(tx, ctx, { studentId: mainBoarder, bedId: beds[0].id, startDate: day(todayIst()), checkedIn: true, feePlanId: "none", note: null }, open);
      await allocate(tx, ctx, { studentId: northBoarder, bedId: beds[1].id, startDate: day(todayIst()), checkedIn: true, feePlanId: "none", note: null }, open);
      await recordIncident(tx, ctx, { type: "MEDICAL", studentIds: [mainBoarder], hostelId: null, place: null, description: "Fever at night", at: new Date(now.getTime() - 10 * 60_000), actionTaken: null, informParent: false, behaviourTypeKey: null }, { now, tz: TZ, assertHostel: () => {}, mayAddBehaviour: false });
      const visit = await recordVisitor(tx, ctx, { studentId: mainBoarder, guardianId: null, name: "Murali Uncle", relation: "Uncle", phone: "9876500412", wardenApproved: true, note: null }, { now, tz: TZ, assertHostel: () => {} });
      const pass = await tx.gatePass.create({ data: { schoolId: sid, passNo: "GP-FU-0001", kind: "HOSTEL_OUTING", studentId: mainBoarder, reason: "Dentist", timeOut: now, collectorName: "Murali Uncle", collectorRelation: "Uncle", collectorPhone: "9876500412", status: "APPROVED", outingType: "LEAVE", fromAt: now, toAt: new Date(now.getTime() + 86_400_000), hostelId: h.id } });
      return { mainPass: pass.id, mainVisit: visit.visitor.id, mainBed: bed.allocation.id };
    }));
    warden = await currentFor(user);
  }, 240_000);

  it("refuses an incident for another campus's student, records one for the warden's own campus's", async () => {
    const [date, time] = istAt(-5);
    const add = (studentId: string) => hostelAct("recordIncidentAction", { type: "MEDICAL", studentIds: studentId, date, time, description: "Hurt his knee at play" });
    const r = await add(mainBoarder);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not found, or is on another campus/);
    expect(await run((tx) => tx.hostelIncident.count({ where: { studentIds: { has: mainBoarder } } }))).toBe(1);
    expect((await add(northBoarder)).ok).toBe(true);
  }, 120_000);

  it("refuses an outing pass for another campus's student, makes one for the warden's own campus's", async () => {
    const [fromDate, fromTime] = istAt(30);
    const [toDate, toTime] = istAt(30 + 24 * 60);
    const ask = (studentId: string) => hostelAct("requestPassAction", { studentId, outingType: "LEAVE", fromDate, fromTime, toDate, toTime, guardianId: "other", withName: "Ramesh Uncle", withRelation: "Uncle", withPhone: "9876500413", reason: "Family function" });
    const r = await ask(mainBoarder);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not found, or is on another campus/);
    expect(await run((tx) => tx.gatePass.count({ where: { studentId: mainBoarder } }))).toBe(1);
    const ok = await ask(northBoarder);
    expect(ok.message).toContain(B.north);
  }, 120_000);

  it("refuses a visitor for another campus's student, signs one in for the warden's own campus's", async () => {
    const sign = (studentId: string) => hostelAct("recordVisitorAction", { studentId, guardianId: "other", name: "Suresh Visitor", relation: "Uncle", phone: "9876500414", wardenApproved: "1" });
    const r = await sign(mainBoarder);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not found, or is on another campus/);
    expect(await run((tx) => tx.visitorEntry.count({ where: { meetStudentId: mainBoarder } }))).toBe(1);
    expect((await sign(northBoarder)).ok).toBe(true);
  }, 120_000);

  it("another campus's student's pass and visit are not found: not marked out, cancelled or signed out", async () => {
    expect((await hostelAct("markOutAction", { passId: mainPass })).message).toBe("This pass was not found.");
    expect((await hostelAct("cancelPassAction", { passId: mainPass, reason: "Not going now" })).message).toBe("This pass was not found.");
    expect((await run((tx) => tx.gatePass.findUniqueOrThrow({ where: { id: mainPass } }))).status).toBe("APPROVED");
    expect((await hostelAct("visitorOutAction", { visitorId: mainVisit })).message).toBe("This visit was not found.");
    expect((await run((tx) => tx.visitorEntry.findUniqueOrThrow({ where: { id: mainVisit } }))).timeOut).toBeNull();
  }, 120_000);

  it("refuses to check out another campus's student, and shows no guardians of theirs", async () => {
    const r = await hostelAct("checkoutAction", { allocationId: mainBed, date: todayIst(), reason: "Going home" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not found, or is on another campus/);
    expect((await run((tx) => tx.bedAllocation.findUniqueOrThrow({ where: { id: mainBed } }))).status).toBe("ACTIVE");
    who.current = warden;
    const { guardiansAction } = await import("@/app/(school)/hostel-management/actions");
    expect(await guardiansAction(mainBoarder)).toEqual([]);
    expect((await guardiansAction(northBoarder)).length).toBeGreaterThan(0);
  }, 120_000);

  it("the incident log, outing passes and visitor log, and their exports, show the warden's own campus's students only", async () => {
    who.current = warden;
    const { default: RollCall } = await import("@/app/(school)/hostel-management/page");
    const { default: Outings } = await import("@/app/(school)/hostel-management/outings/page");
    // The lists name the students in their cells; what was written on each row tells them apart here.
    const incidents = await pageText(RollCall, { view: "incidents" });
    expect(incidents).toContain("Hurt his knee at play");
    expect(incidents).not.toContain("Fever at night");
    const passes = await pageText(Outings);
    expect(passes).toContain("Ramesh Uncle");
    expect(passes).not.toContain("GP-FU-0001");
    expect(passes).not.toContain("Murali Uncle");
    const visitors = await pageText(Outings, { view: "visitors" });
    expect(visitors).toContain("Suresh Visitor");
    expect(visitors).not.toContain("Murali Uncle");
    const csv = async (path: string, mod: () => Promise<{ GET: (req: Request) => Promise<Response> }>) => {
      const res = await (await mod()).GET(new Request(`http://school.test${path}`));
      expect(res.status).toBe(200);
      return res.text();
    };
    const incidentFile = await csv("/hostel-management/incidents/export?format=csv", () => import("@/app/(school)/hostel-management/incidents/export/route"));
    expect(incidentFile).toContain(B.north);
    expect(incidentFile).not.toContain(B.main);
    const passFile = await csv("/hostel-management/outings/export?format=csv", () => import("@/app/(school)/hostel-management/outings/export/route"));
    expect(passFile).toContain(B.north);
    expect(passFile).not.toContain(B.main);
    const visitFile = await csv("/hostel-management/outings/export?format=csv&view=visitors", () => import("@/app/(school)/hostel-management/outings/export/route"));
    expect(visitFile).toContain("Suresh Visitor");
    expect(visitFile).not.toContain("Murali Uncle");
  }, 240_000);
});
