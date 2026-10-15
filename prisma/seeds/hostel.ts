// Hostel Management demo (15): switched on for Sunrise only (an optional
// module, off for every other school). A boys' hostel and a girls' hostel,
// each with two floors of 4-bed rooms (Non-AC and AC), their wardens (Sunita
// Patil, login "warden", runs the girls' hostel; Satish Reddy, login
// "boyswarden", the boys'), the rules and timings, and the Non-AC and AC fee
// plans (₹24,000 and ₹32,000 a quarter). Boarders from Classes 6 to 10
// checked in since the start of the year with their hostel fees in Fee
// Management (the first quarter paid by most), one who has not arrived yet,
// one moved to another room, one checked out, a bed blocked for repair and a
// student waiting for a bed. Roll calls for the last three weeks (one night
// absence), outing and leave passes in every state (one late, two waiting
// for the warden), hostel visitors, incidents, two weeks of menus, head
// counts and mess expenses in Finance. Made through the module's own
// functions, at the times they would have happened.
import { prisma, withSchool, type SchoolContext } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth/password";
import { decide } from "../../src/lib/approvals";
import { collectPayment } from "../../src/lib/fees/collect";
import { addHostel, hostelSettings, saveFeePlan, saveRules, setWardens, feePlans } from "../../src/lib/hostel/settings";
import { addRoom, setBedBlocked } from "../../src/lib/hostel/rooms";
import { allocate, checkOut, moveBed } from "../../src/lib/hostel/allocation";
import { markOut, markReturned, requestPass } from "../../src/lib/hostel/outings";
import { recordVisitor, visitorOut } from "../../src/lib/hostel/visitors";
import { recordIncident } from "../../src/lib/hostel/incidents";
import { saveRollCall } from "../../src/lib/hostel/rollcall";
import { saveHeadCount, saveMenuItem, recordMessExpense } from "../../src/lib/hostel/mess";
import { mondayOf } from "../../src/lib/hostel/words";
import { saveFile, DOCUMENT_TYPES } from "../../src/lib/files";
import type { SeedSchool } from "./types";

const TZ = "Asia/Kolkata";
const OFFSET = 330 * 60_000;
const DAY = 86_400_000;
const todayIso = (days = 0) => new Date(Date.now() + OFFSET + days * DAY).toISOString().slice(0, 10);
const dateOf = (days: number) => new Date(`${todayIso(days)}T00:00:00Z`);
/** hh:mm school time, `days` from today. */
const at = (days: number, hh: number, mm = 0) => {
  const t = new Date(Date.parse(`${todayIso(days)}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`) - OFFSET);
  return t;
};
const R = (rupees: number) => BigInt(rupees * 100);
const noScope = () => {};

const RULES = [
  "1. Morning roll call at 6:30 AM and night roll call at 9:30 PM. Be in your room for both.",
  "2. Lights out at 10:00 PM on school nights, 10:30 PM on Saturdays.",
  "3. Mobile phones are kept with the warden and given out from 7:00 to 8:00 PM.",
  "4. Going out only on an approved outing or leave pass, with the person named on it.",
  "5. Visitors on Sundays from 10:00 AM to 1:00 PM, only people on the authorised list.",
  "6. Keep your room and bed tidy; room inspection every Saturday.",
  "7. No outside food in rooms. Tell the warden at once if you feel unwell.",
].join("\n");

const MENU: Record<string, string[]> = {
  Breakfast: ["Idli, sambar, coconut chutney", "Poha, banana, milk", "Upma, peanut chutney, milk", "Aloo paratha, curd", "Pongal, vada, sambar", "Bread, omelette or paneer bhurji, milk", "Puri, aloo sabzi, tea"],
  Lunch: ["Rice, dal, beans poriyal, curd", "Chapati, rajma, rice, salad", "Rice, sambar, cabbage fry, buttermilk", "Veg pulao, raita, dal", "Rice, rasam, potato fry, curd", "Chapati, chole, jeera rice", "Veg biryani, raita, sweet"],
  Snacks: ["Sundal", "Biscuits, tea", "Banana, groundnuts", "Samosa, tea", "Fruit bowl", "Veg puff, milk", "Pakoda, tea"],
  Dinner: ["Chapati, mixed veg, dal, rice", "Rice, dal tadka, aloo gobi", "Chapati, paneer butter masala, rice", "Rice, sambar, egg curry or veg kurma", "Chapati, dal makhani, rice", "Lemon rice, curd rice, pickle", "Chapati, chicken curry or veg korma, rice"],
};
const KCAL: Record<string, [number, number]> = { Breakfast: [420, 14], Lunch: [650, 18], Snacks: [220, 5], Dinner: [620, 20] };

async function login(username: string, name: string, phone: string, password: string) {
  const found = await prisma.userLogin.findUnique({ where: { username } });
  if (found) return found.id;
  return (await prisma.userLogin.create({ data: { username, displayName: name, phone, status: "ACTIVE", passwordHash: await hashPassword(password), passwordChangedAt: new Date() } })).id;
}

/** A one-page PDF standing in for a shop bill. */
function billPdf(title: string, line: string) {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "-");
  const content = `BT /F1 18 Tf 60 760 Td (${esc(title)}) Tj ET\nBT /F1 12 Tf 60 730 Td (${esc(line)}) Tj ET\nBT /F1 10 Tf 60 700 Td (Demo bill for School OS. Not a real document.) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const ctxOf = (school: SeedSchool, userId: string | null): SchoolContext => ({ schoolId: school.schoolId, userId });

export async function seedHostel(school: SeedSchool) {
  if (!school.full) return;
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("Set DEMO_PASSWORD in .env first.");
  const principal = school.users.principal;
  const girlsWarden = school.users.warden;
  if (!principal || !girlsWarden) return;
  const P = ctxOf(school, principal);

  // 1. The module on for the demo school; the boys' warden's login.
  const boysWarden = await login("boyswarden", "Satish Reddy", "9876500041", password);
  school.users.boyswarden = boysWarden;
  const done = await withSchool(P, async (tx) => {
    await tx.schoolModule.upsert({ where: { schoolId_moduleKey: { schoolId: school.schoolId, moduleKey: "hostel-management" } }, create: { schoolId: school.schoolId, moduleKey: "hostel-management", isOn: true }, update: { isOn: true } });
    if (await tx.hostel.count()) return true;
    const role = await tx.role.findFirstOrThrow({ where: { key: "hostel-warden" } });
    if (!(await tx.schoolAccess.findFirst({ where: { userLoginId: boysWarden } }))) {
      await tx.schoolAccess.create({ data: { schoolId: school.schoolId, userLoginId: boysWarden, roles: { create: [{ roleId: role.id, schoolId: school.schoolId }] } } });
    }
    await tx.staff.updateMany({ where: { fullName: "Satish Reddy", userLoginId: null }, data: { userLoginId: boysWarden } });
    return false;
  });
  if (done) return;

  // 2. Settings, hostels, wardens, rooms and fee plans (as the Principal sets them up).
  const setup = await withSchool(P, async (tx) => {
    await hostelSettings(tx, P);
    await saveRules(tx, P, RULES);
    const boys = await addHostel(tx, P, { name: "Boys' Hostel", gender: "BOYS", floors: ["Ground", "First"], note: "Block A, behind the playground" });
    const girls = await addHostel(tx, P, { name: "Girls' Hostel", gender: "GIRLS", floors: ["Ground", "First"], note: "Block C, next to the library" });
    const staff = await tx.staff.findMany({ where: { fullName: { in: ["Satish Reddy", "Mohan Yadav", "Sunita Patil", "Latha Shetty"] } }, select: { id: true, fullName: true } });
    const sid = (n: string) => staff.find((s) => s.fullName === n)!.id;
    const start = dateOf(-120);
    await setWardens(tx, P, boys.id, [{ staffId: sid("Satish Reddy"), title: "Warden" }, { staffId: sid("Mohan Yadav"), title: "Assistant warden" }], start);
    await setWardens(tx, P, girls.id, [{ staffId: sid("Sunita Patil"), title: "Warden" }, { staffId: sid("Latha Shetty"), title: "Assistant warden" }], start);
    await tx.hostelWarden.updateMany({ data: { fromDate: start } });
    for (let i = 1; i <= 8; i++) await addRoom(tx, P, { hostelId: boys.id, floor: "Ground", roomNo: `B-${String(i).padStart(2, "0")}`, beds: 4, roomType: "Non-AC" });
    for (let i = 11; i <= 16; i++) await addRoom(tx, P, { hostelId: boys.id, floor: "First", roomNo: `B-${i}`, beds: 4, roomType: i <= 14 ? "Non-AC" : "AC" });
    for (let i = 1; i <= 6; i++) await addRoom(tx, P, { hostelId: girls.id, floor: "Ground", roomNo: `G-${String(i).padStart(2, "0")}`, beds: 4, roomType: "Non-AC" });
    for (let i = 11; i <= 14; i++) await addRoom(tx, P, { hostelId: girls.id, floor: "First", roomNo: `G-${i}`, beds: 4, roomType: i <= 12 ? "Non-AC" : "AC" });

    const year = await tx.academicYear.findUniqueOrThrow({ where: { id: school.yearId } });
    const quarters = (amount: number) => [0, 3, 6, 9].map((m, i) => {
      const d = new Date(Date.UTC(year.startDate.getUTCFullYear(), year.startDate.getUTCMonth() + m, 10));
      return { label: `Quarter ${i + 1}`, dueDate: d, amountPaise: R(amount) };
    });
    await saveFeePlan(tx, P, null, { academicYearId: school.yearId, name: "Hostel, Non-AC room", hostelId: null, roomType: "Non-AC", includesMess: true, note: "Room, mess and laundry", installments: quarters(24000) });
    await saveFeePlan(tx, P, null, { academicYearId: school.yearId, name: "Hostel, AC room", hostelId: null, roomType: "AC", includesMess: true, note: "Room, mess and laundry", installments: quarters(32000) });
    return { boys, girls, yearStart: year.startDate };
  }, { timeout: 120_000 });

  // 3. Boarders from Classes 6 to 10, by gender.
  const pool = await withSchool(P, async (tx) => {
    const classes = await tx.schoolClass.findMany({ where: { name: { in: ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10"] } }, select: { id: true } });
    const enr = await tx.enrolment.findMany({ where: { academicYearId: school.yearId, classId: { in: classes.map((c) => c.id) }, archivedAt: null }, select: { studentId: true }, orderBy: { studentId: "asc" } });
    const students = await tx.student.findMany({ where: { id: { in: enr.map((e) => e.studentId) }, status: "ACTIVE", archivedAt: null }, select: { id: true, gender: true, fullName: true }, orderBy: { admissionNo: "asc" } });
    return { boys: students.filter((s) => s.gender === "Male"), girls: students.filter((s) => s.gender === "Female") };
  });
  const boarders = { boys: pool.boys.filter((_, i) => i % 2 === 0).slice(0, 30), girls: pool.girls.filter((_, i) => i % 2 === 1).slice(0, 24) };
  // The day the hostel opened this year (or 100 days ago, if later).
  const opened = new Date(Math.max(setup.yearStart.getTime() + 9 * DAY, dateOf(-100).getTime()));
  const openedDays = Math.round((opened.getTime() - dateOf(0).getTime()) / DAY);

  const W = { boys: ctxOf(school, boysWarden), girls: ctxOf(school, girlsWarden) };
  const allocs: { studentId: string; name: string; hostel: "boys" | "girls"; allocationId: string }[] = [];
  for (const kind of ["boys", "girls"] as const) {
    const hostelId = kind === "boys" ? setup.boys.id : setup.girls.id;
    await withSchool(W[kind], async (tx) => {
      const plans = await feePlans(tx, school.yearId);
      const beds = await tx.hostelBed.findMany({ where: { hostelId }, include: { room: true }, orderBy: [{ room: { roomNo: "asc" } }, { bedNo: "asc" }] });
      const list = boarders[kind];
      // Leave a few beds free in every room so the grid shows free beds.
      const usable = beds.filter((b, i) => i % 4 !== 3 || i < 8);
      for (const [i, s] of list.entries()) {
        const bed = usable[i];
        if (!bed) break;
        const lateJoin = i === list.length - 1; // the newest boarder has not arrived yet
        const startDays = lateJoin ? 1 : openedDays + (i % 5 === 4 ? 21 : 0);
        const startDate = dateOf(startDays);
        const plan = plans.find((p) => p.roomType === bed.room.roomType) ?? null;
        const r = await allocate(tx, W[kind], { studentId: s.id, bedId: bed.id, startDate, checkedIn: !lateJoin, feePlanId: plan?.id ?? "none", note: null }, { now: lateJoin ? new Date() : at(startDays, 16, 30 + (i % 20)), assertHostel: noScope });
        allocs.push({ studentId: s.id, name: s.fullName, hostel: kind, allocationId: r.allocation.id });
      }
    }, { timeout: 180_000 });
  }

  // A move, a check-out and a bed blocked for repair.
  await withSchool(W.boys, async (tx) => {
    const b = allocs.filter((a) => a.hostel === "boys");
    const free = await tx.hostelBed.findFirst({ where: { hostelId: setup.boys.id, room: { roomNo: "B-15" }, bedNo: 4 } });
    if (b[3] && free) await moveBed(tx, W.boys, { allocationId: b[3].allocationId, bedId: free.id, date: dateOf(-30), reason: "Asthma: moved to an AC room on the doctor's advice" }, { now: at(-30, 17), assertHostel: noScope });
    if (b[7]) await checkOut(tx, W.boys, { allocationId: b[7].allocationId, date: dateOf(-12), reason: "Family moved to Kukatpally; now a day scholar" }, { now: at(-12, 11), assertHostel: noScope });
    const broken = await tx.hostelBed.findFirst({ where: { hostelId: setup.boys.id, room: { roomNo: "B-12" }, bedNo: 4 } });
    if (broken) await setBedBlocked(tx, W.boys, broken.id, true, "Broken bed plank; carpenter coming on Monday");
  }, { timeout: 60_000 });
  const leftHostel = allocs.filter((a) => a.hostel === "boys")[7];
  const living = allocs.filter((a) => a !== leftHostel);

  // 4. Hostel fees: most families paid the first quarter.
  const acc = school.users.accountant ?? principal;
  for (const [i, a] of living.entries()) {
    if (i % 6 === 5) continue;
    await withSchool(ctxOf(school, acc), async (tx) => {
      const charges = await tx.hostelFeeCharge.findMany({ where: { studentId: a.studentId, state: "ADDED" }, select: { dueId: true } });
      const dues = await tx.studentFeeDue.findMany({ where: { id: { in: charges.map((c) => c.dueId) }, state: "OPEN", balancePaise: { gt: 0 }, dueDate: { lte: dateOf(-60) } }, orderBy: { dueDate: "asc" }, take: 1 });
      if (!dues.length) return;
      await collectPayment(tx, ctxOf(school, acc), { roleKeys: ["accountant"] }, {
        studentId: a.studentId, dueIds: dues.map((d) => d.id), amountPaise: dues[0].balancePaise, mode: i % 3 ? "UPI" : "BANK_TRANSFER", reference: `${i % 3 ? "UPI" : "NEFT"}${700000 + i * 3571}`,
        chequeNo: null, chequeBank: null, chequeDate: null, paidAt: at(openedDays + 3 + (i % 9), 11), note: "Hostel fee", discountPaise: BigInt(0), discountReason: null, waiveDueIds: [], waiveReason: null, confirmDuplicate: true,
      });
    }, { timeout: 60_000 });
  }

  // 5. Outing and leave passes, in every state.
  const ofHostel = (k: "boys" | "girls") => living.filter((a) => a.hostel === k && a !== allocs.filter((x) => x.hostel === k).at(-1));
  type PassPlan = { k: "boys" | "girls"; who: number; type: "OUTING" | "LEAVE"; day: number; from: [number, number]; to: [number, number, number?]; reason: string; asker: "warden" | "principal"; end: "waiting" | "approved" | "rejected" | "returned" | "late-returned" | "out" | "late-out" | "cancelled" };
  const plans: PassPlan[] = [
    { k: "boys", who: 0, type: "OUTING", day: -20, from: [10, 0], to: [18, 0], reason: "Cousin's wedding reception", asker: "warden", end: "returned" },
    { k: "boys", who: 2, type: "LEAVE", day: -16, from: [16, 0], to: [18, 0, 2], reason: "Grandmother unwell; home for the weekend", asker: "warden", end: "returned" },
    { k: "girls", who: 1, type: "OUTING", day: -13, from: [11, 0], to: [17, 0], reason: "Dentist appointment at Apollo, Jubilee Hills", asker: "warden", end: "late-returned" },
    { k: "girls", who: 3, type: "LEAVE", day: -9, from: [15, 30], to: [18, 0, 2], reason: "Dussehra at home", asker: "warden", end: "returned" },
    { k: "boys", who: 5, type: "OUTING", day: -6, from: [10, 30], to: [17, 30], reason: "Family lunch for his father's birthday", asker: "warden", end: "returned" },
    { k: "girls", who: 4, type: "OUTING", day: -4, from: [10, 0], to: [13, 0], reason: "Shopping with mother", asker: "warden", end: "rejected" },
    { k: "boys", who: 6, type: "OUTING", day: -3, from: [10, 0], to: [18, 0], reason: "Father's office function", asker: "warden", end: "cancelled" },
    { k: "girls", who: 5, type: "LEAVE", day: -1, from: [17, 0], to: [18, 0, 3], reason: "Sister's engagement at home", asker: "warden", end: "out" },
    { k: "boys", who: 8, type: "OUTING", day: 0, from: [-5, 0], to: [-1, 0], reason: "Eye check-up at L V Prasad", asker: "warden", end: "late-out" },
    { k: "boys", who: 9, type: "OUTING", day: 1, from: [10, 0], to: [18, 0], reason: "Uncle visiting from Pune; lunch together", asker: "warden", end: "approved" },
    { k: "girls", who: 6, type: "OUTING", day: 1, from: [10, 0], to: [17, 0], reason: "Bharatanatyam practice for the annual day", asker: "warden", end: "waiting" },
    { k: "boys", who: 10, type: "LEAVE", day: 2, from: [16, 0], to: [18, 0, 2], reason: "Family function in Warangal", asker: "principal", end: "waiting" },
  ];
  for (const pl of plans) {
    const a = ofHostel(pl.k)[pl.who];
    if (!a) continue;
    // "late-out": went out five hours ago, due back an hour ago.
    const fromAt = pl.end === "late-out" ? new Date(Date.now() - 5 * 3_600_000) : at(pl.day, pl.from[0], pl.from[1]);
    const toAt = pl.end === "late-out" ? new Date(Date.now() - 3_600_000) : at(pl.day + (pl.to[2] ?? 0), pl.to[0], pl.to[1]);
    const local = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
    const type = pl.type === "OUTING" && local(fromAt) !== local(toAt) ? "LEAVE" : pl.type;
    const askedAt = new Date(Math.min(fromAt.getTime() - 20 * 3_600_000, Date.now() - 2 * 3_600_000));
    const asker = pl.asker === "principal" ? P : W[pl.k];
    await withSchool(asker, async (tx) => {
      const guardians = await tx.studentGuardian.findMany({ where: { studentId: a.studentId, archivedAt: null, restriction: null }, orderBy: [{ isPrimary: "desc" }] });
      const g = guardians[0];
      const r = await requestPass(tx, asker, {
        studentId: a.studentId, outingType: type, fromAt, toAt, guardianId: g?.guardianId ?? null,
        withName: g ? null : "Ravi Kumar", withRelation: g ? null : "Uncle", withPhone: g ? null : "9848012345", reason: pl.reason,
      }, { now: askedAt, tz: TZ, assertHostel: noScope });
      await tx.gatePass.update({ where: { id: r.pass.id }, data: { createdAt: askedAt } });
      if (pl.end === "waiting") return;
      const approval = await tx.approval.findUniqueOrThrow({ where: { id: r.pass.approvalId! } });
      const decider = approval.currentApproverId ?? principal;
      const D = ctxOf(school, decider);
      const decidedAt = new Date(askedAt.getTime() + 45 * 60_000);
      await decide(tx, D, approval.id, pl.end === "rejected" ? "reject" : "approve", pl.end === "rejected" ? "Unit test on Monday. Please take her out next Sunday." : null);
      await tx.gatePass.update({ where: { id: r.pass.id }, data: { decidedAt } });
      if (pl.end === "rejected" || pl.end === "approved") return;
      if (pl.end === "cancelled") {
        await tx.gatePass.update({ where: { id: r.pass.id }, data: { status: "CANCELLED", decisionNote: "Father could not come; function postponed" } });
        return;
      }
      await markOut(tx, W[pl.k], r.pass.id, { now: new Date(fromAt.getTime() + 10 * 60_000), tz: TZ, assertHostel: noScope });
      if (pl.end === "out" || pl.end === "late-out") return;
      const back = pl.end === "late-returned" ? new Date(toAt.getTime() + 50 * 60_000) : new Date(toAt.getTime() - 25 * 60_000);
      await markReturned(tx, W[pl.k], r.pass.id, { now: back, tz: TZ, assertHostel: noScope });
      if (pl.end === "late-returned") await tx.gatePass.update({ where: { id: r.pass.id }, data: { lateAlertedAt: new Date(toAt.getTime() + 15 * 60_000) } });
    }, { timeout: 60_000 });
  }

  // 6. Roll calls for the last three weeks (one boy missing at night once).
  const s = await withSchool(P, (tx) => hostelSettings(tx, P));
  for (const kind of ["boys", "girls"] as const) {
    const hostelId = kind === "boys" ? setup.boys.id : setup.girls.id;
    for (let d = -21; d <= 0; d++) {
      for (const session of ["MORNING", "NIGHT"] as const) {
        const minute = session === "MORNING" ? s.morningRollMinute + 5 : s.nightRollMinute + 8;
        const when = at(d, Math.floor(minute / 60), minute % 60);
        if (when.getTime() > Date.now()) continue;
        if (d === 0 && session === "MORNING" && kind === "girls") continue; // not taken yet today: the leaders see it
        await withSchool(W[kind], async (tx) => {
          const absent: string[] = [];
          if (kind === "boys" && d === -8 && session === "NIGHT") absent.push(ofHostel("boys")[11]?.studentId ?? "");
          if (kind === "girls" && d === -15 && session === "MORNING") absent.push(ofHostel("girls")[8]?.studentId ?? "");
          for (const ids of [absent.filter(Boolean), []]) {
            try {
              await saveRollCall(tx, W[kind], { hostelId, date: dateOf(d), session, absentIds: ids }, { now: when, tz: TZ, today: dateOf(d) });
              break;
            } catch {
              // That student was not living there yet (try with everyone present), or nobody was.
            }
          }
        }, { timeout: 60_000 });
      }
    }
  }

  // 7. Incidents.
  await withSchool(W.boys, async (tx) => {
    const b = ofHostel("boys");
    const inc = async (input: Parameters<typeof recordIncident>[2], days: number, hh: number) =>
      recordIncident(tx, W.boys, { ...input, at: at(days, hh, 15) }, { now: at(days, hh, 40), tz: TZ, assertHostel: noScope, mayAddBehaviour: false });
    if (b[11]) await inc({ type: "DISCIPLINE", studentIds: [b[11].studentId], hostelId: setup.boys.id, place: null, description: "Not in his room at night roll call; found in Room B-06 watching a film on a phone.", at: new Date(), actionTaken: "Phone taken; spoke to him and called his father.", informParent: true, behaviourTypeKey: null }, -8, 21);
    await inc({ type: "MAINTENANCE", studentIds: [], hostelId: setup.boys.id, place: "Room B-12, bed 4", description: "Bed plank broken; the bed is blocked until the carpenter fixes it.", at: new Date(), actionTaken: "Bed blocked; carpenter called.", informParent: false, behaviourTypeKey: null }, -5, 19);
    if (b[4]) await inc({ type: "MEDICAL", studentIds: [b[4].studentId], hostelId: setup.boys.id, place: null, description: "Fever of 101°F after dinner.", at: new Date(), actionTaken: "Paracetamol given by the school nurse; checked at midnight, fever down.", informParent: true, behaviourTypeKey: null }, -2, 21);
  }, { timeout: 60_000 });
  await withSchool(W.girls, async (tx) => {
    const g = ofHostel("girls");
    await recordIncident(tx, W.girls, { type: "MAINTENANCE", studentIds: [], hostelId: setup.girls.id, place: "First floor washroom", description: "Geyser not heating since the morning.", at: at(-3, 7, 10), actionTaken: "Electrician informed.", informParent: false, behaviourTypeKey: null }, { now: at(-3, 7, 30), tz: TZ, assertHostel: noScope, mayAddBehaviour: false });
    if (g[2] && g[7]) await recordIncident(tx, W.girls, { type: "DISCIPLINE", studentIds: [g[2].studentId, g[7].studentId], hostelId: setup.girls.id, place: null, description: "Talking loudly after lights out; disturbed the room next door.", at: at(-6, 22, 40), actionTaken: "Warned both students.", informParent: false, behaviourTypeKey: null }, { now: at(-6, 22, 55), tz: TZ, assertHostel: noScope, mayAddBehaviour: false });
  }, { timeout: 60_000 });

  // 8. Visitors (Sundays; one let in by the warden outside the authorised list).
  const sundays = [0, 1, 2].map((w) => { const d = dateOf(0); const back = (d.getUTCDay() + 7) % 7 || 7; return -back - 7 * w; });
  for (const [i, k] of (["girls", "boys", "girls", "boys"] as const).entries()) {
    const day = sundays[i % sundays.length];
    const a = ofHostel(k)[i + 2];
    if (!a) continue;
    await withSchool(W[k], async (tx) => {
      const g = await tx.studentGuardian.findFirst({ where: { studentId: a.studentId, archivedAt: null, canPickUp: true, restriction: null } });
      const inAt = at(day, 10 + i, 15);
      const r = await recordVisitor(tx, W[k], i === 3 || !g
        ? { studentId: a.studentId, guardianId: null, name: "Prakash Rao", relation: "Uncle", phone: "9848077881", wardenApproved: true, note: "Uncle from Vijayawada; father called the warden" }
        : { studentId: a.studentId, guardianId: g.guardianId, name: null, relation: null, phone: null, wardenApproved: false, note: i === 0 ? "Brought homemade snacks" : null },
      { now: inAt, tz: TZ, assertHostel: noScope });
      await visitorOut(tx, W[k], r.visitor.id, { now: new Date(inAt.getTime() + 75 * 60_000), tz: TZ, assertHostel: noScope });
    }, { timeout: 60_000 });
  }

  // 9. Mess: last week's and this week's menu, head counts and expenses.
  const mess = school.users.warden;
  const M = ctxOf(school, mess);
  await withSchool(M, async (tx) => {
    const thisWeek = mondayOf(dateOf(0));
    for (const week of [new Date(thisWeek.getTime() - 7 * DAY), thisWeek]) {
      for (let day = 0; day < 7; day++) {
        for (const meal of s.meals) {
          const list = MENU[meal];
          if (!list) continue;
          const [kcal, protein] = KCAL[meal] ?? [null, null];
          await saveMenuItem(tx, M, { weekStart: week, dayIndex: day, meal, dishes: list[day % list.length], kcal: kcal ? kcal + ((day * 17) % 60) : null, proteinG: protein ? protein + (day % 4) : null, note: meal === "Dinner" && day === 6 ? "Veg choice always served" : meal === "Breakfast" && day === 2 ? "Iron-rich: jaggery with milk" : null });
        }
      }
    }
    for (let d = -10; d <= 0; d++) {
      for (const [mi, meal] of s.meals.entries()) {
        const hour = [8, 13, 17, 20][mi] ?? 12;
        if (at(d, hour, 30).getTime() > Date.now()) continue;
        const row = await saveHeadCount(tx, M, { date: dateOf(d), meal, actual: 0, note: null }, { now: at(d, hour, 30), tz: TZ, today: dateOf(d) });
        const less = (d + mi) % 4 === 0 ? 2 : (d + mi) % 5 === 0 ? 1 : 0;
        await tx.mealHeadCount.update({ where: { id: row.id }, data: { actual: Math.max(0, row.expected - less), note: less === 2 ? "2 fasting" : less === 1 ? "1 in the sick room" : null } });
      }
    }
  }, { timeout: 180_000 });
  const W2 = ctxOf(school, school.users.warden);
  const items: [number, string, number, boolean, string | null][] = [
    [-27, "Rice and grains", 18600, false, "25 kg rice x 6, toor dal 20 kg"], [-24, "Vegetables", 3850, true, null], [-20, "Milk", 4200, true, "Vijaya dairy, 10 days"],
    [-17, "Gas cylinder", 3600, true, "2 commercial cylinders"], [-13, "Vegetables", 4120, true, null], [-10, "Milk", 4200, true, "Vijaya dairy, 10 days"],
    [-8, "Groceries", 6900, false, "Oil, spices, sugar"], [-6, "Eggs", 1680, true, "8 trays"], [-3, "Vegetables", 3975, true, null], [-1, "Fruits", 2240, true, "Bananas and apples"],
  ];
  for (const [d, item, amount, paid, note] of items) {
    await withSchool(W2, async (tx) => {
      // Finance asks for the bill above its limit: a scanned bill, as the warden would attach.
      const bill = await saveFile(tx, W2, { file: new File([new Uint8Array(billPdf(item, `Rs ${amount}, ${todayIso(d)}`))], `bill-${item.toLowerCase().replace(/\s+/g, "-")}.pdf`, { type: "application/pdf" }), purpose: "mess-bill", allowed: DOCUMENT_TYPES });
      await recordMessExpense(tx, W2, { date: dateOf(d), item, amountPaise: R(amount), vendorId: null, billFileId: bill.id, paid, note }, { today: dateOf(0) });
    }, { timeout: 60_000 });
  }

  // 10. A girl admitted this term who asked for the hostel at admission, waiting for a bed.
  await withSchool(P, async (tx) => {
    const app = await tx.application.findFirst({ where: { firstName: "Myra", studentId: { not: null } } });
    if (!app) return;
    await tx.application.update({ where: { id: app.id }, data: { preferences: { ...(app.preferences as Record<string, unknown>), hostelNeeded: true } } });
    await tx.student.updateMany({ where: { id: app.studentId!, applicationId: null }, data: { applicationId: app.id } });
  });
}
