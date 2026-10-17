// A notice for one campus (11-communication.md, Notice Board; 04 Notice).
// With no class or section ticked it reaches only that campus's parents and
// students, everywhere: WhatsApp, Parent Link, the student profile's
// Communication tab, the notice board and the "Seen by" count. A notice with
// no campus is for the whole school, both campuses. The second campus's
// school year starts later, so a lookup of "the" current year alone would
// see only that campus.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Current } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { boardFor, saveNotice, type NoticeInput } from "@/lib/communication/notices";
import { noticeCounts } from "@/lib/communication/notice-list";
import "@/lib/communication/student-profile-tab";
import { profileTabsFor } from "@/lib/students/profile-tabs";
import { loadGuardianView } from "@/lib/parent-link/view";
import { loadSections } from "@/lib/parent-link/render";
import { resolveAudience, SYSTEM_SCOPE } from "@/lib/messaging/recipients";
import { makeCommSchool } from "./fixture";
import { makeUser } from "../helpers";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
let north: { campusId: string; yearId: string; classId: string; sectionId: string; fatherId: string; nehaId: string };
let logins: { neha: string; ravi: string };

const notice = (title: string, campusIds: string[]): NoticeInput => ({
  title,
  body: `${title}. Please read.`,
  attachmentFileIds: [],
  audience: { parents: true, students: true, staff: false, roleKeys: [], classIds: [], sectionIds: [], campusIds },
  priority: "NORMAL",
  channels: ["board", "parent-link", "whatsapp"],
  publishAt: null,
  expiresOn: null,
  askAck: false,
});
const publish = (n: NoticeInput) => withSchool(s.ctx, async (tx) => (await saveNotice(tx, s.ctx, n, { action: "publish", criticalConfirmed: false })).notice);
const recipients = (messageId: string) => withSchool(s.ctx, async (tx) => (await tx.messageRecipient.findMany({ where: { messageId }, select: { name: true } })).map((r) => r.name).sort());
const parentLinkNotices = (guardianId: string) => withSchool(s.ctx, async (tx) => {
  const view = await loadGuardianView(tx, s.ctx, { linkId: randomUUID(), guardianId, childId: null, token: "t", preview: false });
  const sections = await loadSections(tx, s.ctx, view!);
  return ((sections.find((x) => x.def.key === "notices")?.data ?? []) as { title: string }[]).map((n) => n.title);
});

/** The words in a server component's element tree (its children and element props). */
function textOf(n: unknown): string {
  if (n === null || n === undefined || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join(" ");
  if (typeof n === "object" && "props" in n) return Object.values((n as { props: Record<string, unknown> }).props).map((v) => (typeof v === "object" || typeof v === "string" ? textOf(v) : "")).join(" ");
  return "";
}

beforeAll(async () => {
  s = await makeCommSchool();
  north = await withSchool(s.ctx, async (tx) => {
    const schoolId = s.school.id;
    const campus = await tx.campus.create({ data: { schoolId, name: "North Campus" } });
    // Starts after the main campus's year: the newest active year of the school is North's.
    const year = await tx.academicYear.create({ data: { schoolId, campusId: campus.id, name: "2026-27 North", startDate: new Date("2026-06-01"), endDate: new Date("2027-04-30"), status: "ACTIVE" } });
    const cls = await tx.schoolClass.create({ data: { schoolId, campusId: campus.id, name: "Class 5", sortOrder: 5 } });
    const sec = await tx.section.create({ data: { schoolId, classId: cls.id, academicYearId: year.id, name: "A" } });
    const father = await tx.guardian.create({ data: { schoolId, name: "North Father", relationship: "Father", phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, language: "en" } });
    const neha = await tx.student.create({ data: { schoolId, campusId: campus.id, admissionNo: `N${randomUUID().slice(0, 6)}`, firstName: "Neha", fullName: "Neha Singh" } });
    await tx.enrolment.create({ data: { schoolId, studentId: neha.id, academicYearId: year.id, classId: cls.id, sectionId: sec.id } });
    await tx.studentGuardian.create({ data: { schoolId, studentId: neha.id, guardianId: father.id, relationship: "Father", isPrimary: true } });
    return { campusId: campus.id, yearId: year.id, classId: cls.id, sectionId: sec.id, fatherId: father.id, nehaId: neha.id };
  });
  const nehaLogin = await makeUser({ schools: [{ id: s.school.id, roleKeys: [] }], name: "Neha Singh" });
  const raviLogin = await makeUser({ schools: [{ id: s.school.id, roleKeys: [] }], name: "Ravi Kumar" });
  await withSchool(s.ctx, async (tx) => {
    await tx.student.update({ where: { id: north.nehaId }, data: { userLoginId: nehaLogin.id } });
    await tx.student.update({ where: { id: s.ravi.id }, data: { userLoginId: raviLogin.id } });
  });
  logins = { neha: nehaLogin.id, ravi: raviLogin.id };
});

describe("a notice for one campus", () => {
  let id = "";

  it("goes by WhatsApp only to that campus's parents, and counts only them", async () => {
    const n = await publish(notice("Main campus sports day", [s.school.campus.id]));
    id = n.id;
    expect(n.status).toBe("PUBLISHED");
    expect(n.audienceLabel).toMatch(/at /);
    // The main contact of each main-campus family (not the opted-out father), and nobody at North.
    expect(await recipients(n.messageId!)).toEqual(["Other Section Father", "Padma Reddy", "Srinivas Kumar"]);
    // Both parents of the main-campus children: Srinivas and Lakshmi, the opted-out father, Padma, and the 5 B father.
    expect(n.guardianCount).toBe(5);
    // Send Message with the same rule says where.
    const people = await withSchool(s.ctx, (tx) => resolveAudience(tx, s.ctx, { kinds: ["parents"], campusIds: [north.campusId], allGuardians: true }, SYSTEM_SCOPE));
    expect(people.map((p) => p.name)).toEqual(["North Father"]);
  });

  it("shows on Parent Link only for that campus's children, and a view from the other campus is not counted", async () => {
    expect(await parentLinkNotices(s.father.id)).toContain("Main campus sports day");
    expect(await parentLinkNotices(north.fatherId)).not.toContain("Main campus sports day");
    const views = await withSchool(s.ctx, (tx) => tx.noticeGuardianView.findMany({ where: { noticeId: id }, select: { guardianId: true } }));
    expect(views.map((v) => v.guardianId)).toEqual([s.father.id]);
    // A view saved before this was fixed, from a North parent, is left out of "Seen by".
    await withSchool(s.ctx, (tx) => tx.noticeGuardianView.create({ data: { schoolId: s.school.id, noticeId: id, guardianId: north.fatherId, via: "parent-link" } }));
    const counts = await withSchool(s.ctx, async (tx) => noticeCounts(tx, await tx.notice.findMany({ where: { id } })));
    expect(counts.get(id)!.seen).toBe(1);
  });

  it("is on the notice board of that campus's students only", async () => {
    const titles = (login: string) => withSchool(s.ctx, async (tx) => (await boardFor(tx, s.ctx, login, [])).map((n) => n.title));
    expect(await titles(logins.ravi)).toContain("Main campus sports day");
    expect(await titles(logins.neha)).not.toContain("Main campus sports day");
  });

  it("is on the student profile's Communication tab of that campus's students only", async () => {
    const access = await accessIn(s.principal.id, s.school.id);
    const current = { ...access!, ctx: s.ctx, user: { id: s.principal.id, displayName: "Principal Person" }, menu: [], schools: [], session: null } as unknown as Current;
    const tab = profileTabsFor(current).find((t) => t.key === "communication")!;
    const shown = async (studentId: string, academicYearId: string) => textOf(await tab.load({ current, studentId, academicYearId }));
    expect(await shown(s.ravi.id, s.year.id)).toContain("Main campus sports day");
    expect(await shown(north.nehaId, north.yearId)).not.toContain("Main campus sports day");
  });
});

describe("a notice with no campus", () => {
  it("still reaches the whole school: both campuses, by message, on Parent Link and on the board", async () => {
    const n = await publish(notice("School closed on Monday", []));
    expect(await recipients(n.messageId!)).toEqual(["North Father", "Other Section Father", "Padma Reddy", "Srinivas Kumar"]);
    expect(n.guardianCount).toBe(6);
    expect(await parentLinkNotices(north.fatherId)).toContain("School closed on Monday");
    expect(await parentLinkNotices(s.father.id)).toContain("School closed on Monday");
    const board = await withSchool(s.ctx, async (tx) => (await boardFor(tx, s.ctx, logins.neha, [])).map((x) => x.title));
    expect(board).toContain("School closed on Monday");
  });

  it("for a class of one campus reaches that class only", async () => {
    const n = await publish({ ...notice("North Class 5 picnic", []), audience: { ...notice("", []).audience, classIds: [north.classId] } });
    expect(await recipients(n.messageId!)).toEqual(["North Father"]);
    expect(await parentLinkNotices(north.fatherId)).toContain("North Class 5 picnic");
    expect(await parentLinkNotices(s.father.id)).not.toContain("North Class 5 picnic");
  });
});
