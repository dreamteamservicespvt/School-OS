// Parent Link, Events & Calendar (18 "Connects to": Parent Link shows events,
// the PTM slot and photos). Read only (rule 31): the chosen child's booked PTM
// slots, the coming events for their class with whether they are registered
// (an event fee is paid in the Fees section, where it appears as its own row),
// the next holidays, and recent albums the school shared. Events that ask
// for parent consent (trips and outings) show a consent card first, with
// Give consent (confirmed by a one-time code) and Not this time. Imported by
// src/lib/parent-link/section-list.ts.
import "server-only";

import { CalendarDays, Images, Sun, Users } from "lucide-react";
import { registerSection, type GuardianView } from "../parent-link/sections";
import { formatRupees } from "../format";
import { maskPhone } from "../parent-link/links";
import { EventConsentCard, type EventConsentCardData } from "@/components/parent-link/event-consent-card";
import { consentForms } from "./consent";
import { albumUrl } from "./settings";
import { CLOSING, clock, dayOf, isoOf, longDay, timeSpan } from "./words";

type Data = {
  consents: EventConsentCardData[];
  maskedPhone: string;
  ptm: { id: string; when: string; teacher: string; label: string; venue: string | null }[];
  events: { id: string; name: string; when: string; venue: string | null; registered: boolean; fee: string | null }[];
  holidays: { id: string; title: string; when: string }[];
  albums: { id: string; name: string; when: string; url: string }[];
};

function EventsSection({ data, view }: { data: Data; view: GuardianView }) {
  const row = "flex items-start gap-3 py-2.5 border-t border-line/70 first:border-0";
  return (
    <div className="flex flex-col gap-1 text-[14px]">
      {data.consents.length > 0 && (
        <div className="flex flex-col gap-3 mb-3">
          {data.consents.map((c) => <EventConsentCard key={c.eventId} token={view.token} preview={view.preview} maskedPhone={data.maskedPhone} c={c} />)}
        </div>
      )}
      <ul>
        {data.ptm.map((p) => (
          <li key={p.id} className={row}>
            <Users size={18} className="text-brand mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0"><b className="font-semibold block">PTM: {p.when}</b><span className="text-[13px] text-ink2">With {p.teacher} ({p.label}){p.venue ? `, ${p.venue}` : ""}</span></span>
          </li>
        ))}
        {data.events.map((e) => (
          <li key={e.id} className={row}>
            <CalendarDays size={18} className="text-ok mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0"><b className="font-semibold block">{e.name}</b>
              <span className="text-[13px] text-ink2">{e.when}{e.venue ? ` · ${e.venue}` : ""}{e.registered ? " · Registered" : ""}{e.registered && e.fee ? ` · Fee ${e.fee}, in Fees due` : ""}</span></span>
          </li>
        ))}
        {data.holidays.map((h) => (
          <li key={h.id} className={row}>
            <Sun size={18} className="text-bad mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0"><b className="font-semibold block">{h.title}</b><span className="text-[13px] text-ink2">{h.when} · school closed</span></span>
          </li>
        ))}
        {data.albums.map((a) => (
          <li key={a.id} className={row}>
            <Images size={18} className="text-info mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0"><a href={a.url} className="font-semibold block text-brand hover:underline">Photos: {a.name}</a><span className="text-[13px] text-ink2">{a.when}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

registerSection<Data>({
  key: "events",
  label: "Events and PTM",
  description: "The child's PTM slot, coming events and holidays, and shared photos",
  order: 60,
  load: async (tx, ctx, view) => {
    const now = new Date();
    const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: view.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const today = dayOf(todayIso);
    const soon = new Date(today.getTime() + 45 * 86_400_000);
    const childId = view.child.id;
    const classId = view.child.classId;

    const slots = await tx.ptmSlot.findMany({ where: { studentId: childId, ptm: { archivedAt: null, date: { gte: today } } }, include: { ptm: true }, orderBy: { startMin: "asc" } });
    const staff = slots.length ? await tx.staff.findMany({ where: { id: { in: slots.map((s) => s.staffId) } }, select: { id: true, fullName: true } }) : [];
    const labels = slots.length ? await tx.ptmTeacher.findMany({ where: { ptmId: { in: slots.map((s) => s.ptmId) } }, select: { ptmId: true, staffId: true, label: true } }) : [];

    const events = await tx.event.findMany({
      where: { archivedAt: null, cancelledAt: null, date: { gte: today, lte: soon }, OR: [{ audienceKind: { in: ["school", "parents"] } }, ...(classId ? [{ audienceKind: "classes", classIds: { has: classId } }] : [])] },
      orderBy: [{ date: "asc" }, { startMin: "asc" }], take: 6,
    });
    const regs = events.length ? await tx.eventRegistration.findMany({ where: { studentId: childId, eventId: { in: events.map((e) => e.id) }, withdrawnAt: null }, select: { eventId: true } }) : [];
    const reg = new Set(regs.map((r) => r.eventId));

    // Events asking this child's parent for consent.
    const asks = await consentForms(tx, childId, classId, todayIso);
    const guardian = asks.length ? await tx.guardian.findUnique({ where: { id: view.guardianId }, select: { phone: true } }) : null;
    const consents: EventConsentCardData[] = asks.map(({ e, answer }) => ({
      eventId: e.id, studentId: childId, child: view.child.firstName, name: e.name, answer,
      when: [longDay(isoOf(e.date)), timeSpan(e.startMin, e.endMin), e.audienceLabel, e.feePaise ? formatRupees(e.feePaise) : null].filter(Boolean).join(" · "),
      details: [
        ...(e.venue ? [e.venue] : []),
        ...(e.description ? [e.description] : []),
        e.feePaise ? `${formatRupees(e.feePaise)} is added to ${view.child.firstName}’s fees when you say yes. Pay it here like any fee.` : "There is no fee.",
      ],
      replyBy: e.consentBy ? longDay(isoOf(e.consentBy)) : null,
      open: !e.consentBy || isoOf(e.consentBy) >= todayIso,
    }));

    const holidays = await tx.calendarEntry.findMany({
      where: { archivedAt: null, type: { in: [...CLOSING] }, attendanceOn: false, endDate: { gte: today }, startDate: { lte: soon } },
      orderBy: { startDate: "asc" }, take: 3,
    });
    const visible = holidays.filter((h) => !h.classIds.length || (classId && h.classIds.includes(classId)));

    const albums = await tx.album.findMany({
      where: { status: "PUBLISHED", publishedAt: { gte: new Date(now.getTime() - 60 * 86_400_000) }, OR: [{ visibleTo: "EVERYONE" }, ...(classId ? [{ visibleTo: "CLASSES", classIds: { has: classId } }] : [])] },
      orderBy: { date: "desc" }, take: 3,
    });

    const data: Data = {
      consents, maskedPhone: guardian?.phone ? maskPhone(guardian.phone) : "your registered mobile",
      ptm: slots.map((s) => ({
        id: s.id, when: `${longDay(isoOf(s.ptm.date))}, ${clock(s.startMin)}`,
        teacher: staff.find((x) => x.id === s.staffId)?.fullName ?? "the teacher",
        label: labels.find((l) => l.ptmId === s.ptmId && l.staffId === s.staffId)?.label ?? "Teacher", venue: s.ptm.venue,
      })),
      events: events.filter((e) => !asks.some((a) => a.e.id === e.id)).map((e) => ({ id: e.id, name: e.name, when: `${longDay(isoOf(e.date))}, ${timeSpan(e.startMin, e.endMin)}`, venue: e.venue, registered: reg.has(e.id), fee: e.feePaise ? formatRupees(e.feePaise) : null })),
      holidays: visible.map((h) => ({ id: h.id, title: h.title, when: isoOf(h.startDate) === isoOf(h.endDate) ? longDay(isoOf(h.startDate)) : `${longDay(isoOf(h.startDate))} to ${longDay(isoOf(h.endDate))}` })),
      albums: albums.map((a) => ({ id: a.id, name: a.name, when: longDay(isoOf(a.date)), url: albumUrl(a.schoolId, a.id, a.shareVersion) })),
    };
    if (!data.consents.length && !data.ptm.length && !data.events.length && !data.holidays.length && !data.albums.length) return null;
    return data;
  },
  Render: EventsSection,
});
