// Events & Calendar demo: second Saturdays off; events around today (a fire
// drill and a staff meeting today, a picnic with a fee and registrations,
// a debate with a seat limit, the Sports Day with volunteers, an alumni
// meet, a cancelled trip and a past exhibition with attendance); PTM days
// (one held in July with notes, one coming up with booked slots); photo
// consent for most students; albums (published with tagged photos, a draft
// still to tag, an archived one). Dates are set from the day the demo is
// seeded, and moved off holidays and weekends where they must be working days.
import sharp from "sharp";
import { withSchool, type SchoolContext, type Tx } from "../../src/lib/db";
import { saveEventsSettings } from "../../src/lib/events/settings";
import { createEvent, registerStudents, markAttendance, cancelEvent, addVolunteer, type EventInput } from "../../src/lib/events/events";
import { planPtm } from "../../src/lib/events/ptm";
import { notWorkingDay } from "../../src/lib/events/calendar";
import { addMedia, createAlbum, publishAlbum, archiveAlbum, tagMedia } from "../../src/lib/events/gallery";
import { collectPayment } from "../../src/lib/fees/collect";
import type { SeedSchool } from "./types";

const OFFSET = 330 * 60_000; // Asia/Kolkata
const todayIso = (days = 0) => new Date(Date.now() + OFFSET + days * 86_400_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const R = (rupees: number) => BigInt(Math.round(rupees * 100));
const T = (hh: number, mm = 0) => hh * 60 + mm;

async function workingDay(tx: Tx, ctx: SchoolContext, iso: string, step = 1) {
  let d = iso;
  for (let i = 0; i < 20 && (await notWorkingDay(tx, ctx, d)); i++) d = addDays(d, step);
  return d;
}

/** A simple picture for the demo albums: a coloured scene with a few "people". */
async function demoPhoto(seed: number, people: number) {
  const hues = ["#2f6fde", "#14a37f", "#e08a1e", "#c2416b", "#7a5af5", "#0f8fb3"];
  const bg = hues[seed % hues.length];
  const figures = Array.from({ length: people }, (_, i) => {
    const x = 120 + i * (560 / Math.max(1, people)) + (seed * 13) % 40;
    return `<circle cx="${x}" cy="300" r="46" fill="#fde7cf"/><rect x="${x - 60}" y="350" width="120" height="170" rx="40" fill="#ffffff" opacity=".85"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><rect width="960" height="640" fill="${bg}"/><rect y="470" width="960" height="170" fill="#000" opacity=".12"/><circle cx="820" cy="110" r="60" fill="#fff" opacity=".35"/>${figures}</svg>`;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
  return new File([new Uint8Array(buf)], `photo-${seed + 1}.jpg`, { type: "image/jpeg" });
}

export async function seedEvents(school: SeedSchool) {
  const { schoolId } = school;
  const principal = school.users.principal;
  const ctx: SchoolContext = { schoolId, userId: principal ?? null };
  const today = todayIso();

  await withSchool(ctx, (tx) => saveEventsSettings(tx, ctx, { secondSaturdayOff: school.full, ptmSlotMinutes: 10, ptmReminderHour: 18 }));

  const base = await withSchool(ctx, async (tx) => {
    const classes = await tx.schoolClass.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } });
    const enrol = await tx.enrolment.findMany({ where: { academicYearId: school.yearId, archivedAt: null, status: "STUDYING" }, select: { studentId: true, classId: true, sectionId: true, rollNo: true }, orderBy: [{ sectionId: "asc" }, { rollNo: "asc" }] });
    const staff = await tx.staff.findMany({ where: { archivedAt: null }, select: { id: true, fullName: true }, orderBy: { staffCode: "asc" } });
    return { classes, enrol, staff };
  });
  const cls = (...names: string[]) => base.classes.filter((c) => names.includes(c.name)).map((c) => c.id);
  const inClasses = (ids: string[], n: number, skip = 0) => base.enrol.filter((e) => ids.includes(e.classId)).slice(skip, skip + n).map((e) => e.studentId);
  const ev = (over: Partial<EventInput> & Pick<EventInput, "name" | "type" | "date" | "startMin">): EventInput => ({
    endMin: null, venue: null, audienceKind: "school", classIds: [], registrationOn: false, seats: null, feePaise: null, reminder: "1d", description: null, ...over,
  });

  // Photo consent: most guardians gave it on the admission form; a few did not, one withdrew.
  await withSchool(ctx, async (tx) => {
    const text = await tx.consentText.findFirst({ where: { consentType: "photo" }, orderBy: { version: "desc" } });
    if (!text) return;
    const links = await tx.studentGuardian.findMany({ where: { archivedAt: null, studentId: { in: base.enrol.map((e) => e.studentId) }, isPrimary: true }, select: { studentId: true, guardianId: true } });
    let i = 0;
    for (const l of links) {
      i++;
      if (i % 9 === 4) continue; // no photo consent
      await tx.consentRecord.create({ data: { schoolId, guardianId: l.guardianId, studentId: l.studentId, consentType: "photo", consentTextId: text.id, textVersion: text.version, how: "admission-form", givenAt: new Date(Date.now() - 200 * 86_400_000), ...(i % 23 === 0 ? { withdrawnAt: new Date(Date.now() - 20 * 86_400_000), withdrawnHow: "office" } : {}) } });
    }
  }, { timeout: 120_000 });

  // Events.
  await withSchool(ctx, async (tx) => {
    const confirm = { confirm: true };
    await createEvent(tx, ctx, ev({ name: "Fire drill", type: "Safety drill", date: today, startMin: T(13, 15), endMin: T(13, 45), venue: "School ground", reminder: "morning" }), confirm);
    await createEvent(tx, ctx, ev({ name: "Staff meeting", type: "Meeting", date: today, startMin: T(15), endMin: T(16), venue: "Library hall", audienceKind: "staff", reminder: "none", description: "All teaching staff. Half-yearly exam duties." }), confirm);
    if (school.full) {
      const picnicClasses = cls("Class 5", "Class 6", "Class 7");
      const picnic = await createEvent(tx, ctx, ev({ name: "Wonderla picnic", type: "Trip", date: addDays(today, 9), startMin: T(7), endMin: T(19, 30), venue: "Outside the school", audienceKind: "classes", classIds: picnicClasses, registrationOn: true, seats: 250, feePaise: R(1200), description: "Wonderla, Raviryal. Buses leave at 7:00 AM sharp." }), confirm);
      await registerStudents(tx, ctx, picnic.id, inClasses(picnicClasses, 36), today);
      const debateClasses = cls("Class 8", "Class 9", "Class 10");
      const debate = await createEvent(tx, ctx, ev({ name: "Inter-house debate", type: "Competition", date: addDays(today, 14), startMin: T(14, 20), endMin: T(15, 45), venue: "Library hall", audienceKind: "classes", classIds: debateClasses, registrationOn: true, seats: 32 }), confirm);
      await registerStudents(tx, ctx, debate.id, inClasses(debateClasses, 12, 3), today);
      await createEvent(tx, ctx, ev({ name: "Diwali celebration", type: "Cultural", date: addDays(today, 22), startMin: T(11, 30), endMin: T(13), venue: "Assembly hall" }), confirm);
      const sports = await createEvent(tx, ctx, ev({ name: "Annual Sports Day", type: "Sports day", date: addDays(today, 37), startMin: T(8), endMin: T(13), venue: "School ground", registrationOn: true, description: "Parents are welcome. Track events from 8:30 AM." }), confirm);
      await registerStudents(tx, ctx, sports.id, inClasses(cls("Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8"), 60, 2), today);
      for (const [i, duty] of ["Track events in charge", "First aid", "Prize distribution", "Parent seating"].entries()) {
        const s = base.staff[(i * 5 + 3) % base.staff.length];
        if (s) await addVolunteer(tx, ctx, sports.id, { kind: "staff", personId: s.id, name: s.fullName, duty });
      }
      await addVolunteer(tx, ctx, sports.id, { kind: "parent", personId: null, name: "Dr. Sunil Reddy (parent)", duty: "Doctor on the ground" });
      await createEvent(tx, ctx, ev({ name: "Alumni meet 2026", type: "Alumni", date: addDays(today, 66), startMin: T(17), endMin: T(20, 30), venue: "Auditorium", audienceKind: "alumni", registrationOn: true, seats: 300 }), confirm);

      // A trip cancelled for rain (before it was due), and a past exhibition with attendance.
      const tripDay = addDays(today, -15);
      const trip = await createEvent(tx, ctx, ev({ name: "Science Centre visit", type: "Trip", date: tripDay, startMin: T(9), endMin: T(14), venue: "Outside the school", audienceKind: "classes", classIds: cls("Class 8"), registrationOn: true, seats: 90, feePaise: R(350) }), confirm);
      await registerStudents(tx, ctx, trip.id, inClasses(cls("Class 8"), 10), addDays(tripDay, -6));
      await cancelEvent(tx, ctx, trip.id, "Heavy rain warning for the day. Unpaid fees are removed.", false, addDays(tripDay, -2));
      const expoDay = addDays(today, -30);
      const expoClasses = cls("Class 6", "Class 7", "Class 8");
      const expo = await createEvent(tx, ctx, ev({ name: "Science exhibition", type: "Competition", date: expoDay, startMin: T(9), endMin: T(13), venue: "Auditorium", audienceKind: "classes", classIds: expoClasses, registrationOn: true }), confirm);
      const expoKids = inClasses(expoClasses, 24);
      await registerStudents(tx, ctx, expo.id, expoKids, addDays(expoDay, -5));
      await markAttendance(tx, ctx, expo.id, expoKids.filter((_, i) => i % 8 !== 5), today);
      await createEvent(tx, ctx, ev({ name: "Teachers’ Day", type: "Cultural", date: addDays(today, -40), startMin: T(10), endMin: T(12), venue: "Assembly hall" }), confirm);
    }
  }, { timeout: 180_000 });

  // Picnic fees: most families have paid at the counter.
  if (school.full) {
    const dues = await withSchool(ctx, async (tx) => {
      const picnic = await tx.event.findFirst({ where: { name: "Wonderla picnic" } });
      if (!picnic) return [];
      return tx.eventRegistration.findMany({ where: { eventId: picnic.id, dueId: { not: null } }, select: { studentId: true, dueId: true } });
    });
    for (const [i, r] of dues.entries()) {
      if (i % 6 === 2) continue; // still due
      await withSchool(ctx, async (tx) => {
        await collectPayment(tx, ctx, { roleKeys: ["accountant"] }, {
          studentId: r.studentId, dueIds: [r.dueId!], amountPaise: R(1200), mode: i % 2 ? "UPI" : "CASH", reference: i % 2 ? `UPI${510000 + i * 7919}` : null,
          chequeNo: null, chequeBank: null, chequeDate: null, paidAt: null, note: null, discountPaise: BigInt(0), discountReason: null, waiveDueIds: [], waiveReason: null, confirmDuplicate: true,
        });
      }, { timeout: 60_000 });
    }
  }

  // PTM days: one held in July with notes, one coming up with booked slots.
  if (school.full) {
    await withSchool(ctx, async (tx) => {
      const past = await workingDay(tx, ctx, addDays(today, -89));
      const held = await planPtm(tx, ctx, { date: past, classIds: base.classes.map((c) => c.id), startMin: T(9, 30), endMin: T(12, 30), slotMinutes: 10, venue: "Classrooms", subjectTeachers: false }, past);
      await bookDemoSlots(tx, ctx, held.ptm.id, school.yearId, 0.8, true);
      const next = await workingDay(tx, ctx, addDays(today, 3));
      const coming = await planPtm(tx, ctx, { date: next, classIds: cls("Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10"), startMin: T(9, 30), endMin: T(12, 30), slotMinutes: 10, venue: "Classrooms", subjectTeachers: true }, today);
      await bookDemoSlots(tx, ctx, coming.ptm.id, school.yearId, 0.6, false);
      const later = await workingDay(tx, ctx, addDays(today, 60));
      await planPtm(tx, ctx, { date: later, classIds: cls("Nursery", "LKG", "UKG"), startMin: T(9, 30), endMin: T(11, 30), slotMinutes: 10, venue: "Pre-primary block", subjectTeachers: false }, today).catch(() => null);
    }, { timeout: 180_000 });
  }

  // Gallery.
  await withSchool(ctx, async (tx) => {
    const expo = await tx.event.findFirst({ where: { name: school.full ? "Science exhibition" : "Fire drill" } });
    const published = await createAlbum(tx, ctx, { name: school.full ? "Science exhibition 2026" : "Fire drill", eventId: expo?.id ?? null, date: expo ? expo.date.toISOString().slice(0, 10) : today, visibleTo: "EVERYONE", classIds: [], consentRule: "OUT" });
    const kids = base.enrol.slice(0, 40).map((e) => e.studentId);
    for (let i = 0; i < (school.full ? 8 : 3); i++) {
      const m = await addMedia(tx, ctx, published.id, await demoPhoto(i, 1 + (i % 3)));
      if (i === 6) await tagMedia(tx, ctx, m.id, [], true);
      else if (i !== 7) await tagMedia(tx, ctx, m.id, kids.slice(i * 3, i * 3 + 1 + (i % 3)).map((s, k) => ({ studentId: s, x: 0.15 + k * 0.3, y: 0.45 })), false);
    }
    await publishAlbum(tx, ctx, published.id, false);
    if (!school.full) return;
    const drill = await tx.event.findFirst({ where: { name: "Fire drill" } });
    const draft = await createAlbum(tx, ctx, { name: "Fire drill, October", eventId: drill?.id ?? null, date: today, visibleTo: "STAFF", classIds: [], consentRule: "OUT" });
    for (let i = 0; i < 5; i++) await addMedia(tx, ctx, draft.id, await demoPhoto(10 + i, 2));
    const old = await createAlbum(tx, ctx, { name: "Teachers’ Day", eventId: null, date: addDays(today, -40), visibleTo: "EVERYONE", classIds: [], consentRule: "BLUR" });
    for (let i = 0; i < 3; i++) {
      const m = await addMedia(tx, ctx, old.id, await demoPhoto(20 + i, 3));
      await tagMedia(tx, ctx, m.id, kids.slice(20 + i * 3, 23 + i * 3).map((s, k) => ({ studentId: s, x: 0.15 + k * 0.3, y: 0.45 })), false);
    }
    await publishAlbum(tx, ctx, old.id, false);
    await archiveAlbum(tx, ctx, old.id);
  }, { timeout: 180_000 });
}

/** Books a share of each teacher's slots for students of their sections; for a held PTM, marks arrivals and notes. */
async function bookDemoSlots(tx: Tx, ctx: SchoolContext, ptmId: string, yearId: string, share: number, held: boolean) {
  const teachers = await tx.ptmTeacher.findMany({ where: { ptmId } });
  const NOTES = [
    ["Reading is improving. Practise 10 minutes of reading aloud daily.", "Happy with the progress in English.", "Check the reading log every Friday."],
    ["Good in Maths; careless mistakes in Science tests.", "Parent will check the Science diary each week.", "Science diary every week"],
    ["Needs to submit homework on time.", "Parent says evenings are busy; will set a fixed study hour.", "Fixed study hour, 6 to 7 PM"],
  ];
  let n = 0;
  for (const t of teachers) {
    const kids = await tx.enrolment.findMany({ where: { sectionId: { in: t.sectionIds }, academicYearId: yearId, archivedAt: null }, select: { studentId: true }, orderBy: { rollNo: "asc" } });
    const slots = await tx.ptmSlot.findMany({ where: { ptmId, staffId: t.staffId }, orderBy: { startMin: "asc" } });
    for (const [i, s] of slots.entries()) {
      const k = kids[i];
      if (!k || (i * 7) % 10 >= share * 10) continue;
      const g = await tx.studentGuardian.findFirst({ where: { studentId: k.studentId, archivedAt: null }, orderBy: { isPrimary: "desc" }, select: { guardianId: true } });
      const came = held && i % 9 !== 4;
      await tx.ptmSlot.update({ where: { id: s.id }, data: { studentId: k.studentId, guardianId: g?.guardianId ?? null, bookedById: ctx.userId, bookedAt: new Date(), arrivedAt: came ? new Date() : null } });
      if (came && n++ % 3 === 0) {
        const note = NOTES[n % NOTES.length];
        await tx.ptmMeetingNote.create({ data: { schoolId: ctx.schoolId, slotId: s.id, ptmId, studentId: k.studentId, staffId: t.staffId, remarks: note[0], feedback: note[1], followUp: note[2], createdById: ctx.userId } });
      }
    }
  }
}
