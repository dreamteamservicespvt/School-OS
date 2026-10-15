// Who may do what in Events & Calendar, checked on the server (05-roles.md
// and the approved design's role rules): the Principal, School Admin and Vice
// Principal run every page; teachers have the School Calendar and PTM with
// their own slots only; the Accountant has the School Calendar and "Event
// Payments" (events with a fee, read only); every other role with View has
// the School Calendar only. These call the real server actions and export
// routes as each role.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { evPageAllowed, type EvPageKey } from "@/lib/events/access";
import { pageMode } from "@/lib/duty";
import { createEvent } from "@/lib/events/events";
import { planPtm } from "@/lib/events/ptm";
import { TODAY, as, evFor, eventInput, makeEventsSchool, type EvFixture } from "./fixture";

const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", () => ({
  requireAction: async (module: string, action: string) => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    const current = { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId }, school: { ...view.school, timeZone: "Asia/Kolkata", name: "Events Roles School" } };
    // The real role check runs first, exactly as in src/lib/current.ts.
    const reach = requirePermission(view.permissions, module as never, action as never);
    return { current, reach };
  },
}));

const actions = await import("@/app/(school)/events-calendar/actions");
const eventsExport = await import("@/app/(school)/events-calendar/events/export/route");

const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
};

describe("Events & Calendar by role", () => {
  let f: EvFixture;
  let feeEventId = "";
  let ptmId = "";
  const asUser = (id: string) => { who.userId = id; who.schoolId = f.school.id; };

  beforeAll(async () => {
    f = await makeEventsSchool("Events Roles School");
    const p = as(f, f.principal.id);
    feeEventId = (await withSchool(p, (tx) => createEvent(tx, p, eventInput({ name: "Picnic", venue: null, feePaise: BigInt(50000), date: "2026-12-03" })))).id;
    await withSchool(p, (tx) => createEvent(tx, p, eventInput({ name: "Assembly", venue: null, registrationOn: false, date: "2026-12-04" })));
    ptmId = (await withSchool(p, (tx) => planPtm(tx, p, { date: "2026-12-05", classIds: [f.c1, f.c2], startMin: 570, endMin: 600, slotMinutes: 10, venue: null, subjectTeachers: false }, TODAY))).ptm.id;
  });

  it("gives each role its pages", async () => {
    const pages = async (id: string) => {
      const { v } = await evFor(f, id);
      return (["calendar", "events", "ptm", "gallery", "settings"] as EvPageKey[]).filter((k) => evPageAllowed(v, k));
    };
    expect(await pages(f.principal.id)).toEqual(["calendar", "events", "ptm", "gallery", "settings"]);
    expect(await pages(f.vp.id)).toEqual(["calendar", "events", "ptm", "gallery", "settings"]);
    expect(await pages(f.teacher.id)).toEqual(["calendar", "ptm"]);
    expect(await pages(f.meenaLogin.id)).toEqual(["calendar", "ptm"]);
    expect(await pages(f.accountant.id)).toEqual(["calendar", "events"]);
    expect(await pages(f.librarian.id)).toEqual(["calendar"]);
    expect(await pages(f.frontdesk.id)).toEqual(["calendar"]);
    expect((await evFor(f, f.accountant.id)).v.level).toBe("pay");
  });

  it("keeps the events team's pages full for the Principal and Vice Principal (duty.ts narrows only Daily Activities)", async () => {
    const principal = await accessIn(f.principal.id, f.school.id);
    const vp = await accessIn(f.vp.id, f.school.id);
    for (const page of ["calendar", "events", "ptm", "gallery", "settings"]) {
      expect(pageMode(principal!, "events-calendar", page)).toBe("full");
      expect(pageMode(vp!, "events-calendar", page)).toBe("full");
    }
    expect(pageMode(principal!, "events-calendar", "daily")).toBe("view");
  });

  it("refuses School Calendar changes to everyone but the events team", async () => {
    const add = form({ title: "Founders' day", type: "holiday", from: "2026-12-10", applies: "school" });
    for (const id of [f.librarian.id, f.accountant.id, f.teacher.id]) {
      asUser(id);
      const r = await actions.addEntryAction(null, add);
      expect(r?.ok).toBe(false);
    }
    asUser(f.vp.id);
    expect((await actions.addEntryAction(null, add))?.ok).toBe(true);
  });

  it("refuses creating events to the Accountant (Event Payments is read only) and to teachers", async () => {
    const make = form({ name: "Book fair", type: "Cultural", date: "2026-12-11", startTime: "10:00", audienceKind: "school", reminder: "none" });
    for (const id of [f.accountant.id, f.teacher.id, f.librarian.id]) {
      asUser(id);
      expect((await actions.saveEventAction(null, make))?.ok).toBe(false);
    }
    asUser(f.accountant.id);
    expect((await actions.registerAction(null, form({ eventId: feeEventId, studentIds: [f.aarav.id] })))?.ok).toBe(false);
    asUser(f.principal.id);
    expect((await actions.saveEventAction(null, make))?.ok).toBe(true);
  });

  it("lets teachers book only their own PTM slots, and never plan a PTM", async () => {
    asUser(f.teacher.id);
    expect((await actions.planPtmAction(null, form({ date: "2026-12-12", classIds: [f.c1], startTime: "09:30", endTime: "10:00", slotMinutes: "10" })))?.ok).toBe(false);
    const [mine, other] = await withSchool(as(f, f.principal.id), async (tx) => [
      await tx.ptmSlot.findFirstOrThrow({ where: { ptmId, staffId: f.ravi.id } }),
      await tx.ptmSlot.findFirstOrThrow({ where: { ptmId, staffId: f.meena.id } }),
    ]);
    const other1 = await actions.bookSlotAction(null, form({ slotId: other.id, studentId: f.kabir.id }));
    expect(other1?.ok).toBe(false);
    expect(other1?.message).toMatch(/another teacher's slot/);
    expect((await actions.bookSlotAction(null, form({ slotId: mine.id, studentId: f.aarav.id })))?.ok).toBe(true);
    asUser(f.librarian.id);
    expect((await actions.bookSlotAction(null, form({ slotId: mine.id, studentId: f.diya.id })))?.ok).toBe(false);
  });

  it("refuses the gallery and Events Settings to everyone but the events team", async () => {
    for (const id of [f.teacher.id, f.accountant.id, f.librarian.id]) {
      asUser(id);
      expect((await actions.saveAlbumAction(null, form({ name: "Trip", date: "2026-10-01" })))?.ok).toBe(false);
      expect((await actions.settingsAction(null, form({ galleryRule: "BLUR" })))?.ok).toBe(false);
    }
  });

  it("exports Event Payments for the Accountant (events with a fee only) and nothing for View roles", async () => {
    asUser(f.accountant.id);
    const res = await eventsExport.GET(new Request("http://localhost/events-calendar/events/export?format=csv&period=acyear"));
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("Picnic");
    expect(csv).not.toContain("Assembly");
    asUser(f.librarian.id);
    expect((await eventsExport.GET(new Request("http://localhost/events-calendar/events/export?format=csv"))).status).toBe(403);
  });
});
