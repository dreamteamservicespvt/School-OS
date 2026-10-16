// Front Office demo: the desk's settings with the gate log and the postal
// register on for Sunrise; two more logins (gate: Gate Security, office:
// Office Staff) so each Front Office view can be tried; visitors in the
// building, out, and one pass from yesterday never checked out; the gate
// log; today's early pickups (one left, one waiting at the gate) with one
// guardian under a court order; calls, walk-in requests with their tasks,
// desk notes, today's appointments and the postal register. Times are set
// from the moment the demo is seeded.
import { prisma, withSchool, type SchoolContext, type Tx } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth/password";
import { formatNumber } from "../../src/lib/sequences";
import type { SeedSchool } from "./types";

const OFFSET = 330 * 60_000; // Asia/Kolkata
const HOUR = 3_600_000;
const todayIso = (days = 0) => new Date(Date.now() + OFFSET + days * 86_400_000).toISOString().slice(0, 10);
/** hh:mm school time, `days` from today. */
const at = (days: number, hh: number, mm = 0) => new Date(Date.parse(`${todayIso(days)}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`) - OFFSET);
const dateOf = (days: number) => new Date(`${todayIso(days)}T00:00:00Z`);
/** A time today, moved back to before now when the demo is seeded early in the morning. */
const before = (hh: number, mm: number, minutesAgo: number) => {
  const t = at(0, hh, mm);
  const latest = new Date(Date.now() - minutesAgo * 60_000);
  return t < latest ? t : latest;
};

async function login(username: string, name: string, phone: string, hash: string) {
  const found = await prisma.userLogin.findUnique({ where: { username } });
  if (found) return found.id;
  return (await prisma.userLogin.create({ data: { username, displayName: name, phone, status: "ACTIVE", passwordHash: hash, passwordChangedAt: new Date() } })).id;
}

async function take(tx: Tx, ctx: SchoolContext, key: string, n: number) {
  await tx.numberSequence.upsert({ where: { schoolId_key: { schoolId: ctx.schoolId, key } }, create: { schoolId: ctx.schoolId, key, nextValue: n + 1 }, update: { nextValue: n + 1 } });
}

export async function seedFrontOffice(school: SeedSchool) {
  const { schoolId } = school;
  const sys: SchoolContext = { schoolId, userId: null };
  const reception = school.users.reception ?? school.users.frontdesk ?? school.users.principal;
  if (!reception) return;

  if (school.full) {
    const password = process.env.DEMO_PASSWORD;
    if (!password) throw new Error("Set DEMO_PASSWORD in .env first.");
    const hash = await hashPassword(password);
    school.users.gate = await login("gate", "Bhaskar Rao", "9876500021", hash);
    school.users.office = await login("office", "Sarita Sharma", "9876500022", hash);
    await withSchool(sys, async (tx) => {
      await tx.role.updateMany({ where: { key: { in: ["gate-security", "office-staff"] } }, data: { isEnabled: true } });
      for (const [username, roleKey] of [["gate", "gate-security"], ["office", "office-staff"]] as const) {
        const userId = school.users[username];
        const role = await tx.role.findFirstOrThrow({ where: { key: roleKey } });
        if (!(await tx.schoolAccess.findFirst({ where: { userLoginId: userId } }))) {
          await tx.schoolAccess.create({ data: { schoolId, userLoginId: userId, roles: { create: [{ roleId: role.id, schoolId }] } } });
        }
      }
      await tx.staff.updateMany({ where: { fullName: "Sarita Sharma", userLoginId: null }, data: { userLoginId: school.users.office } });
    });
  }

  const ctx: SchoolContext = { schoolId, userId: reception };
  await withSchool(ctx, async (tx) => {
    if (await tx.visitorEntry.count()) return;
    await tx.frontOfficeSetting.upsert({ where: { schoolId }, create: { schoolId }, update: {} });
    if (school.full) {
      for (const key of ["front-office-gate-log", "front-office-postal"]) {
        await tx.schoolFeature.upsert({ where: { schoolId_featureKey: { schoolId, featureKey: key } }, create: { schoolId, featureKey: key, isOn: true }, update: { isOn: true } });
      }
    }
    const staff = await tx.staff.findMany({ where: { archivedAt: null }, select: { id: true, fullName: true, designation: true, userLoginId: true } });
    const sid = (name: string) => staff.find((s) => s.fullName === name)?.id ?? staff[0].id;
    const lid = (name: string) => staff.find((s) => s.fullName === name)?.userLoginId ?? null;
    const principal = staff.find((s) => /^principal$/i.test(s.designation))?.fullName ?? staff[0].fullName;
    const accountant = staff.find((s) => /accountant/i.test(s.designation))?.fullName ?? principal;
    const teacher = staff.find((s) => s.userLoginId === school.users.teacher)?.fullName ?? principal;
    const store = staff.find((s) => /store/i.test(s.designation))?.fullName ?? principal;
    const admin = staff.find((s) => s.userLoginId === school.users.admin)?.fullName ?? principal;
    // Passes made today expire at the end of the school day; a demo seeded after that gets later passes so the "in" visitors stay in.
    const endToday = at(0, 15, 30);
    const passEnd = endToday.getTime() > Date.now() + HOUR ? endToday : new Date(Date.now() + 3 * HOUR);

    type V = { name: string; phone: string; purpose: string; meet: string; note?: string; vehicle?: string; inAt: Date; outAt?: Date | null; reply?: string; people?: number; days?: number; expires?: Date };
    const visitors: V[] = school.full ? [
      { name: "Prakash Reddy", phone: "9848055120", purpose: "Meeting", meet: principal, note: "Sports quota admission for son", vehicle: "TS 08 EZ 4410", inAt: before(10, 22, 20), reply: "send-in" },
      { name: "Deepika Rao", phone: "9000177342", purpose: "Interview", meet: principal, note: "PGT Chemistry", inAt: before(10, 15, 25), reply: "wait" },
      { name: "Sravani Goud", phone: "9603041185", purpose: "Fee payment", meet: accountant, inAt: before(10, 5, 30), reply: "send-in" },
      { name: "Anil Kumar", phone: "9010055678", purpose: "Other", meet: store, note: "AquaPure RO service", vehicle: "TS 07 EP 2291", inAt: before(8, 50, 40), reply: "send-in", people: 2 },
      { name: "Mohd. Rafiq", phone: "9949023317", purpose: "Delivery", meet: store, note: "Sri Sai Stationers", vehicle: "TS 09 UD 7781", inAt: before(9, 31, 90), outAt: before(9, 48, 70) },
      { name: "Harish Chandra", phone: "9866510432", purpose: "Meeting", meet: teacher, note: "Parent", inAt: before(9, 10, 120), outAt: before(9, 42, 85), people: 2 },
      { name: "Swathi Varma", phone: "9704088213", purpose: "Admission enquiry", meet: admin, note: "Nursery next year", inAt: before(8, 45, 130), outAt: before(9, 20, 100), people: 2 },
      { name: "Ganesh Patil", phone: "9347061125", purpose: "Delivery", meet: admin, note: "Blue Dart", inAt: before(8, 35, 140), outAt: before(8, 41, 135) },
      { name: "Ramya Krishnan", phone: "9885370214", purpose: "Fee payment", meet: accountant, inAt: before(8, 20, 150), outAt: before(8, 38, 145) },
      { name: "Sanjay Verma", phone: "9440321980", purpose: "Meeting", meet: teacher, note: "Parent", inAt: at(-1, 14, 40), days: -1, expires: at(-1, 15, 30) },
      ...[2, 3, 4, 5, 6].flatMap((d) => [
        { name: "Venu Gopal", phone: "9866321450", purpose: "Meeting", meet: principal, inAt: at(-d, 11, 0), outAt: at(-d, 11, 25), days: -d, expires: at(-d, 15, 30) },
        { name: `Courier ${d}`, phone: `93470611${20 + d}`, purpose: "Delivery", meet: admin, inAt: at(-d, 9, 30), outAt: at(-d, 9, 40), days: -d, expires: at(-d, 15, 30) },
        { name: `Parent visit ${d}`, phone: `98853702${10 + d}`, purpose: d % 2 ? "Fee payment" : "Meeting", meet: d % 2 ? accountant : teacher, inAt: at(-d, 12, 10), outAt: at(-d, 12, 40), days: -d, expires: at(-d, 15, 30) },
      ]),
    ] : [
      { name: "Ramesh Babu", phone: "9849011122", purpose: "Fee payment", meet: accountant, inAt: before(10, 0, 30) },
      { name: "Kavya Sharma", phone: "9849011133", purpose: "Meeting", meet: principal, inAt: before(9, 15, 90), outAt: before(9, 40, 60) },
    ];
    let n = 230;
    for (const v of visitors) {
      n += 1;
      const passNo = formatNumber("V-", n, 4);
      const e = await tx.visitorEntry.create({
        data: {
          schoolId, passNo, visitDate: dateOf(v.days ?? 0), name: v.name, phone: v.phone, purpose: v.purpose, meetStaffId: sid(v.meet), note: v.note ?? null, peopleCount: v.people ?? 1,
          vehicleNo: v.vehicle ?? null, timeIn: v.inAt, timeOut: v.outAt ?? null, passExpiresAt: v.expires ?? passEnd, staffReply: v.reply ?? null, staffReplyAt: v.reply ? new Date(v.inAt.getTime() + 4 * 60_000) : null,
          createdById: reception, checkedOutById: v.outAt ? reception : null,
        },
      });
      if (v.vehicle && school.full) {
        await tx.gateEntry.create({ data: { schoolId, at: v.inAt, direction: "IN", kind: "vehicle", who: `${v.name} (visitor ${passNo})`, vehicleNo: v.vehicle, purpose: v.purpose, visitorEntryId: e.id, recordedById: school.users.gate ?? reception } });
        if (v.outAt) await tx.gateEntry.create({ data: { schoolId, at: v.outAt, direction: "OUT", kind: "vehicle", who: `${v.name} (visitor ${passNo})`, vehicleNo: v.vehicle, purpose: v.purpose, visitorEntryId: e.id, recordedById: school.users.gate ?? reception } });
      }
      const meetLogin = lid(v.meet);
      if (!v.outAt && !v.days && meetLogin) {
        await tx.notification.create({ data: { schoolId, userLoginId: meetLogin, type: "visitor-arrived", text: `${v.name} is at the front desk to meet you (${v.purpose.toLowerCase()}). Reply: Send in, Wait or Not available.`, link: `/front-office/visit/${e.id}` } });
      }
    }
    await take(tx, ctx, "visitor-pass", n);
    if (!school.full) {
      await tx.frontOfficeNote.create({ data: { schoolId, text: "Fee counter closes at 1:00 PM on Saturdays.", createdById: reception } });
      return;
    }

    for (const [hh, mm, who, veh, purpose] of [[7, 40, "Milk and vegetable van, hostel mess", "TS 10 UB 3319", "Hostel mess supply"], [8, 5, "Bus 1, Route 1 KPHB", "TS 07 UA 1182", "Morning trip"], [8, 12, "Bus 4, Route 4 Miyapur", "TS 07 UB 2236", "Morning trip"]] as const) {
      await tx.gateEntry.create({ data: { schoolId, at: before(hh, mm, 160), direction: "IN", kind: who.startsWith("Bus") ? "school-bus" : "delivery", who, vehicleNo: veh, purpose, recordedById: school.users.gate ?? reception } });
    }

    // Early pickups: real students and guardians on their approved list.
    const links = await tx.studentGuardian.findMany({
      where: { archivedAt: null, canPickUp: true, restriction: null, student: { archivedAt: null, status: "ACTIVE" } },
      include: { guardian: true, student: { select: { id: true, fullName: true } } }, take: 40, orderBy: { createdAt: "asc" },
    });
    const enr = await tx.enrolment.findMany({ where: { studentId: { in: links.map((l) => l.studentId) }, academicYearId: school.yearId }, select: { studentId: true, sectionId: true } });
    const sections = await tx.section.findMany({ where: { id: { in: enr.map((e) => e.sectionId) } }, include: { schoolClass: { select: { name: true } } } });
    const label = (studentId: string) => {
      const e = enr.find((x) => x.studentId === studentId);
      const s = e ? sections.find((x) => x.id === e.sectionId) : null;
      return s ? `${s.schoolClass.name.replace(/^Class\s+/i, "")} ${s.name}` : null;
    };
    const year = todayIso().slice(0, 4);
    const picks = [links[3], links[11]].filter(Boolean);
    let gp = 188;
    for (const [i, l] of picks.entries()) {
      gp += 1;
      const timeOut = i === 0 ? before(9, 58, 60) : before(10, 20, 15);
      await tx.gatePass.create({
        data: {
          schoolId, passNo: formatNumber(`GP-${year}-`, gp, 4), kind: "PICKUP", studentId: l.student.id, sectionLabel: label(l.student.id), reason: i === 0 ? "Doctor visit" : "Family function", timeOut,
          issuedById: reception, guardianId: l.guardianId, collectorName: l.guardian.name, collectorRelation: l.relationship, verification: "photo",
          status: i === 0 ? "LEFT" : "ISSUED", leftAt: i === 0 ? new Date(timeOut.getTime() + 23 * 60_000) : null, gateCheckedById: i === 0 ? school.users.gate ?? null : null,
        },
      });
      if (i === 0) await tx.gateEntry.create({ data: { schoolId, at: new Date(timeOut.getTime() + 23 * 60_000), direction: "OUT", kind: "person", who: `${l.student.fullName}, with ${l.relationship.toLowerCase()} ${l.guardian.name}`, purpose: `Pickup gate pass ${formatNumber(`GP-${year}-`, gp, 4)} checked`, recordedById: school.users.gate ?? reception } });
    }
    await take(tx, ctx, `gate-pass-${year}`, gp);
    // One father under a court order: shown in red on the pickup list, never selectable.
    const restricted = links.find((l, i) => i > 15 && /father/i.test(l.relationship));
    if (restricted) {
      await tx.studentGuardian.update({ where: { id: restricted.id }, data: { canPickUp: false, restriction: "Court order dated 14 Mar 2026: may not collect the child. Call the mother. Note added by the School Admin." } });
    }

    // Calls today.
    const parents = links.slice(20, 26);
    const calls = [
      { hh: 10, mm: 36, dir: "IN", p: parents[0], purpose: "Fee", note: "Asked for the Q3 tuition amount. Payment link sent.", status: "CLOSED" },
      { hh: 9, mm: 47, dir: "OUT", name: "Hyderabad Sports House", phone: "9885077231", who: "Vendor", purpose: "Other", note: "Asked when the footballs will be delivered.", status: "CLOSED" },
      { hh: 9, mm: 20, dir: "IN", p: parents[1], purpose: "Transport", note: "Bus 4 was 15 minutes late yesterday evening.", status: "FOLLOW_UP", follow: true },
      { hh: 8, mm: 40, dir: "OUT", p: parents[2], purpose: "Other", note: "Confirmed early pickup at 10:00 AM.", status: "CLOSED" },
    ] as const;
    for (const c of calls) {
      const p = "p" in c ? c.p : undefined;
      const whenAt = before(c.hh, c.mm, 30);
      let taskId: string | null = null;
      const followAt = at(1, 11, 0);
      const name = p ? p.guardian.name : "name" in c ? c.name : "Caller";
      if ("follow" in c && school.users.transport) {
        taskId = (await tx.task.create({ data: { schoolId, title: `Call back ${name}`, details: c.note, assignedToId: school.users.transport, givenById: reception, dueAt: followAt } })).id;
      }
      await tx.callLogEntry.create({
        data: {
          schoolId, at: whenAt, direction: c.dir, phone: p ? p.guardian.phone : "phone" in c ? c.phone : "9000000000", name, who: p ? `${p.relationship} of ${p.student.fullName}${label(p.student.id) ? `, ${label(p.student.id)}` : ""}` : "who" in c ? c.who : "Caller",
          isParent: Boolean(p), guardianId: p?.guardianId ?? null, purpose: c.purpose, note: c.note, status: taskId ? "FOLLOW_UP" : "CLOSED", followUpAt: taskId ? followAt : null, followUpLoginId: taskId ? school.users.transport : null, taskId, createdById: reception,
        },
      });
    }

    // Walk-in requests with their tasks.
    const reqs = [
      { p: parents[3], request: "Fee statement for income tax, 2025–26", dept: "Accounts", to: school.users.accountant, status: "TODO", ago: 40, givenBy: "whatsapp" },
      { p: parents[4], request: "Bonafide certificate for passport", dept: "Office", to: school.users.admin, status: "IN_PROGRESS", ago: 80, givenBy: "slip" },
      { p: parents[5], request: "Change bus stop to KPHB 9th Phase", dept: "Transport", to: school.users.transport, status: "DONE", ago: 60 * 24, givenBy: "whatsapp" },
    ] as const;
    let r = 39;
    for (const q of reqs) {
      if (!q.p || !q.to) continue;
      r += 1;
      const requestNo = formatNumber(`REQ-${year}-`, r, 4);
      const created = new Date(Date.now() - q.ago * 60_000);
      const task = await tx.task.create({ data: { schoolId, title: `${requestNo}: ${q.request}`, details: `Walk-in request from ${q.p.guardian.name}.`, assignedToId: q.to, givenById: reception, dueAt: new Date(created.getTime() + 3 * 86_400_000), status: q.status, doneAt: q.status === "DONE" ? new Date() : null } });
      await tx.walkInRequest.create({
        data: { schoolId, requestNo, fromName: q.p.guardian.name, fromPhone: q.p.guardian.phone, guardianId: q.p.guardianId, studentId: q.p.student.id, about: `${q.p.relationship} of ${q.p.student.fullName}${label(q.p.student.id) ? `, ${label(q.p.student.id)}` : ""}`, request: q.request, department: q.dept, givenBy: q.givenBy, status: q.status === "DONE" ? "DONE" : "SENT", taskId: task.id, handlerLoginId: q.to, createdById: reception, createdAt: created, doneAt: q.status === "DONE" ? new Date() : null },
      });
    }
    await take(tx, ctx, `walk-in-${year}`, r);

    for (const [text, by, ago] of [["Principal in the exam committee meeting 12:00 to 12:40. Take messages.", school.users.admin, 120], ["Half-yearly admit cards: parents collect from the Office from Saturday.", reception, 60 * 20], ["Bus 3 running 15 minutes late this afternoon (road work).", school.users.transport, 90]] as const) {
      await tx.frontOfficeNote.create({ data: { schoolId, text, createdById: by ?? reception, createdAt: new Date(Date.now() - ago * 60_000) } });
    }

    // Appointments today and later this week.
    const appts = [
      { hh: 9, mm: 0, len: 15, who: "Ramesh Naidu", phone: "9848211903", with: staff.find((s) => /vice/i.test(s.designation))?.fullName ?? admin, purpose: "Long leave for son", status: "NO_SHOW" },
      { hh: 9, mm: 30, len: 15, who: "Harish Chandra", phone: "9866510432", with: teacher, purpose: "Unit test marks of daughter", status: "DONE" },
      { hh: 10, mm: 30, len: 30, who: "Prakash Reddy", phone: "9848055120", with: principal, purpose: "Sports quota admission for son", status: "ARRIVED" },
      { hh: 12, mm: 15, len: 15, who: "Anjali Menon", phone: "9603522870", with: accountant, purpose: "Fee concession request", status: "BOOKED" },
      { hh: 14, mm: 30, len: 15, who: "Venu Gopal", phone: "9866321450", with: principal, purpose: "Transport complaint follow-up", status: "BOOKED" },
    ];
    for (const a of appts) {
      await tx.appointment.create({ data: { schoolId, staffId: sid(a.with), date: dateOf(0), startMin: a.hh * 60 + a.mm, lengthMin: a.len, visitorName: a.who, visitorPhone: a.phone, purpose: a.purpose, status: a.status, confirmationSent: true, createdById: reception } });
    }
    await tx.appointment.create({ data: { schoolId, staffId: sid(principal), date: dateOf(1), startMin: 9 * 60, lengthMin: 30, visitorName: "Swathi Varma", visitorPhone: "9704088213", purpose: "School visit for Nursery admission", status: "BOOKED", createdById: reception } });

    // Postal register.
    const post = [
      { days: 0, hh: 10, mm: 5, dir: "RECEIVED", type: "COURIER", party: "CBSE Regional Office, Chennai", for: principal, courier: "Speed Post", track: "EK419277833IN", status: "AT_DESK" },
      { days: 0, hh: 9, mm: 40, dir: "RECEIVED", type: "PARCEL", party: "Oxford University Press", for: staff.find((s) => /librarian/i.test(s.designation))?.fullName ?? admin, courier: "Delhivery", track: "5847 2210 9931", status: "HANDED_OVER" },
      { days: -1, hh: 15, mm: 10, dir: "RECEIVED", type: "COURIER", party: "HDFC Bank, Kukatpally", for: accountant, courier: "Blue Dart", track: "77201184562", status: "AT_DESK" },
      { days: -1, hh: 11, mm: 20, dir: "SENT", type: "LETTER", party: "District Educational Officer, Medchal", for: admin, courier: "Speed Post", track: "EK418822017IN", status: "SENT" },
      { days: -2, hh: 14, mm: 30, dir: "RECEIVED", type: "LETTER", party: "Income Tax Department (TDS)", for: accountant, courier: "India Post", track: "", status: "HANDED_OVER" },
      { days: -3, hh: 16, mm: 15, dir: "RECEIVED", type: "PARCEL", party: "Telangana Book House", for: store, courier: "Professional Couriers", track: "HYD22091187", status: "AT_DESK" },
    ];
    let pd = 311;
    for (const x of post) {
      pd += 1;
      const s = staff.find((y) => y.fullName === x.for);
      const whenAt = x.days === 0 ? before(x.hh, x.mm, 20) : at(x.days, x.hh, x.mm);
      await tx.postalEntry.create({
        data: {
          schoolId, entryNo: formatNumber(`PD-${year}-`, pd, 4), at: whenAt, direction: x.dir, itemType: x.type, party: x.party, forStaffId: s?.id ?? null,
          forText: s ? (/principal/i.test(s.designation) ? `${s.fullName} (${s.designation})` : `${s.fullName} · ${s.designation}`) : "Office", courier: x.courier, trackingNo: x.track || null, status: x.status,
          handedToName: x.status === "HANDED_OVER" ? x.for : null, handedAt: x.status === "HANDED_OVER" ? new Date(whenAt.getTime() + 12 * 60_000) : null, handedById: x.status === "HANDED_OVER" ? reception : null, createdById: reception,
        },
      });
    }
    await take(tx, ctx, `postal-${year}`, pd);
  });
}
