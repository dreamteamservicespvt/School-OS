"use server";

// Every change made on the Events & Calendar pages. Each one checks the
// person's role on the server (requireAction and the Events level), runs
// inside the school's walls and writes the audit log in the same transaction.

import type { FormState } from "@/lib/forms";
import { evAction, need, str, id, ids, maybe, dateIso, checked, EventsProblem, UUID_RE } from "@/lib/events/act";
import { addEntry, removeEntry } from "@/lib/events/calendar";
import { addVolunteer, assignSeats, cancelEvent, createEvent, markAttendance, messageAudience, registerStudents, removeVolunteer, updateEvent, withdrawStudent, type EventInput } from "@/lib/events/events";
import { bookSlot, cancelBooking, cancelPtm, markArrived, planPtm, saveNotes, sendSummary, setQueue } from "@/lib/events/ptm";
import { archiveAlbum, askConsent, createAlbum, newShareLink, publishAlbum, removeMedia, renameAlbum, setAlbumAccess, shareAlbum, tagMedia } from "@/lib/events/gallery";
import { changeList, LIST_WORDS, renewFeed, saveCredits, saveEventsSettings } from "@/lib/events/settings";
import { recordConsent, remindConsent } from "@/lib/events/consent";
import { localNow } from "@/lib/events/jobs";
import { parseRupees } from "@/lib/fees/act";
import { sendMessage } from "@/lib/messaging";
import { ENTRY_TYPES, dmy, isEntryType, minutesFrom, clock } from "@/lib/events/words";

type S = FormState<unknown>;
const today = (tz: string) => localNow(new Date(), tz).today;
const time = (fd: FormData, key: string, label: string, required = true) => {
  const v = str(fd, key);
  if (!v) {
    if (required) throw new EventsProblem(`Enter the ${label}.`, key);
    return null;
  }
  const m = minutesFrom(v);
  if (m == null) throw new EventsProblem(`Enter the ${label} like 10:30.`, key);
  return m;
};
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ---------- School Calendar ---------- */

export async function addEntryAction(_: S, fd: FormData): Promise<S> {
  return evAction("create", fd, async (w) => {
    need(w.can.calendar, "change the School Calendar");
    const type = str(fd, "type");
    if (!isEntryType(type)) throw new EventsProblem("Choose the type.", "type");
    const from = dateIso(fd, "from", "Date")!;
    const to = type === "vacation" ? dateIso(fd, "to", "Last day") : null;
    const applies = str(fd, "applies");
    const campusId = UUID_RE.test(applies.replace(/^campus:/, "")) && applies.startsWith("campus:") ? applies.slice(7) : null;
    const classIds = applies === "classes" ? ids(fd, "classIds") : [];
    if (applies === "classes" && !classIds.length) throw new EventsProblem("Choose the classes.", "classIds");
    const entry = await addEntry(w.tx, w.ctx, { title: str(fd, "title"), type, from, to, attendanceOn: checked(fd, "attendanceOn"), campusId, classIds, details: maybe(fd, "details", "Description", 500) }, { confirm: str(fd, "confirm") === "attendance-taken", today: today(w.tz) });
    let told = 0;
    if (checked(fd, "notify")) {
      const school = (await w.tx.school.findUnique({ where: { id: w.ctx.schoolId }, select: { name: true } }))?.name ?? "School";
      const when = to && to !== from ? `${dmy(from)} to ${dmy(to)}` : dmy(from);
      const closes = !entry.attendanceOn && (type === "holiday" || type === "vacation");
      const r = await sendMessage(w.tx, w.ctx, {
        to: classIds.length ? { kinds: ["parents"], classIds } : { kinds: ["parents"] }, channels: "preferred",
        text: `Dear Parent, ${entry.title} on ${when}.${closes ? " The school is closed." : ""} - ${school}`,
        trigger: `Calendar: ${entry.title}`, source: { type: "Calendar Entry", id: entry.id },
      });
      told = r.people;
    }
    return { entry, told };
  }, (r) => ({
    message: `${ENTRY_TYPES[r.entry.type as keyof typeof ENTRY_TYPES]?.label ?? "Entry"} added: ${r.entry.title}. ${r.entry.attendanceOn ? "Attendance can still be taken." : "Attendance is off on these days."}${r.told ? ` ${count(r.told, "parent")} told.` : ""}`,
    undo: { kind: "ev-entry-add", id: r.entry.id },
  }));
}

export async function removeEntryAction(_: S, fd: FormData): Promise<S> {
  return evAction("archive", fd, async (w) => {
    need(w.can.calendar, "change the School Calendar");
    return removeEntry(w.tx, w.ctx, id(fd, "entryId", "entry"));
  }, (e) => ({
    message: e.attendanceOn ? `${e.title} removed from the calendar.` : `${e.title} removed. Attendance will be needed for ${dmy(e.startDate.toISOString().slice(0, 10))}${e.endDate > e.startDate ? ` to ${dmy(e.endDate.toISOString().slice(0, 10))}` : ""}.`,
    undo: { kind: "ev-entry-remove", id: e.id },
  }));
}

/** Copies last year's holidays with the dates the person checked. */
export async function copyHolidaysAction(_: S, fd: FormData): Promise<S> {
  return evAction("create", fd, async (w) => {
    need(w.can.calendar, "change the School Calendar");
    const picks = ids(fd, "pick");
    if (!picks.length) throw new EventsProblem("Tick the holidays to copy.", "pick");
    const old = await w.tx.calendarEntry.findMany({ where: { id: { in: picks } } });
    let added = 0;
    for (const o of old) {
      const from = dateIso(fd, `from_${o.id}`, `First day of ${o.title}`)!;
      const to = o.type === "vacation" ? dateIso(fd, `to_${o.id}`, `Last day of ${o.title}`) : null;
      await addEntry(w.tx, w.ctx, { title: o.title, type: o.type, from, to, attendanceOn: o.attendanceOn, campusId: o.campusId, details: o.details }, { confirm: true, today: today(w.tz) });
      added++;
    }
    return added;
  }, (n) => `${count(n, "holiday")} copied to this year's calendar.`);
}

/* ---------- Events ---------- */

function eventInput(fd: FormData): EventInput {
  const fee = parseRupees(str(fd, "fee"), "The fee", "fee");
  const seats = str(fd, "seats");
  if (seats && !/^\d+$/.test(seats)) throw new EventsProblem("Seats is a number.", "seats");
  const audience = str(fd, "audienceKind") || "school";
  return {
    name: str(fd, "name"), type: str(fd, "type"), date: dateIso(fd, "date", "Date")!,
    startMin: time(fd, "startTime", "start time")!, endMin: time(fd, "endTime", "end time", false),
    venue: maybe(fd, "venue", "Venue", 80), audienceKind: audience, classIds: audience === "classes" ? ids(fd, "classIds") : [],
    registrationOn: checked(fd, "registrationOn"), seats: seats ? Number(seats) : null, feePaise: fee,
    reminder: str(fd, "reminder") || "1d", description: maybe(fd, "description", "Description", 1000),
    consentOn: checked(fd, "consentOn"), consentBy: checked(fd, "consentOn") ? dateIso(fd, "consentBy", "Reply-by date", false) : null,
  };
}

export async function saveEventAction(_: S, fd: FormData): Promise<S> {
  return evAction("create", fd, async (w) => {
    need(w.can.events, "plan events");
    const input = eventInput(fd);
    const confirm = str(fd, "confirm") === "venue-clash";
    const eventId = str(fd, "eventId");
    if (eventId) {
      const r = await updateEvent(w.tx, w.ctx, eventId, input, { confirm, today: today(w.tz) });
      let told = 0;
      if (r.moved && checked(fd, "tell")) {
        try { told = (await messageAudience(w.tx, w.ctx, r.event, "changed")).people; } catch (e) { if (!(e instanceof EventsProblem)) throw e; }
      }
      return { event: r.event, created: false, told };
    }
    return { event: await createEvent(w.tx, w.ctx, input, { confirm }), created: true, told: 0 };
  }, (r) => r.created
    ? { message: `Event created: ${r.event.name}. It is on the School Calendar.`, link: { href: `/events-calendar/events/${r.event.id}`, label: "Open" } }
    : `${r.event.name} saved.${r.told ? ` ${count(r.told, "person", "people")} told about the change.` : ""}`);
}

export async function cancelEventAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.events, "cancel events");
    return cancelEvent(w.tx, w.ctx, id(fd, "eventId", "event"), str(fd, "reason"), checked(fd, "tell"), today(w.tz));
  }, (r) => `${r.event.name} cancelled.${r.told ? ` ${count(r.told, "person", "people")} told.` : ""}${r.removed ? ` ${count(r.removed, "unpaid fee")} removed.` : ""}${r.refunds ? ` ${count(r.refunds, "refund")} sent to Approvals.` : ""}`);
}

export async function registerAction(_: S, fd: FormData): Promise<S> {
  return evAction("create", fd, async (w) => {
    need(w.can.events, "register students");
    return registerStudents(w.tx, w.ctx, id(fd, "eventId", "event"), ids(fd, "studentIds"), today(w.tz));
  }, (r) => `${count(r.added, "student")} registered for ${r.event.name}.${r.charged > BigInt(0) ? " The fee is added to their fees." : ""}${r.skipped ? ` ${r.skipped} left out (already registered or not in the audience).` : ""}`);
}

export async function withdrawAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.events, "withdraw students");
    return withdrawStudent(w.tx, w.ctx, id(fd, "eventId", "event"), id(fd, "studentId", "student"), today(w.tz));
  }, (r) => `${r.name} withdrawn.${r.removed ? " The unpaid fee is removed." : ""}${r.refunds ? " The paid fee goes to Approvals for a refund." : ""}`);
}

export async function attendanceAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.events, "mark event attendance");
    return markAttendance(w.tx, w.ctx, id(fd, "eventId", "event"), ids(fd, "present"), today(w.tz));
  }, (r) => `Attendance saved: ${r.present} of ${r.of} present.`);
}

export async function seatsAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.events, "assign seats");
    return assignSeats(w.tx, w.ctx, id(fd, "eventId", "event"), Number(str(fd, "perRow")));
  }, (r) => `${count(r.seated, "seat")} given in ${count(r.rows, "row")}, in class and roll order.`);
}

export async function volunteerAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.events, "add volunteers");
    const kind = str(fd, "kind") || "staff";
    const personId = UUID_RE.test(str(fd, "personId")) ? str(fd, "personId") : null;
    return addVolunteer(w.tx, w.ctx, id(fd, "eventId", "event"), { kind, personId, name: str(fd, "name"), duty: str(fd, "duty") });
  }, (v) => `${v.name} added as a volunteer: ${v.duty}.`);
}

export async function removeVolunteerAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.events, "change volunteers");
    return removeVolunteer(w.tx, w.ctx, id(fd, "volunteerId", "volunteer"));
  }, (v) => `${v.name} is no longer a volunteer.`);
}

export async function remindAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.events, "send reminders");
    const e = await w.tx.event.findFirst({ where: { id: id(fd, "eventId", "event"), archivedAt: null } });
    if (!e || e.status === "CANCELLED") throw new EventsProblem("This event was not found, or it is cancelled.");
    if (e.date.toISOString().slice(0, 10) < today(w.tz)) throw new EventsProblem("This event is over.");
    return messageAudience(w.tx, w.ctx, e, "reminder");
  }, (r) => `Reminder sent to ${count(r.people, "person", "people")}. Track it in Message History.`);
}

/* ---------- PTM ---------- */

export async function planPtmAction(_: S, fd: FormData): Promise<S> {
  return evAction("create", fd, async (w) => {
    need(w.can.ptmPlan, "plan PTMs");
    return planPtm(w.tx, w.ctx, {
      date: dateIso(fd, "date", "Date")!, classIds: ids(fd, "classIds"), startMin: time(fd, "startTime", "start time")!, endMin: time(fd, "endTime", "end time")!,
      slotMinutes: Number(str(fd, "slotMinutes")) || 10, venue: maybe(fd, "venue", "Venue", 80), subjectTeachers: checked(fd, "subjectTeachers"),
      breakStartMin: checked(fd, "breakOn") ? time(fd, "breakStart", "break start") : null, breakEndMin: checked(fd, "breakOn") ? time(fd, "breakEnd", "break end") : null,
    }, today(w.tz));
  }, (r) => ({ message: `PTM planned for ${dmy(r.ptm.date.toISOString().slice(0, 10))}: ${r.ptm.classesLabel}. ${count(r.slots, "slot")} for ${count(r.teachers, "teacher")}.`, link: { href: `/events-calendar/ptm?day=${r.ptm.id}`, label: "Open" } }));
}

export async function cancelPtmAction(_: S, fd: FormData): Promise<S> {
  return evAction("archive", fd, async (w) => {
    need(w.can.ptmPlan, "cancel PTMs");
    return cancelPtm(w.tx, w.ctx, id(fd, "ptmId", "PTM"), str(fd, "reason"), today(w.tz));
  }, (r) => `PTM cancelled.${r.told ? ` ${count(r.told, "parent")} told.` : ""}`);
}

export async function bookSlotAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.ptmBook, "book PTM slots");
    return bookSlot(w.tx, w.ctx, id(fd, "slotId", "slot"), id(fd, "studentId", "student"), today(w.tz), { own: w.can.own });
  }, (r) => `Booked: ${r.teacher} at ${r.time} for ${r.student.firstName}'s parent.${r.messaged ? " They get a confirmation now and a reminder before the day." : ""}`);
}

export async function cancelBookingAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.ptmBook, "change PTM bookings");
    return cancelBooking(w.tx, w.ctx, id(fd, "slotId", "slot"), today(w.tz), { own: w.can.own });
  }, (r) => `The ${r.time} slot is free again.`);
}

export async function arrivedAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.ptmNotes, "mark parents arrived");
    const arrived = str(fd, "arrived") !== "no";
    await markArrived(w.tx, w.ctx, id(fd, "slotId", "slot"), arrived, today(w.tz), { own: w.can.own });
    return arrived;
  }, (a) => (a ? "Marked: parent arrived." : "Arrival taken back."));
}

export async function notesAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.ptmNotes, "record PTM notes");
    return saveNotes(w.tx, w.ctx, id(fd, "slotId", "slot"), {
      remarks: maybe(fd, "remarks", "Teacher remarks", 1000), feedback: maybe(fd, "feedback", "Parent feedback", 1000), followUp: maybe(fd, "followUp", "Follow-up actions", 300), arrived: checked(fd, "arrived"),
    }, today(w.tz), { own: w.can.own });
  }, (r) => `Notes saved for ${r.student.fullName}. They are on the student's profile, Activities tab.`);
}

export async function queueAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.ptmPlan, "run the waiting queue");
    const open = str(fd, "open") !== "no";
    await setQueue(w.tx, w.ctx, id(fd, "ptmId", "PTM"), open, today(w.tz));
    return open;
  }, (o) => (o ? "Waiting queue opened. Parents are called by slot time." : "Waiting queue closed."));
}

export async function summaryAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.ptmPlan, "send the PTM summary");
    return sendSummary(w.tx, w.ctx, id(fd, "ptmId", "PTM"), today(w.tz));
  }, (r) => `PTM summary sent to ${count(r.people, "parent")} who did not come.`);
}

/* ---------- Gallery ---------- */

export async function saveAlbumAction(_: S, fd: FormData): Promise<S> {
  return evAction("create", fd, async (w) => {
    need(w.can.gallery, "make albums");
    const eventId = UUID_RE.test(str(fd, "eventId")) ? str(fd, "eventId") : null;
    const albumId = str(fd, "albumId");
    if (albumId) return { album: await renameAlbum(w.tx, w.ctx, albumId, { name: str(fd, "name"), date: dateIso(fd, "date", "Date")!, eventId }), created: false };
    const visibleTo = str(fd, "visibleTo") || "STAFF";
    return { album: await createAlbum(w.tx, w.ctx, { name: str(fd, "name"), eventId, date: dateIso(fd, "date", "Date")!, visibleTo, classIds: visibleTo === "CLASSES" ? ids(fd, "classIds") : [], consentRule: str(fd, "consentRule") || "OUT" }), created: true };
  }, (r) => r.created
    ? { message: `Album “${r.album.name}” made. Visible to staff only until you publish it.`, link: { href: `/events-calendar/gallery/${r.album.id}`, label: "Open" } }
    : `${r.album.name} saved.`);
}

export async function albumAccessAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.gallery, "change albums");
    const visibleTo = str(fd, "visibleTo");
    return setAlbumAccess(w.tx, w.ctx, id(fd, "albumId", "album"), { visibleTo, classIds: visibleTo === "CLASSES" ? ids(fd, "classIds") : [], consentRule: str(fd, "consentRule") });
  }, (a) => `Saved: ${a.visibleTo === "STAFF" ? "visible to staff only" : a.visibleTo === "CLASSES" ? "visible to parents of the chosen classes" : "visible to everyone"}; students without photo consent are ${a.consentRule === "BLUR" ? "blurred" : "left out"}.`);
}

export async function publishAlbumAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.gallery, "publish albums");
    return publishAlbum(w.tx, w.ctx, id(fd, "albumId", "album"), checked(fd, "staffOnly"));
  }, (a) => `${a.name} published.${a.visibleTo === "STAFF" ? " Visible to staff only." : " Untagged photos stay staff only."}`);
}

export async function archiveAlbumAction(_: S, fd: FormData): Promise<S> {
  return evAction("archive", fd, async (w) => {
    need(w.can.gallery, "archive albums");
    return archiveAlbum(w.tx, w.ctx, id(fd, "albumId", "album"));
  }, (r) => ({ message: `${r.album.name} archived. Hidden from parents; staff can still see it.`, undo: { kind: "ev-album-archive", id: `${r.album.id}~${r.was}` } }));
}

export async function shareAlbumAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.gallery, "share albums");
    return shareAlbum(w.tx, w.ctx, id(fd, "albumId", "album"));
  }, (r) => `Album link sent to ${count(r.people, "parent")}. Photo consent is checked for every photo when they open it.`);
}

export async function newLinkAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.gallery, "change album links");
    return newShareLink(w.tx, w.ctx, id(fd, "albumId", "album"));
  }, () => "New album link made. The old link no longer works.");
}

export async function tagAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.gallery, "tag photos");
    const noStudents = str(fd, "noStudents") === "yes";
    const num = (k: string) => { const v = str(fd, k); return v === "" ? null : Number(v); };
    const tags = ids(fd, "studentIds").map((s) => ({ studentId: s, x: num(`x_${s}`), y: num(`y_${s}`) }));
    return tagMedia(w.tx, w.ctx, id(fd, "mediaId", "photo"), tags, noStudents);
  }, (r) => (r.tagged ? `${count(r.tagged, "student")} tagged.${r.missing ? ` ${r.missing} without photo consent.` : " All have photo consent."}` : "Marked as no students."));
}

export async function removeMediaAction(_: S, fd: FormData): Promise<S> {
  return evAction("archive", fd, async (w) => {
    need(w.can.gallery, "remove photos");
    return removeMedia(w.tx, w.ctx, id(fd, "mediaId", "photo"));
  }, (m) => ({ message: m.kind === "VIDEO" ? "Video removed from the album." : "Photo removed from the album.", undo: { kind: "ev-media-remove", id: m.id } }));
}

export async function askConsentAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.gallery, "ask for photo consent");
    return askConsent(w.tx, w.ctx, id(fd, "albumId", "album"));
  }, (r) => `Photo consent asked for ${count(r.students, "student")}, on Parent Link.`);
}

/* ---------- Events Settings ---------- */

export async function settingsAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.settings, "change Events Settings");
    const has = (k: string) => fd.has(k);
    return saveEventsSettings(w.tx, w.ctx, {
      ...(has("weekends") ? { secondSaturdayOff: checked(fd, "secondSaturdayOff"), fourthSaturdayOff: checked(fd, "fourthSaturdayOff") } : {}),
      ...(has("ptmSlotMinutes") ? { ptmSlotMinutes: Number(str(fd, "ptmSlotMinutes")) } : {}),
      ...(has("ptmReminderHour") ? { ptmReminderHour: Number(str(fd, "ptmReminderHour")) } : {}),
      ...(has("ptmParentBooking") ? { ptmParentBooking: checked(fd, "ptmParentBooking") } : {}),
      ...(has("galleryRule") ? { galleryRule: str(fd, "galleryRule") } : {}),
      ...(has("feed") ? { feedOn: checked(fd, "feedOn") } : {}),
      ...(has("switch") && ["housesOn", "clubsOn", "sportsOn", "creditsOn", "dailyOn"].includes(str(fd, "switch")) ? { [str(fd, "switch")]: checked(fd, "on") } : {}),
    });
  }, (s) => (fd.has("switch") ? switchWords(str(fd, "switch"), checked(fd, "on")) : fd.has("feed") ? `Calendar feed ${s.feedOn ? "on. Staff can add it to Google or Outlook." : "off. Existing subscriptions stop updating."}` : fd.has("galleryRule") ? (s.galleryRule === "BLUR" ? "Students without photo consent are blurred in new albums." : "Photos with students without photo consent are left out of new albums.") : fd.has("ptmReminderHour") ? `PTM reminders go the day before at ${clock(s.ptmReminderHour * 60)}.` : fd.has("ptmParentBooking") ? (s.ptmParentBooking ? "Parents can book, change or cancel a PTM slot on Parent Link until the day before." : "Parents no longer book on Parent Link. The office books for them; booked slots still show.") : "Events Settings saved."));
}

function switchWords(key: string, on: boolean) {
  const words: Record<string, [string, string]> = {
    housesOn: ["Houses are on. The Houses tab shows in Co-curricular & Sports.", "Houses are off. The tab is hidden; points stay on record."],
    clubsOn: ["Clubs are on.", "Clubs are off. The tab is hidden; members stay on record."],
    sportsOn: ["Sports teams are on.", "Sports teams are off. The tab is hidden; records stay."],
    creditsOn: ["Activity credits are on. New achievements add credits.", "Activity credits are off. Totals stay on profiles."],
    dailyOn: ["Daily Activities is on for pre-primary classes.", "Daily Activities is off. Diaries already kept stay on record."],
  };
  return (words[key] ?? ["Saved.", "Saved."])[on ? 0 : 1];
}

const LISTS = ["eventTypes", "venues", "activityKinds", "dailyTypes"] as const;

export async function listAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.settings, "change Events Settings");
    const list = LISTS.find((l) => l === str(fd, "list")) ?? "eventTypes";
    const op = str(fd, "op") === "remove" ? "remove" : "add";
    return { v: await changeList(w.tx, w.ctx, list, op, str(fd, "value")), list, op };
  }, (r) => `${LIST_WORDS[r.list].replace(/^./, (c) => c.toUpperCase())} ${r.op === "add" ? "added" : "removed"}: ${r.v}`);
}

export async function creditsAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.settings, "change Events Settings");
    const n = Number(str(fd, "levels")) || 0;
    const num = (k: string) => { const v = str(fd, k); if (!/^\d+$/.test(v)) throw new EventsProblem("Credits are whole numbers from 0 to 500.", k); return Number(v); };
    await saveCredits(w.tx, w.ctx, Array.from({ length: n }, (_x, i) => num(`take_${i}`)), Array.from({ length: n }, (_x, i) => num(`win_${i}`)));
    return true;
  }, () => "Activity credits saved. They apply to achievements recorded from now on.");
}

/* ---------- Parent consent for events ---------- */

export async function officeConsentAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.events, "record parent consent");
    const answer = str(fd, "answer") === "DECLINED" ? "DECLINED" : "GIVEN";
    const studentIds = ids(fd, "studentIds");
    if (!studentIds.length) throw new EventsProblem("Choose the students.", "studentIds");
    let changed = 0;
    for (const studentId of studentIds) {
      const r = await recordConsent(w.tx, w.ctx, { eventId: id(fd, "eventId", "event"), studentId, answer, guardianId: null, how: "office" }, today(w.tz));
      if (r.changed) changed++;
    }
    return { changed, answer };
  }, (r) => (r.answer === "GIVEN" ? `Consent recorded for ${count(r.changed, "student")}. They are registered${r.changed ? "; any fee is added to their fees" : ""}.` : `Recorded: ${count(r.changed, "student")} not going. Nothing is charged.`));
}

export async function remindConsentAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.events, "send reminders");
    return remindConsent(w.tx, w.ctx, id(fd, "eventId", "event"), today(w.tz));
  }, (r) => `Reminder sent to ${count(r.people, "parent")} waiting for consent. Track it in Message History.`);
}

export async function renewFeedAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.settings, "change Events Settings");
    await renewFeed(w.tx, w.ctx);
    return true;
  }, () => "New calendar links made. The old links stop working.");
}
