// An announcement reaches every staff login's bell (testing 2026-11-05: "we
// announced the holiday ... the notification did not come in the software").
// A School Admin, Principal or Accountant added as a login, with no Staff
// record, is staff too: "All staff" notices reach their bell and their notice
// board, and a holiday added to the School Calendar goes to every staff bell.
// Students' own logins are not staff. The bell's sound is a per-person choice
// that the notification choices in My profile never wipe.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { boardFor, saveNotice, staffSideLogins, type NoticeInput } from "@/lib/communication/notices";
import { tellStaffInApp } from "@/lib/events/tell";
import { readNotePrefs, soundOn, SOUND_KEY, withSound } from "@/lib/notification-kinds";
import { arrived } from "@/components/shell/bell-watch";
import { makeCommSchool } from "./fixture";
import { makeUser } from "../helpers";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
let admin: { id: string };
let accountant: { id: string };
let studentLogin: { id: string };
let gone: { id: string };

const staffNotice = (title: string, extra: Partial<NoticeInput["audience"]> = {}): NoticeInput => ({
  title,
  body: `${title}. Please read.`,
  attachmentFileIds: [],
  audience: { parents: false, students: false, staff: true, roleKeys: [], classIds: [], sectionIds: [], campusIds: [], ...extra },
  priority: "NORMAL",
  channels: ["board", "app"],
  publishAt: null,
  expiresOn: null,
  askAck: false,
});
const bell = (login: string) => withSchool({ schoolId: s.school.id, userId: login }, (tx) => tx.notification.findMany({ where: { userLoginId: login }, select: { text: true, type: true } }));

beforeAll(async () => {
  s = await makeCommSchool();
  admin = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["school-admin"] }], name: "Saiveni Admin" });
  accountant = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["accountant"] }], name: "Aksha Accountant" });
  studentLogin = await makeUser({ schools: [{ id: s.school.id, roleKeys: [] }], name: "Ravi Kumar" });
  gone = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["class-teacher"] }], name: "Left Teacher" });
  await withSchool(s.ctx, async (tx) => {
    await tx.student.update({ where: { id: s.ravi.id }, data: { userLoginId: studentLogin.id } });
    // A teacher who left: the Staff record is archived (their access may still be there).
    await tx.staff.create({ data: { schoolId: s.school.id, campusId: s.school.campus.id, staffCode: `L${Date.now() % 100000}`, firstName: "Left", fullName: "Left Teacher", phone: "9000000001", designation: "TGT", joiningDate: new Date("2020-06-01"), userLoginId: gone.id, status: "RESIGNED", archivedAt: new Date() } });
  });
});

describe("staff in a notice's audience", () => {
  it("are every working login, with or without a Staff record, but not students or people who left", async () => {
    const ids = await withSchool(s.ctx, (tx) => staffSideLogins(tx, s.ctx, { roleKeys: [], campusIds: [] }));
    expect(ids).toEqual(expect.arrayContaining([s.principal.id, s.teacher.id, admin.id, accountant.id]));
    expect(ids).not.toContain(studentLogin.id);
    expect(ids).not.toContain(gone.id);
  });

  it("a role choice reaches that role's logins even without a Staff record", async () => {
    const ids = await withSchool(s.ctx, (tx) => staffSideLogins(tx, s.ctx, { roleKeys: ["accountant"], campusIds: [] }));
    expect(ids).toEqual([accountant.id]);
  });

  it("a campus notice reaches that campus's Staff records only (a login without one has no campus)", async () => {
    const ids = await withSchool(s.ctx, (tx) => staffSideLogins(tx, s.ctx, { roleKeys: [], campusIds: [s.school.campus.id] }));
    expect(ids).toContain(s.teacher.id);
    expect(ids).not.toContain(admin.id);
  });

  it("an All staff notice rings the School Admin's and Accountant's bell and is on their board; never the sender's own bell", async () => {
    const { notice } = await withSchool(s.ctx, (tx) => saveNotice(tx, s.ctx, staffNotice("Holiday on Friday"), { action: "publish", criticalConfirmed: false }));
    expect(notice.status).toBe("PUBLISHED");
    for (const who of [admin.id, accountant.id, s.teacher.id]) {
      expect((await bell(who)).map((n) => n.text)).toContain("New notice: Holiday on Friday");
      const board = await withSchool({ schoolId: s.school.id, userId: who }, (tx) => boardFor(tx, { schoolId: s.school.id, userId: who }, who, []));
      expect(board.map((n) => n.title)).toContain("Holiday on Friday");
    }
    expect((await bell(s.principal.id)).map((n) => n.text)).not.toContain("New notice: Holiday on Friday");
    expect((await bell(studentLogin.id)).map((n) => n.text)).not.toContain("New notice: Holiday on Friday");
    const studentBoard = await withSchool(s.ctx, (tx) => boardFor(tx, s.ctx, studentLogin.id, []));
    expect(studentBoard.map((n) => n.title)).not.toContain("Holiday on Friday");
  });
});

describe("a holiday on the School Calendar", () => {
  it("goes to every staff bell, not to the person who added it", async () => {
    const told = await withSchool(s.ctx, (tx) => tellStaffInApp(tx, s.ctx, { id: "x", title: "Diwali", campusId: null }, "Holiday: Diwali, 08-11-2026. The school is closed."));
    expect(told).toBeGreaterThanOrEqual(3);
    for (const who of [admin.id, accountant.id, s.teacher.id]) expect((await bell(who)).map((n) => n.text)).toContain("Holiday: Diwali, 08-11-2026. The school is closed.");
    expect((await bell(s.principal.id)).map((n) => n.text)).not.toContain("Holiday: Diwali, 08-11-2026. The school is closed.");
  });
});

describe("the bell's sound", () => {
  it("is on unless switched off, and switching it never changes the other choices", () => {
    expect(soundOn({})).toBe(true);
    expect(soundOn(null)).toBe(true);
    const prefs = { notices: ["app", "push"], tasks: ["app"] };
    const off = withSound(prefs, false);
    expect(soundOn(off)).toBe(false);
    expect(off[SOUND_KEY]).toBe(false);
    expect(readNotePrefs(off).notices).toEqual(["app", "push"]);
    const on = withSound(off, true);
    expect(soundOn(on)).toBe(true);
    expect(on).toEqual(prefs);
  });

  it("plays only for a notification that arrived, never for one read or a check with nothing new", () => {
    expect(arrived("", "1:a")).toBe(false);
    expect(arrived("1:a", "1:a")).toBe(false);
    expect(arrived("1:a", "2:b")).toBe(true);
    // Merged into the newest one (count went up, same id).
    expect(arrived("2:b", "3:b")).toBe(true);
    // Read or done: fewer waiting.
    expect(arrived("3:b", "1:a")).toBe(false);
    expect(arrived("1:a", "0:")).toBe(false);
  });
});
