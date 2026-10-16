"use client";

// One PTM for one child on Parent Link: the booked meeting, or the teachers
// who meet the child's class and their free times to book. The parent can
// change the time or cancel until the day before. In a staff preview the
// buttons do nothing.
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Users } from "lucide-react";
import { bookPtmSlot, cancelPtmSlot } from "@/app/p/[token]/ptm-actions";
import type { GuardianState } from "@/app/p/[token]/actions";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { cx } from "@/components/ui/cx";

export type PtmCardData = {
  ptmId: string; studentId: string; child: string; when: string; window: string; venue: string | null; breakWords: string | null; open: boolean; parentBooking: boolean; closesOn: string;
  teachers: { staffId: string; name: string; label: string; free: { id: string; time: string }[] }[];
  booked: { slotId: string; staffId: string; teacher: string; label: string; time: string; byOffice: boolean }[];
  canChange: boolean;
};

export function PtmBookingCard({ token, preview, c }: { token: string; preview: boolean; c: PtmCardData }) {
  const router = useRouter();
  const mine = c.booked[0] ?? null;
  const [mode, setMode] = useState<"view" | "pick" | "cancel">(mine ? "view" : "pick");
  const [teacher, setTeacher] = useState(mine?.staffId ?? c.teachers[0]?.staffId ?? "");
  const [slot, setSlot] = useState("");
  // The last answer from the server, shown under the card; after a change the page reloads its data.
  const [last, setLast] = useState<GuardianState>(null);
  const [, book] = useActionState<GuardianState, FormData>(async (prev, fd) => {
    const r = await bookPtmSlot(token, prev, fd);
    setLast(r);
    if (r?.ok) { setMode("view"); setSlot(""); router.refresh(); }
    return r;
  }, null);
  const [, cancel] = useActionState<GuardianState, FormData>(async (prev, fd) => {
    const r = await cancelPtmSlot(token, prev, fd);
    setLast(r);
    if (r?.ok) { setMode("pick"); setSlot(""); router.refresh(); }
    return r;
  }, null);

  const t = c.teachers.find((x) => x.staffId === teacher) ?? c.teachers[0];
  const picked = t?.free.find((s) => s.id === slot) ?? null;
  const facts = [c.window, c.venue, c.breakWords ? `Break ${c.breakWords}` : null].filter(Boolean).join(" · ");

  return (
    <section className="rounded-3xl bg-surface border border-line shadow-card p-5" aria-label={`PTM on ${c.when}`}>
      <div className="flex items-start gap-4">
        <span className={cx("w-12 h-12 rounded-2xl grid place-items-center shrink-0", mine ? "bg-ok/10 text-ok" : "bg-brand/10 text-brand")}><Users size={22} aria-hidden="true" /></span>
        <div className="flex-1 min-w-0">
          {mine ? <Pill tone="ok">Booked</Pill> : c.open ? <Pill tone="brand" dot>Book a time</Pill> : <Pill>{c.parentBooking ? "Booking closed" : "Booked by the school"}</Pill>}
          <p className="font-semibold text-[15px] mt-1.5">Parent–teacher meeting · {c.when}</p>
          <p className="text-[13px] text-ink3">{facts}</p>
        </div>
      </div>

      {mine && mode !== "pick" && (
        <div className="mt-4 rounded-2xl p-3.5 flex items-start gap-3 bg-ok/10">
          <span className="w-9 h-9 rounded-full grid place-items-center shrink-0 bg-ok/15 text-ok"><Check size={18} strokeWidth={2.6} aria-hidden="true" /></span>
          <div className="min-w-0 text-[14px]">
            {c.booked.map((b) => (
              <p key={b.slotId} className="font-semibold">{b.time} with {b.teacher}</p>
            ))}
            <p className="text-[13px] text-ink3 mt-0.5">{mine.label}{c.booked.length === 1 && mine.byOffice ? " · booked by the school" : ""}. Please come 5 minutes early.</p>
          </div>
        </div>
      )}

      {mine && mode === "view" && (
        c.canChange && !preview ? (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <button type="button" onClick={() => { setMode("pick"); setTeacher(mine.staffId); }} className="text-[13px] font-semibold text-brand hover:underline min-h-11">Change the time</button>
            <button type="button" onClick={() => setMode("cancel")} className="text-[13px] font-semibold text-bad hover:underline min-h-11">Cancel the meeting</button>
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-ink3">{!c.parentBooking ? "The school books PTM times. To change, please call the school." : !c.open ? "Changes closed the day before. To change, please call the school." : preview ? "Parents can change the time or cancel here until " + c.closesOn + "." : "To change these meetings, please call the school."}</p>
        )
      )}

      {mine && mode === "cancel" && (
        <form action={cancel} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="slotId" value={mine.slotId} />
          <input type="hidden" name="studentId" value={c.studentId} />
          <p className="text-[14px] text-ink2">Cancel {c.child}’s meeting with {mine.teacher} at <b className="font-semibold text-ink">{mine.time}</b>? The time goes back to other parents.</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="ghost" size="lg" className="w-full" onClick={() => setMode("view")}>Keep it</Button>
            <SubmitButton variant="danger" size="lg" className="w-full" pendingText="Cancelling">Cancel meeting</SubmitButton>
          </div>
        </form>
      )}

      {mode === "pick" && c.open && (
        <form action={book} className="mt-4 flex flex-col gap-3.5">
          <input type="hidden" name="studentId" value={c.studentId} />
          <input type="hidden" name="slotId" value={slot} />
          {c.teachers.length > 1 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-[13px] font-semibold text-ink2 mb-1.5">Meet</legend>
              {c.teachers.map((x) => (
                <label key={x.staffId} className={cx("flex items-center gap-3 rounded-2xl border px-3.5 min-h-12 py-2 cursor-pointer", teacher === x.staffId ? "border-brand ring-1 ring-brand bg-brand/[.04]" : "border-line")}>
                  <input type="radio" name="teacher" value={x.staffId} checked={teacher === x.staffId} onChange={() => { setTeacher(x.staffId); setSlot(""); }} className="w-4 h-4 accent-[var(--color-brand)]" />
                  <span className="min-w-0"><b className="font-semibold text-[14px] block truncate">{x.name}</b><span className="text-[12.5px] text-ink3 block truncate">{x.label} · {x.free.length ? `${x.free.length} free ${x.free.length === 1 ? "time" : "times"}` : "fully booked"}</span></span>
                </label>
              ))}
            </fieldset>
          )}
          {t && (
            <fieldset>
              <legend className="text-[13px] font-semibold text-ink2 mb-2 flex items-center gap-1.5"><CalendarClock size={15} aria-hidden="true" />{c.teachers.length > 1 ? `Free times with ${t.name}` : `Free times with ${t.name}, ${t.label}`}</legend>
              {t.free.length ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {t.free.map((s) => (
                    <label key={s.id} className={cx("h-11 rounded-xl border grid place-items-center text-[14px] font-semibold tnum cursor-pointer transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand", slot === s.id ? "bg-brand text-brandink border-brand" : "border-line hover:border-brand")}>
                      <input type="radio" name="time" value={s.id} checked={slot === s.id} onChange={() => setSlot(s.id)} className="sr-only" />
                      {s.time.replace(/ (AM|PM)$/, "")}<span className="sr-only"> {s.time.slice(-2)}</span>
                    </label>
                  ))}
                </div>
              ) : <p className="text-[13.5px] text-ink3">Every time with {t.name} is booked. {c.teachers.length > 1 ? "Pick another teacher, or call the school." : "Please call the school."}</p>}
            </fieldset>
          )}
          {!c.teachers.length && <p className="text-[13.5px] text-ink3">No teacher meets parents of {c.child}’s class at this PTM. Please call the school.</p>}
          <p className="text-[12.5px] text-ink3">You can change the time or cancel until {c.closesOn}.</p>
          {preview ? (
            <Button size="lg" className="w-full" disabled title="Preview only">Book this time</Button>
          ) : (
            <div className={cx("grid gap-2.5", mine ? "grid-cols-2" : "grid-cols-1")}>
              {mine && <Button variant="ghost" size="lg" className="w-full" onClick={() => { setMode("view"); setSlot(""); }}>Keep {mine.time}</Button>}
              {picked ? <SubmitButton size="lg" className="w-full" pendingText="Booking">{mine ? `Change to ${picked.time}` : `Book ${picked.time}`}</SubmitButton>
                : <Button size="lg" className="w-full" disabled>{mine ? "Pick a new time" : "Pick a time"}</Button>}
            </div>
          )}
        </form>
      )}

      {!mine && !c.open && <p className="mt-3 text-[13px] text-ink3">{c.parentBooking ? "Booking closed the day before." : "The school books PTM times."} To meet the teacher, please call the school.</p>}
      {last && !last.ok && <p role="alert" className="mt-3 text-[13px] text-bad">{last.message}</p>}
      {last?.ok && <p role="status" className="mt-3 text-[13px] text-ok font-semibold">{last.message}</p>}
    </section>
  );
}
