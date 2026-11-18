// Visitors: the status chips count one set. Today's log also carries every pass from an older day
// that was never closed (it is still the desk's work today), under "Expired" and so under "All" too:
// All is always In the building + Out + Expired. Live test 17 Nov 2026 (Principal): the chips said
// "All 0 · In the building 0 · Out 0 · Expired 6" under "6 visitors not checked out".
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { checkOutVisitor, registerVisitor, visitorLogWhere, type RegisterInput } from "@/lib/front-office/visitors";
import { as, at, day, makeFrontOfficeSchool, TZ, type FoFixture } from "./fixture";

const TODAY = "2026-10-14";
const OLDER = "2026-10-12";
const visitor = (name: string, phone: string): RegisterInput => ({ phone, name, purpose: "Delivery", meetStaffId: null, note: null, peopleCount: 1, photo: null, idProofType: null, idProofNo: null, vehicleNo: null });

describe("Visitors: the status chips count the same set", () => {
  let f: FoFixture;
  const desk = () => as(f, f.frontdesk.id);
  // 4:30 PM: passes of the day ran out at 3:30 PM (no periods set, so the school day ends then).
  const now = at(TODAY, "16:30");

  beforeAll(async () => {
    f = await makeFrontOfficeSchool("Visitor Chips School");
    const come = (name: string, phone: string, when: Date) => withSchool(desk(), (tx) => registerVisitor(tx, desk(), visitor(name, phone), { timeZone: TZ, now: when }));
    // Two days ago: one never checked out (still open today), one checked out (finished, an old day's row).
    await come("Old Open", "9700010001", at(OLDER, "10:00"));
    const oldOut = await come("Old Closed", "9700010002", at(OLDER, "10:30"));
    await withSchool(desk(), (tx) => checkOutVisitor(tx, desk(), oldOut.visitor.id, { timeZone: TZ, now: at(OLDER, "11:00") }));
    // Today: one checked out, one whose pass ran out without a check-out, one who came after 3:30 PM and is still inside.
    const out = await come("Today Out", "9700010003", at(TODAY, "09:00"));
    await withSchool(desk(), (tx) => checkOutVisitor(tx, desk(), out.visitor.id, { timeZone: TZ, now: at(TODAY, "09:30") }));
    await come("Today Expired", "9700010004", at(TODAY, "10:00"));
    await come("Today Inside", "9700010005", at(TODAY, "16:00"));
  }, 120_000);

  const counts = async (date: string, today: boolean) => {
    const where = (status: string) => visitorLogWhere({ scope: {}, from: day(date), to: day(date), today, status, search: null, now });
    const [all, inside, out, expired] = await withSchool(desk(), (tx) => Promise.all(["all", "In", "Out", "Expired"].map((s) => tx.visitorEntry.count({ where: where(s) }))));
    const names = await withSchool(desk(), async (tx) => (await tx.visitorEntry.findMany({ where: where("all"), select: { name: true }, orderBy: { timeIn: "asc" } })).map((v) => v.name));
    return { all, inside, out, expired, names };
  };

  it("Today: All holds every row the other chips count, the older pass that was never closed too", async () => {
    const c = await counts(TODAY, true);
    expect({ inside: c.inside, out: c.out, expired: c.expired }).toEqual({ inside: 1, out: 1, expired: 2 });
    expect(c.all).toBe(c.inside + c.out + c.expired);
    expect(c.names).toEqual(["Old Open", "Today Out", "Today Expired", "Today Inside"]);
  });

  it("an older day shows only its own visitors, and its chips add up as well", async () => {
    const c = await counts(OLDER, false);
    expect({ all: c.all, inside: c.inside, out: c.out, expired: c.expired }).toEqual({ all: 2, inside: 0, out: 1, expired: 1 });
    expect(c.names).toEqual(["Old Open", "Old Closed"]);
  });

  it("the page and its export read every chip with the same rule (no chip has a set of its own)", () => {
    for (const file of ["src/app/(school)/front-office/visitors/page.tsx", "src/app/(school)/front-office/visitors/export/route.ts"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toMatch(/\btoday: isToday, status/);
      expect(src, file).not.toMatch(/withOpenExpired/);
    }
  });
});
