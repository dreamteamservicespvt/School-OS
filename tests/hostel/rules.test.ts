// Hostel Management rules (15-hostel-management.md §5 "Rules and
// mistake-proofing" and §9 "Done when"), on a real database: one bed per
// student, only free beds, the hostel matched to gender, hostel fees added on
// allocation and stopped on check-out, roll call with students on passes
// already marked and night absences alerting at once, no "out" before
// approval, late-return alerts, outing passes as Gate Passes of kind Hostel
// Outing approved by another warden, visitors only for a named student and
// from the authorised list, mess expenses in Finance, the hostel reports, the
// TC and staff exit checks, the rooms import with Undo, and never deleting.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type Tx } from "@/lib/db";
import { canDecide, decide } from "@/lib/approvals";
import { importKind, previewImport, runImport, undoImport, autoMatch } from "@/lib/importer";
import { runClearanceChecks } from "@/lib/students/clearance";
import { setClearance, startExit } from "@/lib/staff/exit";
import { activeBedOf, allocate, bedHistory, checkOut, moveBed, residents } from "@/lib/hostel/allocation";
import { closeRoom, occupancy, roomGrid, setBedBlocked } from "@/lib/hostel/rooms";
import { alertLateReturns, markOut, markReturned, requestPass } from "@/lib/hostel/outings";
import { rollSheet, saveRollCall } from "@/lib/hostel/rollcall";
import { recordVisitor } from "@/lib/hostel/visitors";
import { recordIncident } from "@/lib/hostel/incidents";
import { recordMessExpense, saveHeadCount } from "@/lib/hostel/mess";
import { absencesReport, occupancyReport, outingsReport } from "@/lib/hostel/reports";
import { ROOMS_IMPORT } from "@/lib/hostel/import";
import { assertHostel } from "@/lib/hostel/scope";
import "@/lib/hostel/handlers";
import "@/lib/hostel/clearance";
import { makeSchool } from "../helpers";
import { TODAY, TZ, anyHostel, as, day, giveBed, hostelFor, ist, makeHostelSchool, plus, type HostelFixture } from "./fixture";

describe("Hostel Management rules", () => {
  let f: HostelFixture;
  beforeAll(async () => {
    f = await makeHostelSchool();
  });
  const W = () => as(f, f.warden.id);
  const run = <T,>(fn: (tx: Tx) => Promise<T>, ctx = W()) => withSchool(ctx, fn);
  const passOpts = (now: Date) => ({ now, tz: TZ, assertHostel: anyHostel });

  it("shows free and taken beds for each hostel, matching the residents list (Done when 1)", async () => {
    await giveBed(f, f.ravi, f.bed("B-1", 1).id);
    await giveBed(f, f.meena, f.bed("G-1", 1).id);
    const [occ, grid, living] = await run(async (tx) => [await occupancy(tx), await roomGrid(tx, [f.boys.id, f.girls.id]), await residents(tx, W(), { status: "ACTIVE" }, ist("2026-10-12", 10))] as const);
    const taken = grid.flatMap((r) => r.beds).filter((b) => b.state === "taken");
    expect(occ.total).toMatchObject({ beds: 6, taken: 2, free: 4, blocked: 0 });
    expect(taken).toHaveLength(living.length);
    expect(taken.map((b) => b.studentId).sort()).toEqual(living.map((r) => r.student.id).sort());
    expect(occ.rows.find((r) => r.hostel.id === f.boys.id)).toMatchObject({ beds: 4, taken: 1, free: 3 });
  });

  it("blocks a second bed for the same student, and offers Move instead (Done when 2)", async () => {
    await expect(giveBed(f, f.ravi, f.bed("B-1", 2).id)).rejects.toThrow("Ravi already has Bed 1, Room B-1");
    const e = await giveBed(f, f.ravi, f.bed("B-1", 2).id).catch((x: { link?: { label: string } }) => x);
    expect((e as { link?: { label: string } }).link?.label).toBe("Move instead");
  });

  it("never gives one bed to two students, nor a bed blocked for repair", async () => {
    await expect(giveBed(f, f.arjun, f.bed("B-1", 1).id)).rejects.toThrow(/was just given to someone else/);
    await run((tx) => setBedBlocked(tx, W(), f.bed("B-2", 2).id, true, "Broken plank"));
    await expect(giveBed(f, f.arjun, f.bed("B-2", 2).id)).rejects.toThrow(/is blocked for repair/);
    await run((tx) => setBedBlocked(tx, W(), f.bed("B-2", 2).id, false, "Fixed"));
  });

  it("matches the hostel to the student's gender", async () => {
    await expect(giveBed(f, f.sita, f.bed("B-1", 2).id)).rejects.toThrow("Boys' hostel. Choose the girls' hostel.");
    await expect(giveBed(f, f.arjun, f.bed("G-1", 2).id)).rejects.toThrow("Girls' hostel. Choose the boys' hostel.");
  });

  it("adds the hostel fees on allocation and stops them from the next installment on check-out, with fees due as a warning only (Done when 3)", async () => {
    const r = await giveBed(f, f.arjun, f.bed("B-1", 2).id);
    // From 12 Oct: Quarter 3 (due 10 Oct, so due on the day of the bed) and Quarter 4.
    expect(r.fees.rows).toBe(2);
    expect(r.fees.total).toBe(BigInt(4800000));
    const dues = await run((tx) => tx.studentFeeDue.findMany({ where: { studentId: f.arjun.id }, orderBy: { dueDate: "asc" } }));
    expect(dues.map((d) => [d.label, d.dueDate.toISOString().slice(0, 10), d.state])).toEqual([
      ["Hostel fee: Quarter 3", "2026-10-12", "OPEN"],
      ["Hostel fee: Quarter 4", "2027-01-10", "OPEN"],
    ]);
    // Check out on 1 Nov: Quarter 4 is removed from the fees; Quarter 3 stays due, and is only a warning.
    const out = await run((tx) => checkOut(tx, W(), { allocationId: r.allocation.id, date: day("2026-11-01"), reason: "Now a day scholar" }, { now: ist("2026-10-12", 9, 30), assertHostel: anyHostel }));
    expect(out.dueBefore).toBe(BigInt(2400000));
    expect(out.fees).toMatchObject({ stopped: BigInt(2400000), stoppedRows: 1 });
    const after = await run((tx) => tx.studentFeeDue.findMany({ where: { studentId: f.arjun.id }, orderBy: { dueDate: "asc" } }));
    expect(after.map((d) => d.state)).toEqual(["OPEN", "REMOVED"]);
    const charges = await run((tx) => tx.hostelFeeCharge.findMany({ where: { studentId: f.arjun.id }, orderBy: { createdAt: "asc" } }));
    expect(charges.map((c) => c.state).sort()).toEqual(["ADDED", "STOPPED"]);
    expect(await run((tx) => activeBedOf(tx, f.arjun.id))).toBeNull();
    // The bed is free again and the history is kept.
    const hist = await run((tx) => bedHistory(tx, f.arjun.id));
    expect(hist[0]).toMatchObject({ status: "CHECKED_OUT" });
  });

  it("moves a student to another bed with a reason, keeping the old bed in the history", async () => {
    const a = (await run((tx) => activeBedOf(tx, f.ravi.id)))!;
    await expect(run((tx) => moveBed(tx, W(), { allocationId: a.allocation.id, bedId: f.bed("B-2", 1).id, date: TODAY, reason: "" }, { now: ist("2026-10-12", 11), assertHostel: anyHostel }))).rejects.toThrow("Say why the student is moving.");
    const m = await run((tx) => moveBed(tx, W(), { allocationId: a.allocation.id, bedId: f.bed("B-2", 1).id, date: TODAY, reason: "Asthma: needs the AC room" }, { now: ist("2026-10-12", 11), assertHostel: anyHostel }));
    expect(m).toMatchObject({ from: "Room B-1, Bed 1", to: "Room B-2, Bed 1" });
    const rows = await run((tx) => tx.bedAllocation.findMany({ where: { studentId: f.ravi.id }, orderBy: { createdAt: "asc" } }));
    expect(rows.map((r) => r.status)).toEqual(["MOVED", "ACTIVE"]);
    expect(rows[0].movedToId).toBe(rows[1].id);
    // The same plan covers the new bed, so the fees are unchanged.
    expect(m.feeChange).toBeNull();
  });

  it("saves an outing pass as a Gate Pass of kind Hostel Outing, naming the person, waiting for another warden's approval (Done when 8)", async () => {
    const g = await run((tx) => tx.studentGuardian.findFirstOrThrow({ where: { studentId: f.ravi.id } }));
    const r = await run((tx) => requestPass(tx, W(), { studentId: f.ravi.id, outingType: "OUTING", fromAt: ist("2026-10-12", 16), toAt: ist("2026-10-12", 19), guardianId: g.guardianId, withName: null, withRelation: null, withPhone: null, reason: "Dentist appointment" }, passOpts(ist("2026-10-12", 12))));
    const pass = await run((tx) => tx.gatePass.findUniqueOrThrow({ where: { id: r.pass.id } }));
    expect(pass).toMatchObject({ kind: "HOSTEL_OUTING", status: "WAITING", collectorName: "Father of Ravi", collectorRelation: "Father", outingType: "OUTING", hostelId: f.boys.id });
    const approval = await run((tx) => tx.approval.findUniqueOrThrow({ where: { id: pass.approvalId! } }));
    // Never the person who asked: the other warden of the hostel decides.
    expect(approval.currentApproverId).toBe(f.warden2.id);
    expect(await run((tx) => canDecide(tx, W(), approval))).toBe(false);
    // A typed person needs a name, a relation and a valid mobile number.
    await expect(run((tx) => requestPass(tx, W(), { studentId: f.ravi.id, outingType: "OUTING", fromAt: ist("2026-10-13", 10), toAt: ist("2026-10-13", 12), guardianId: null, withName: "Ravi Uncle", withRelation: "Uncle", withPhone: "12345", reason: "Lunch" }, passOpts(ist("2026-10-12", 12))))).rejects.toThrow();
    // An outing is back the same day.
    await expect(run((tx) => requestPass(tx, W(), { studentId: f.ravi.id, outingType: "OUTING", fromAt: ist("2026-10-14", 16), toAt: ist("2026-10-15", 10), guardianId: g.guardianId, withName: null, withRelation: null, withPhone: null, reason: "Wedding" }, passOpts(ist("2026-10-12", 12))))).rejects.toThrow("An outing is back the same day. Choose Leave for an overnight stay.");
  });

  it("cannot mark a student out before the pass is approved; a late return raises an alert (Done when 5)", async () => {
    const pass = await run((tx) => tx.gatePass.findFirstOrThrow({ where: { kind: "HOSTEL_OUTING", studentId: f.ravi.id, status: "WAITING" } }));
    await expect(run((tx) => markOut(tx, W(), pass.id, passOpts(ist("2026-10-12", 16, 5))))).rejects.toThrow("Outing waiting for approval");
    const W2 = as(f, f.warden2.id);
    await run((tx) => decide(tx, W2, pass.approvalId!, "approve", null), W2);
    expect((await run((tx) => tx.gatePass.findUniqueOrThrow({ where: { id: pass.id } }))).status).toBe("APPROVED");
    await run((tx) => markOut(tx, W(), pass.id, passOpts(ist("2026-10-12", 16, 5))));
    const gate = await run((tx) => tx.gateEntry.findFirst({ where: { gatePassId: pass.id, direction: "OUT" } }));
    expect(gate?.purpose).toContain(pass.passNo);
    // Due back at 7:00 PM; at 7:20 PM (after the 15-minute wait) the wardens and the Principal are told once (the timed job runs as the system).
    const job = as(f, null);
    expect(await run((tx) => alertLateReturns(tx, job, ist("2026-10-12", 19, 10), TZ), job)).toBe(0);
    expect(await run((tx) => alertLateReturns(tx, job, ist("2026-10-12", 19, 20), TZ), job)).toBe(1);
    expect(await run((tx) => alertLateReturns(tx, job, ist("2026-10-12", 19, 35), TZ), job)).toBe(0);
    const note = await run((tx) => tx.notification.findFirst({ where: { userLoginId: f.warden.id, groupKey: `hostel-late-${pass.id}` } }));
    expect(note?.text).toContain("Ravi not returned (due 7:00 PM)");
    const principal = await withSchool(as(f, f.principal.id), (tx) => tx.notification.count({ where: { userLoginId: f.principal.id, groupKey: `hostel-late-${pass.id}` } }));
    expect(principal).toBe(1);
  });

  it("opens night roll call with students on passes already marked, and an unexplained absence alerts the warden at once (Done when 4)", async () => {
    // Rahul gets a bed too; Meena is in the girls' hostel.
    await giveBed(f, f.rahul, f.bed("B-1", 1).id);
    const at = ist("2026-10-12", 21, 35);
    const sheet = await run((tx) => rollSheet(tx, W(), f.boys.id, TODAY, "NIGHT", TZ, at));
    const mark = (id: string) => sheet.rows.find((r) => r.student.id === id)?.mark;
    expect(mark(f.ravi.id)).toBe("OUTING");
    expect(mark(f.rahul.id)).toBe("PRESENT");
    expect(sheet.rows.some((r) => r.student.id === f.meena.id)).toBe(false);
    const saved = await run((tx) => saveRollCall(tx, W(), { hostelId: f.boys.id, date: TODAY, session: "NIGHT", absentIds: [f.rahul.id] }, { now: at, tz: TZ, today: TODAY }));
    expect(saved).toMatchObject({ present: 0, absent: 1, away: 1 });
    expect(saved.alerted).toBeGreaterThan(0);
    // The other warden and the Principal are told (the warden who took it knows).
    const W2 = as(f, f.warden2.id);
    const note = await run((tx) => tx.notification.findFirst({ where: { userLoginId: f.warden2.id, groupKey: `hostel-night-${saved.rollCall.id}` } }), W2);
    expect(await withSchool(as(f, f.principal.id), (tx) => tx.notification.count({ where: { userLoginId: f.principal.id, groupKey: `hostel-night-${saved.rollCall.id}` } }))).toBe(1);
    expect(note?.text).toContain("1 student absent at night roll call");
    expect(note?.text).toContain("Rahul Reddy");
    // Saving again without new absentees does not alert twice.
    const again = await run((tx) => saveRollCall(tx, W(), { hostelId: f.boys.id, date: TODAY, session: "NIGHT", absentIds: [f.rahul.id] }, { now: plus(at, 0), tz: TZ, today: TODAY }));
    expect(again.alerted).toBe(0);
    // Not for a day ahead, nor older than 7 days.
    await expect(run((tx) => saveRollCall(tx, W(), { hostelId: f.boys.id, date: plus(TODAY, 1), session: "MORNING", absentIds: [] }, { now: at, tz: TZ, today: TODAY }))).rejects.toThrow(/not come yet/);
    await expect(run((tx) => saveRollCall(tx, W(), { hostelId: f.boys.id, date: plus(TODAY, -8), session: "MORNING", absentIds: [] }, { now: at, tz: TZ, today: TODAY }))).rejects.toThrow(/older than 7 days/);
  });

  it("marks the student back, noting a late return", async () => {
    const pass = await run((tx) => tx.gatePass.findFirstOrThrow({ where: { kind: "HOSTEL_OUTING", studentId: f.ravi.id, status: "OUT" } }));
    const r = await run((tx) => markReturned(tx, W(), pass.id, passOpts(ist("2026-10-12", 21, 45))));
    expect(r.late).toBe(165);
    await expect(run((tx) => markReturned(tx, W(), pass.id, passOpts(ist("2026-10-12", 21, 50))))).rejects.toThrow("Already marked returned.");
  });

  it("cannot save a hostel visitor without the student met, and asks for the warden's approval when not on the authorised list (Done when 9)", async () => {
    const sunday = ist("2026-10-11", 11);
    await expect(run((tx) => recordVisitor(tx, W(), { studentId: "", guardianId: null, name: "Prakash Rao", relation: "Uncle", phone: "9848077881", wardenApproved: true, note: null }, passOpts(sunday)))).rejects.toThrow("Choose the student the visitor has come to meet.");
    await expect(run((tx) => recordVisitor(tx, W(), { studentId: f.ravi.id, guardianId: null, name: "Prakash Rao", relation: "Uncle", phone: "9848077881", wardenApproved: false, note: null }, passOpts(sunday)))).rejects.toThrow("Not on Ravi's authorised list. The warden must approve this visit.");
    const ok = await run((tx) => recordVisitor(tx, W(), { studentId: f.ravi.id, guardianId: null, name: "Prakash Rao", relation: "Uncle", phone: "9848077881", wardenApproved: true, note: null }, passOpts(sunday)));
    expect(ok.visitor).toMatchObject({ meetStudentId: f.ravi.id, hostelId: f.boys.id, allowedBy: "WARDEN", approvedById: f.warden.id });
    const g = await run((tx) => tx.studentGuardian.findFirstOrThrow({ where: { studentId: f.ravi.id } }));
    const father = await run((tx) => recordVisitor(tx, W(), { studentId: f.ravi.id, guardianId: g.guardianId, name: null, relation: null, phone: null, wardenApproved: false, note: null }, passOpts(sunday)));
    expect(father.visitor.allowedBy).toBe("LIST");
    // Outside visiting hours (Monday) even the father needs the warden.
    await expect(run((tx) => recordVisitor(tx, W(), { studentId: f.ravi.id, guardianId: g.guardianId, name: null, relation: null, phone: null, wardenApproved: false, note: null }, passOpts(ist("2026-10-12", 11))))).rejects.toThrow(/Outside visiting hours/);
  });

  it("puts a mess expense in Finance, Expenses (Done when 6)", async () => {
    const r = await run((tx) => recordMessExpense(tx, W(), { date: TODAY, item: "Vegetables", amountPaise: BigInt(150000), vendorId: null, billFileId: null, paid: false, note: null }, { today: TODAY }));
    const expense = await run((tx) => tx.expense.findUniqueOrThrow({ where: { id: r.expense.id } }));
    const head = await run((tx) => tx.accountHead.findUniqueOrThrow({ where: { id: expense.accountHeadId } }));
    expect(head.name).toBe("Hostel mess");
    expect(expense.amountPaise).toBe(BigInt(150000));
    expect(r.row.expenseId).toBe(expense.id);
    await expect(run((tx) => recordMessExpense(tx, W(), { date: plus(TODAY, 1), item: "Milk", amountPaise: BigInt(1000), vendorId: null, billFileId: null, paid: false, note: null }, { today: TODAY }))).rejects.toThrow("The date cannot be in the future.");
  });

  it("expects at a meal the students living in the hostel who are not out on a pass", async () => {
    const row = await run((tx) => saveHeadCount(tx, W(), { date: TODAY, meal: "Dinner", actual: 2, note: null }, { now: ist("2026-10-12", 20, 30), tz: TZ, today: TODAY }));
    // Ravi (out on his pass at 8 PM) is not expected; Rahul and Meena are.
    expect(row.expected).toBe(2);
    await expect(run((tx) => saveHeadCount(tx, W(), { date: TODAY, meal: "Midnight snack", actual: 2, note: null }, { now: ist("2026-10-12", 20, 30), tz: TZ, today: TODAY }))).rejects.toThrow("Choose one of the meals in Hostel Settings.");
  });

  it("shows occupancy, roll call absences and outings for a month in the hostel reports (Done when 7)", async () => {
    const filter = { from: day("2026-10-01"), to: day("2026-10-31"), today: TODAY, hostelIds: null, tz: TZ, now: ist("2026-10-13", 10) };
    const [occ, abs, outs] = await run(async (tx) => [await occupancyReport(tx, W(), filter), await absencesReport(tx, W(), filter), await outingsReport(tx, W(), filter)] as const);
    expect(occ.totals).toMatchObject({ beds: 6, taken: 3 });
    expect(abs.rows).toHaveLength(1);
    expect(abs.rows[0]).toMatchObject({ student: "Rahul Reddy", session: "Night" });
    expect(outs.rows).toHaveLength(1);
    expect(outs.rows[0]).toMatchObject({ student: "Ravi Reddy", late: expect.stringMatching(/2 h 45 min/) });
    // A warden's reports hold their own hostel only.
    const girlsOnly = await run((tx) => occupancyReport(tx, W(), { ...filter, hostelIds: [f.girls.id] }));
    expect(girlsOnly.totals).toMatchObject({ beds: 2, taken: 1 });
    const none = await run((tx) => absencesReport(tx, W(), { ...filter, from: day("2026-09-01"), to: day("2026-09-30") }));
    expect(none.rows).toHaveLength(0);
  });

  it("records an incident for students living in the hostel", async () => {
    await expect(run((tx) => recordIncident(tx, W(), { type: "DISCIPLINE", studentIds: [], hostelId: f.boys.id, place: null, description: "Noise after lights out", at: ist("2026-10-12", 22), actionTaken: null, informParent: false, behaviourTypeKey: null }, { ...passOpts(ist("2026-10-12", 22, 30)), mayAddBehaviour: false }))).rejects.toThrow("Choose the student or students.");
    await expect(run((tx) => recordIncident(tx, W(), { type: "DISCIPLINE", studentIds: [f.kiran.id], hostelId: f.boys.id, place: null, description: "Noise after lights out", at: ist("2026-10-12", 22), actionTaken: null, informParent: false, behaviourTypeKey: null }, { ...passOpts(ist("2026-10-12", 22, 30)), mayAddBehaviour: false }))).rejects.toThrow("Choose students who live in the hostel.");
    const r = await run((tx) => recordIncident(tx, W(), { type: "MEDICAL", studentIds: [f.rahul.id], hostelId: null, place: null, description: "Fever after dinner", at: ist("2026-10-12", 22), actionTaken: "Paracetamol given", informParent: false, behaviourTypeKey: null }, { ...passOpts(ist("2026-10-12", 22, 30)), mayAddBehaviour: false }));
    expect(r.incident).toMatchObject({ type: "MEDICAL", hostelId: f.boys.id, incidentNo: "HI-2026-0001" });
  });

  it("refuses work in a hostel that is not the warden's own", async () => {
    const { mine } = await hostelFor(f, f.gwarden.id);
    expect(mine).toEqual([f.girls.id]);
    expect(() => assertHostel(mine, f.boys.id)).toThrow("This is not your hostel.");
    const G = as(f, f.gwarden.id);
    await expect(withSchool(G, (tx) => allocate(tx, G, { studentId: f.kiran.id, bedId: f.bed("B-2", 2).id, startDate: TODAY, checkedIn: true, feePlanId: "none", note: null }, { now: ist("2026-10-12", 9), assertHostel: (h) => assertHostel(mine, h) }))).rejects.toThrow("This is not your hostel.");
    expect((await hostelFor(f, f.principal.id)).mine).toBeNull();
  });

  it("holds the TC while the student still has a bed, until the warden checks them out", async () => {
    const hostel = async () => (await run((tx) => runClearanceChecks(tx, W(), f.meena.id))).find((c) => c.name === "Hostel");
    expect(await hostel()).toMatchObject({ clear: false, detail: "Still has Room G-1, Bed 1 in Girls' Hostel" });
    const a = (await run((tx) => activeBedOf(tx, f.meena.id)))!;
    const G = as(f, f.gwarden.id);
    await withSchool(G, (tx) => checkOut(tx, G, { allocationId: a.allocation.id, date: TODAY, reason: "Leaving the school" }, { now: ist("2026-10-12", 23), assertHostel: anyHostel }));
    expect(await hostel()).toMatchObject({ clear: true });
    // With the module switched off the check does not run.
    await run((tx) => tx.schoolModule.update({ where: { schoolId_moduleKey: { schoolId: f.school.id, moduleKey: "hostel-management" } }, data: { isOn: false } }), as(f, null));
    expect(await hostel()).toBeUndefined();
    await run((tx) => tx.schoolModule.update({ where: { schoolId_moduleKey: { schoolId: f.school.id, moduleKey: "hostel-management" } }, data: { isOn: true } }), as(f, null));
  });

  it("holds a leaving warden's exit clearance until another warden is chosen", async () => {
    const A = as(f, f.admin.id);
    const exit = await withSchool(A, (tx) => startExit(tx, A, { staffId: f.warden2Staff.id, type: "RESIGNATION", receivedOn: TODAY, lastWorkingDay: day("2026-11-30"), reason: "Moving to Pune", letterFileId: null }));
    const check = await withSchool(A, (tx) => tx.clearanceCheck.findFirstOrThrow({ where: { exitCaseId: exit.id, key: "hostel" } }));
    expect(check.status).toBe("PENDING");
    await expect(withSchool(A, (tx) => setClearance(tx, A, check.id, "CLEARED", null))).rejects.toThrow("Still a warden of Boys' Hostel. Choose another warden in Hostel Settings first.");
    // A staff member who is not a warden has nothing to hand over.
    const other = await withSchool(A, (tx) => startExit(tx, A, { staffId: f.counsellorStaff, type: "RESIGNATION", receivedOn: TODAY, lastWorkingDay: day("2026-11-30"), reason: "Higher studies", letterFileId: null }));
    expect(await withSchool(A, (tx) => tx.clearanceCheck.findFirstOrThrow({ where: { exitCaseId: other.id, key: "hostel" } }))).toMatchObject({ status: "NOT_NEEDED", note: "Not a hostel warden" });
  });

  it("imports rooms from a spreadsheet, checking each row, and Undo closes them", async () => {
    const kind = importKind(ROOMS_IMPORT)!;
    expect(kind).toBeTruthy();
    const A = as(f, f.admin.id);
    const headers = ["Hostel", "Floor", "Room number", "Beds", "Room type"];
    const rows = [
      ["Boys' Hostel", "First", "B-11", "3", "Non-AC"],
      ["boys' hostel", "First", "b-12", "", ""],
      ["Staff Quarters", "Ground", "S-1", "2", ""],
      ["Boys' Hostel", "Ground", "B-1", "2", ""],
      ["Girls' Hostel", "Ground", "G-2", "20", ""],
    ];
    const preview = await withSchool(A, (tx) => previewImport(tx, A, kind, rows, autoMatch(kind.columns, headers)));
    expect(preview.good.map((g) => (g.value as { roomNo: string }).roomNo)).toEqual(["B-11", "B-12"]);
    expect(preview.bad.map((b) => b.problems[0])).toEqual([
      "There is no hostel called “Staff Quarters”. Add it in Hostel Settings first.",
      "Room B-1 is already in Boys' Hostel.",
      "Beds must be a whole number from 1 to 12.",
    ]);
    const batch = await withSchool(A, (tx) => runImport(tx, A, kind, "rooms.csv", preview));
    expect(batch.added).toBe(2);
    const b12 = await withSchool(A, (tx) => tx.hostelRoom.findFirstOrThrow({ where: { roomNo: "B-12" }, include: { beds: true } }));
    expect(b12.beds).toHaveLength(4);
    expect((await withSchool(A, (tx) => tx.hostel.findUniqueOrThrow({ where: { id: f.boys.id } }))).floors).toContain("First");
    await withSchool(A, (tx) => undoImport(tx, A, batch.id));
    expect((await withSchool(A, (tx) => tx.hostelRoom.findUniqueOrThrow({ where: { id: b12.id } }))).archivedAt).not.toBeNull();
  });

  it("closes rooms with a reason and never deletes hostel records", async () => {
    await expect(run((tx) => closeRoom(tx, W(), f.b1.id, "Repairs"))).rejects.toThrow();
    const room = await run((tx) => tx.hostelRoom.findUniqueOrThrow({ where: { id: f.b1.id } }));
    expect(room.archivedAt).toBeNull();
    await expect(run((tx) => tx.bedAllocation.deleteMany({}))).rejects.toThrow();
    await expect(run((tx) => tx.rollCall.deleteMany({}))).rejects.toThrow();
    await expect(run((tx) => tx.hostelBed.delete({ where: { id: f.bed("B-2", 2).id } }))).rejects.toThrow();
    await expect(run((tx) => tx.messExpense.deleteMany({}))).rejects.toThrow();
  });

  it("is switched off by default for a new school", async () => {
    const fresh = await makeSchool("Fresh Hostel School");
    const row = await withSchool({ schoolId: fresh.id, userId: null }, (tx) => tx.schoolModule.findFirst({ where: { moduleKey: "hostel-management" } }));
    expect(row?.isOn ?? false).toBe(false);
  });
});
