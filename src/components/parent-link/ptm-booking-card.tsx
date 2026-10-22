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
import { KeepCheck } from "@/components/ui/keep-select";
import { useT } from "@/lib/i18n/client";

export type PtmCardData = {
  ptmId: string; studentId: string; child: string; when: string; window: string; venue: string | null; breakWords: string | null; open: boolean; parentBooking: boolean; closesOn: string;
  teachers: { staffId: string; name: string; label: string; free: { id: string; time: string }[] }[];
  booked: { slotId: string; staffId: string; teacher: string; label: string; time: string; byOffice: boolean }[];
  canChange: boolean;
};

export function PtmBookingCard({ token, preview, c }: { token: string; preview: boolean; c: PtmCardData }) {
  const t = useT();
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

  const tch = c.teachers.find((x) => x.staffId === teacher) ?? c.teachers[0];
  const picked = tch?.free.find((s) => s.id === slot) ?? null;
  const facts = [c.window, c.venue, c.breakWords ? t("Break {time}", { time: c.breakWords }) : null].filter(Boolean).join(" · ");

  return (
    <section className="rounded-3xl bg-surface border border-line shadow-card p-5" aria-label={t("PTM on {date}", { date: c.when })}>
      <div className="flex items-start gap-4">
        <span className={cx("w-12 h-12 rounded-2xl grid place-items-center shrink-0", mine ? "bg-ok/10 text-ok" : "bg-brand/10 text-brand")}><Users size={22} aria-hidden="true" /></span>
        <div className="flex-1 min-w-0">
          {mine ? <Pill tone="ok">{t("Booked")}</Pill> : c.open ? <Pill tone="brand" dot>{t("Book a time")}</Pill> : <Pill>{c.parentBooking ? t("Booking closed") : t("Booked by the school")}</Pill>}
          <p className="font-semibold text-[15px] mt-1.5">{t("Parent–teacher meeting")} · {c.when}</p>
          <p className="text-[13px] text-ink3">{facts}</p>
        </div>
      </div>

      {mine && mode !== "pick" && (
        <div className="mt-4 rounded-2xl p-3.5 flex items-start gap-3 bg-ok/10">
          <span className="w-9 h-9 rounded-full grid place-items-center shrink-0 bg-ok/15 text-ok"><Check size={18} strokeWidth={2.6} aria-hidden="true" /></span>
          <div className="min-w-0 text-[14px]">
            {c.booked.map((b) => (
              <p key={b.slotId} className="font-semibold">{t("{time} with {teacher}", { time: b.time, teacher: b.teacher })}</p>
            ))}
            <p className="text-[13px] text-ink3 mt-0.5">{t.any(mine.label)}{c.booked.length === 1 && mine.byOffice ? ` · ${t("booked by the school")}` : ""}. {t("Please come 5 minutes early.")}</p>
          </div>
        </div>
      )}

      {mine && mode === "view" && (
        c.canChange && !preview ? (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <button type="button" onClick={() => { setMode("pick"); setTeacher(mine.staffId); }} className="text-[13px] font-semibold text-brand hover:underline min-h-11">{t("Change the time")}</button>
            <button type="button" onClick={() => setMode("cancel")} className="text-[13px] font-semibold text-bad hover:underline min-h-11">{t("Cancel the meeting")}</button>
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-ink3">{!c.parentBooking ? t("The school books PTM times. To change, please call the school.") : !c.open ? t("Changes closed the day before. To change, please call the school.") : preview ? t("Parents can change the time or cancel here until {date}.", { date: c.closesOn }) : t("To change these meetings, please call the school.")}</p>
        )
      )}

      {mine && mode === "cancel" && (
        <form action={cancel} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="slotId" value={mine.slotId} />
          <input type="hidden" name="studentId" value={c.studentId} />
          <p className="text-[14px] text-ink2">{t("Cancel {child}’s meeting with {teacher} at {time}? The time goes back to other parents.", { child: c.child, teacher: mine.teacher, time: mine.time })}</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="ghost" size="lg" className="w-full" onClick={() => setMode("view")}>{t("Keep it")}</Button>
            <SubmitButton variant="danger" size="lg" className="w-full" pendingText={t("Cancelling")}>{t("Cancel meeting")}</SubmitButton>
          </div>
        </form>
      )}

      {mode === "pick" && c.open && (
        <form action={book} className="mt-4 flex flex-col gap-3.5">
          <input type="hidden" name="studentId" value={c.studentId} />
          <input type="hidden" name="slotId" value={slot} />
          {c.teachers.length > 1 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-[13px] font-semibold text-ink2 mb-1.5">{t("Meet")}</legend>
              {c.teachers.map((x) => (
                <label key={x.staffId} className={cx("flex items-center gap-3 rounded-2xl border px-3.5 min-h-12 py-2 cursor-pointer", teacher === x.staffId ? "border-brand ring-1 ring-brand bg-brand/[.04]" : "border-line")}>
                  <KeepCheck type="radio" name="teacher" value={x.staffId} checked={teacher === x.staffId} onChange={() => { setTeacher(x.staffId); setSlot(""); }} className="w-4 h-4 accent-[var(--color-brand)]" />
                  <span className="min-w-0"><b className="font-semibold text-[14px] block truncate">{x.name}</b><span className="text-[12.5px] text-ink3 block truncate">{t.any(x.label)} · {x.free.length ? (x.free.length === 1 ? t("1 free time") : t("{n} free times", { n: x.free.length })) : t("fully booked")}</span></span>
                </label>
              ))}
            </fieldset>
          )}
          {tch && (
            <fieldset>
              <legend className="text-[13px] font-semibold text-ink2 mb-2 flex items-center gap-1.5"><CalendarClock size={15} aria-hidden="true" />{c.teachers.length > 1 ? t("Free times with {name}", { name: tch.name }) : t("Free times with {name}", { name: `${tch.name}, ${t.any(tch.label)}` })}</legend>
              {tch.free.length ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {tch.free.map((s) => (
                    <label key={s.id} className={cx("h-11 rounded-xl border grid place-items-center text-[14px] font-semibold tnum cursor-pointer transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand", slot === s.id ? "bg-brand text-brandink border-brand" : "border-line hover:border-brand")}>
                      <KeepCheck type="radio" name="time" value={s.id} checked={slot === s.id} onChange={() => setSlot(s.id)} className="sr-only" />
                      {s.time.replace(/ (AM|PM)$/, "")}<span className="sr-only"> {s.time.slice(-2)}</span>
                    </label>
                  ))}
                </div>
              ) : <p className="text-[13.5px] text-ink3">{t("Every time with {name} is booked.", { name: tch.name })} {c.teachers.length > 1 ? t("Pick another teacher, or call the school.") : t("Please call the school.")}</p>}
            </fieldset>
          )}
          {!c.teachers.length && <p className="text-[13.5px] text-ink3">{t("No teacher meets parents of {child}’s class at this PTM. Please call the school.", { child: c.child })}</p>}
          <p className="text-[12.5px] text-ink3">{t("You can change the time or cancel until {date}.", { date: c.closesOn })}</p>
          {preview ? (
            <Button size="lg" className="w-full" disabled title={t("Preview only")}>{t("Book this time")}</Button>
          ) : (
            <div className={cx("grid gap-2.5", mine ? "grid-cols-2" : "grid-cols-1")}>
              {mine && <Button variant="ghost" size="lg" className="w-full" onClick={() => { setMode("view"); setSlot(""); }}>{t("Keep {time}", { time: mine.time })}</Button>}
              {picked ? <SubmitButton size="lg" className="w-full" pendingText={t("Booking")}>{mine ? t("Change to {time}", { time: picked.time }) : t("Book {time}", { time: picked.time })}</SubmitButton>
                : <Button size="lg" className="w-full" disabled>{mine ? t("Pick a new time") : t("Pick a time")}</Button>}
            </div>
          )}
        </form>
      )}

      {!mine && !c.open && <p className="mt-3 text-[13px] text-ink3">{c.parentBooking ? t("Booking closed the day before.") : t("The school books PTM times.")} {t("To meet the teacher, please call the school.")}</p>}
      {last && !last.ok && <p role="alert" className="mt-3 text-[13px] text-bad">{t.any(last.message ?? "")}</p>}
      {last?.ok && <p role="status" className="mt-3 text-[13px] text-ok font-semibold">{t.any(last.message ?? "")}</p>}
    </section>
  );
}
