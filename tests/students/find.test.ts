// The one student search (src/lib/students/find.ts, gap list P1.5): name in
// any order with initials, one letter wrong, admission number, roll number in
// a class, parent name and phone; ranked; inside the person's own reach and
// never another school's.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext } from "@/lib/db";
import { findStudents, studentIdsForFilter, studentIdsMatching, type FindStudentOptions } from "@/lib/students/find";
import { matchName, oneEditApart, parseQuery, rankCandidate, RANK, sectionLabel } from "@/lib/students/find-rules";
import { studentScope } from "@/lib/students/access";
import { studentSchool } from "./fixtures";

describe("search rules", () => {
  it("forgives one letter wrong, missing, extra or swapped, and nothing more", () => {
    expect(oneEditApart("ravi", "ravi")).toBe(true);
    expect(oneEditApart("rabi", "ravi")).toBe(true);
    expect(oneEditApart("rvi", "ravi")).toBe(true);
    expect(oneEditApart("raavi", "ravi")).toBe(true);
    expect(oneEditApart("rvai", "ravi")).toBe(true);
    expect(oneEditApart("rvia", "ravi")).toBe(false);
    expect(oneEditApart("ramu", "ravi")).toBe(false);
  });

  it("matches name words in any order, with initials, exact names first", () => {
    expect(matchName(["kiran", "rao"], "Kiran Rao")).toBe("exact");
    expect(matchName(["rao", "kiran"], "Kiran Rao")).toBe("exact");
    expect(matchName(["rao"], "Kiran Rao")).toBe("words");
    expect(matchName(["k", "rao"], "Kiran Rao")).toBe("prefix");
    expect(matchName(["kir"], "Kiran Rao")).toBe("prefix");
    expect(matchName(["kiarn"], "Kiran Rao")).toBe("close");
    expect(matchName(["srinv"], "Srinivas Rao")).toBe("close");
    // Short words must be typed right: three letters is too little to guess from.
    expect(matchName(["rso"], "Kiran Rao")).toBeNull();
    expect(matchName(["kiran", "das"], "Kiran Rao")).toBeNull();
  });

  it("reads a class, section and roll number the way people type them", () => {
    expect(parseQuery("5 A 12").roll).toEqual({ label: "5a", rollNo: 12 });
    expect(parseQuery("Class 5-A roll 12").roll).toEqual({ label: "5a", rollNo: 12 });
    expect(parseQuery("LKG B 3").roll).toEqual({ label: "lkgb", rollNo: 3 });
    expect(parseQuery("Ravi").roll).toBeNull();
    expect(sectionLabel("Class 5", "A")).toBe("5a");
    expect(sectionLabel("LKG", "B")).toBe("lkgb");
  });

  it("treats only phone-like searches as phones", () => {
    expect(parseQuery("98765 43210").digits).toBe("9876543210");
    expect(parseQuery("+91 98765 43210").digits).toBe("9876543210");
    expect(parseQuery("3210").digits).toBe("3210");
    expect(parseQuery("ADM 3210").digits).toBeNull();
    expect(parseQuery("321").digits).toBeNull();
  });

  it("ranks exact admission number, then exact name, then starts, then close spellings", () => {
    const c = (fullName: string, admissionNo: string) => ({ fullName, admissionNo, rollNo: null, rollLabel: null, parents: [] });
    const r = (q: string, x: ReturnType<typeof c>) => rankCandidate(parseQuery(q), x, { byParent: true })?.rank;
    expect(r("adm-12", c("Ravi", "ADM/12"))).toBe(RANK.admissionExact);
    expect(r("ravi kumar", c("Ravi Kumar", "1"))).toBe(RANK.nameExact);
    expect(r("ravi", c("Ravi Kumar", "1"))).toBe(RANK.nameWords);
    expect(r("rav", c("Ravi Kumar", "1"))).toBe(RANK.namePrefix);
    expect(r("ravu", c("Ravi Kumar", "1"))).toBe(RANK.nameClose);
    expect(r("xyz", c("Ravi Kumar", "1"))).toBeUndefined();
  });
});

let s: Awaited<ReturnType<typeof studentSchool>>;
let other: Awaited<ReturnType<typeof studentSchool>>;
const ids: Record<string, string> = {};

async function put(f: typeof s, key: string, d: { name: string; adm: string; section: string; roll: number; parent: string; relation?: string; phone: string; status?: "ACTIVE" | "TRANSFERRED"; archived?: boolean }) {
  await withSchool({ schoolId: f.school.id, userId: null }, async (tx) => {
    const sec = await tx.section.findUniqueOrThrow({ where: { id: d.section } });
    const st = await tx.student.create({
      data: { schoolId: f.school.id, campusId: f.school.campus.id, admissionNo: d.adm, firstName: d.name.split(" ")[0], lastName: d.name.split(" ").slice(1).join(" ") || null, fullName: d.name, status: d.status ?? "ACTIVE", archivedAt: d.archived ? new Date() : null },
    });
    await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: st.id, academicYearId: f.yearId, classId: sec.classId, sectionId: sec.id, rollNo: d.roll } });
    const g = await tx.guardian.create({ data: { schoolId: f.school.id, name: d.parent, relationship: d.relation ?? "Father", phone: d.phone } });
    await tx.studentGuardian.create({ data: { schoolId: f.school.id, studentId: st.id, guardianId: g.id, relationship: d.relation ?? "Father", isPrimary: true } });
    ids[key] = st.id;
  });
}

beforeAll(async () => {
  [s, other] = await Promise.all([studentSchool(), studentSchool()]);
  await put(s, "kiran", { name: "Kiran Rao", adm: "ADM/2026/0012", section: s.s5a, roll: 3, parent: "Srinivas Rao", phone: "9876543210" });
  await put(s, "priya", { name: "Priya Sharma", adm: "ADM/2026/0013", section: s.s5b, roll: 12, parent: "Lakshmi Sharma", relation: "Mother", phone: "9123456789" });
  await put(s, "ravi", { name: "Ravi Kumar", adm: "12", section: s.s6a, roll: 1, parent: "Mohan Kumar", phone: "9000011111" });
  await put(s, "left", { name: "Kiran Varma", adm: "ADM/2025/0007", section: s.s6a, roll: 2, parent: "Suresh Varma", phone: "9000022222", status: "TRANSFERRED" });
  await put(s, "archived", { name: "Kiran Reddy", adm: "ADM/2025/0008", section: s.s6a, roll: 4, parent: "Venkat Reddy", phone: "9000033333", archived: true });
  await put(other, "otherKiran", { name: "Kiran Rao", adm: "ADM/2026/0012", section: other.s5a, roll: 3, parent: "Srinivas Rao", phone: "9876543210" });
}, 120_000);

const all = (f = s): FindStudentOptions => ({ scope: {}, yearId: f.yearId });
const find = (q: string, opts: Partial<FindStudentOptions> = {}, f = s, ctx?: SchoolContext) =>
  withSchool(ctx ?? { schoolId: f.school.id, userId: f.admin.id }, (tx) => findStudents(tx, q, { ...all(f), ...opts }));
const idsOf = (hits: { id: string }[]) => hits.map((h) => h.id);

describe("findStudents", () => {
  it("finds a name typed with one letter wrong, swapped or missing", async () => {
    for (const q of ["Kiarn", "Kirn Rao", "Kirna Rao"]) {
      const hits = await find(q);
      expect(idsOf(hits)).toContain(ids.kiran);
      expect(hits.find((h) => h.id === ids.kiran)!.close).toBe(true);
    }
    expect(idsOf(await find("Sharmaa"))).toEqual([ids.priya]);
  });

  it("finds a name in any order and with initials, and shows this year's class and roll", async () => {
    for (const q of ["Rao Kiran", "K. Rao", "k rao"]) expect(idsOf(await find(q))).toEqual([ids.kiran]);
    const [hit] = await find("Kiran Rao");
    expect(hit).toMatchObject({ id: ids.kiran, classSection: "Class 5 A", rollNo: 3, by: "name", close: false, rank: RANK.nameExact });
  });

  it("finds by admission number: exact first, then the start, then any part, ignoring slashes", async () => {
    expect(idsOf(await find("ADM/2026/0012"))[0]).toBe(ids.kiran);
    expect(idsOf(await find("adm20260012"))[0]).toBe(ids.kiran);
    expect(idsOf(await find("ADM/2026/001"))).toEqual([ids.kiran, ids.priya]);
    const twelve = await find("12");
    expect(twelve[0]).toMatchObject({ id: ids.ravi, rank: RANK.admissionExact });
    expect(idsOf(twelve)).toContain(ids.kiran);
  });

  it("finds by roll number in a class", async () => {
    expect(await find("5 B 12")).toMatchObject([{ id: ids.priya, by: "roll" }]);
    expect(idsOf(await find("Class 5-A roll 3"))).toEqual([ids.kiran]);
  });

  it("finds by the end of a parent's phone or the whole number, only when parents may be searched", async () => {
    expect(await find("3210")).toMatchObject([{ id: ids.kiran, by: "phone", parent: "Srinivas Rao" }]);
    expect(await find("98765 43210")).toMatchObject([{ id: ids.kiran, rank: RANK.rollOrFullPhone }]);
    expect(await find("3210", { byParent: false })).toEqual([]);
  });

  it("finds by a parent's name, also with one letter wrong", async () => {
    expect(await find("Lakshmi")).toMatchObject([{ id: ids.priya, by: "parent", parent: "Lakshmi Sharma" }]);
    expect(await find("Srinvas")).toMatchObject([{ id: ids.kiran, by: "parent", close: true }]);
    expect(await find("Lakshmi", { byParent: false })).toEqual([]);
  });

  it("leaves out archived and left students unless asked", async () => {
    expect(idsOf(await find("Kiran"))).toEqual([ids.kiran]);
    expect(idsOf(await find("Kiran", { statuses: "any" })).sort()).toEqual([ids.kiran, ids.left].sort());
    expect(idsOf(await find("Kiran", { archived: "only" }))).toEqual([ids.archived]);
  });

  it("stays inside the person's reach: a class teacher finds only their own section", async () => {
    const who = await s.who(s.teacherUser.id);
    const ctx = { schoolId: s.school.id, userId: s.teacherUser.id };
    const scope = await withSchool(ctx, (tx) => studentScope(tx, who, s.yearId));
    expect(idsOf(await find("Kiran", { scope }, s, ctx))).toEqual([ids.kiran]);
    expect(await find("Sharma", { scope }, s, ctx)).toEqual([]);
    expect(await find("5 B 12", { scope }, s, ctx)).toEqual([]);
    // The screen's own filter narrows it further.
    expect(await find("Kiran", { where: { id: { not: ids.kiran } } })).toEqual([]);
  });

  it("never finds another school's student of the same name, number or parent phone", async () => {
    for (const q of ["Kiran Rao", "ADM/2026/0012", "9876543210", "Srinivas"]) {
      expect(idsOf(await find(q))).not.toContain(ids.otherKiran);
      expect(idsOf(await find(q, {}, other))).toEqual([ids.otherKiran]);
    }
  });

  it("list filters get every match, and close spellings only when nothing else matches", async () => {
    const list = (q: string) => withSchool(s.ctx, (tx) => studentIdsMatching(tx, q, all()));
    expect(await list("Kiran")).toEqual([ids.kiran]);
    expect(await list("Kiarn")).toEqual([ids.kiran]);
    expect(await list("")).toEqual([]);
    // Lists of other records (certificates, leaving, fines) also find left and archived students.
    const records = await withSchool(s.ctx, (tx) => studentIdsForFilter(tx, "Kiran"));
    expect(records.sort()).toEqual([ids.kiran, ids.left, ids.archived].sort());
  });

  it("finds by one letter: the start of a name or admission number", async () => {
    expect(idsOf(await find("k"))).toEqual([ids.kiran, ids.ravi]); // Kiran Rao, Ravi Kumar
    expect(idsOf(await find("p"))).toEqual([ids.priya]);
  });
});
