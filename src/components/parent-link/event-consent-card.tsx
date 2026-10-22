"use client";

// Parent consent for one event and one child on Parent Link (apps.jsx
// ConsentCard): Give consent (confirmed by a one-time code) or Not this time.
import { useActionState, useState } from "react";
import { Check, FerrisWheel, X } from "lucide-react";
import { askEventConsent, confirmEventConsentCode, declineEvent } from "@/app/p/[token]/event-actions";
import type { GuardianState } from "@/app/p/[token]/actions";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { cx } from "@/components/ui/cx";
import { useT } from "@/lib/i18n/client";

const codeCls = "h-14 w-full rounded-2xl bg-surface border border-line px-4 text-center text-[24px] font-semibold tnum tracking-[0.45em] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15";

export type EventConsentCardData = {
  eventId: string; studentId: string; child: string; name: string; when: string; details: string[]; replyBy: string | null; answer: "GIVEN" | "DECLINED" | null; open: boolean;
};

export function EventConsentCard({ token, preview, maskedPhone, c }: { token: string; preview: boolean; maskedPhone: string; c: EventConsentCardData }) {
  const t = useT();
  const [state, setState] = useState<"view" | "code">("view");
  const [changing, setChanging] = useState(false);
  const [answer, setAnswer] = useState(c.answer);
  const [asked, ask] = useActionState<GuardianState, FormData>(askEventConsent.bind(null, token), null);
  const [confirmed, confirm] = useActionState<GuardianState, FormData>(async (s, fd) => {
    const r = await confirmEventConsentCode(token, s, fd);
    if (r?.ok) { setAnswer("GIVEN"); setChanging(false); setState("view"); }
    return r;
  }, null);
  const [declined, decline] = useActionState<GuardianState, FormData>(async (s, fd) => {
    const r = await declineEvent(token, s, fd);
    if (r?.ok) { setAnswer("DECLINED"); setChanging(false); }
    return r;
  }, null);
  const asking = !answer || changing;
  const hidden = <><input type="hidden" name="eventId" value={c.eventId} /><input type="hidden" name="studentId" value={c.studentId} /></>;
  return (
    <section className="rounded-3xl bg-surface border border-line shadow-card p-5">
      <div className="flex items-start gap-4">
        <span className={cx("w-12 h-12 rounded-2xl grid place-items-center shrink-0", answer === "GIVEN" && !changing ? "bg-ok/10 text-ok" : answer === "DECLINED" && !changing ? "bg-sunken text-ink3" : "bg-brand/10 text-brand")}><FerrisWheel size={22} aria-hidden="true" /></span>
        <div className="flex-1 min-w-0">
          {answer === "GIVEN" && !changing ? <Pill tone="ok">{t("Consent given")}</Pill> : answer === "DECLINED" && !changing ? <Pill>{t("Not going")}</Pill> : <Pill tone="warn" dot>{t("Consent needed")}</Pill>}
          <p className="font-semibold text-[15px] mt-1.5">{c.name}</p>
          <p className="text-[13px] text-ink3">{c.when}</p>
        </div>
      </div>

      {asking && state === "view" && c.open && (
        <>
          <ul className="mt-4 flex flex-col gap-2.5 text-[14px]">
            {c.details.map((d) => <li key={d} className="flex gap-2.5 text-ink2"><Check size={17} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" />{t.any(d)}</li>)}
          </ul>
          {c.replyBy && <p className="mt-3 text-[12.5px] text-ink3">{t("Please reply by {date}", { date: c.replyBy })}.</p>}
          {preview ? (
            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <Button size="lg" className="w-full" icon={Check} disabled title={t("Preview only")}>{t("Give consent")}</Button>
              <Button size="lg" variant="secondary" className="w-full" disabled title={t("Preview only")}>{t("Not this time")}</Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <form action={(fd) => { ask(fd); setState("code"); }}>
                {hidden}
                <SubmitButton size="lg" className="w-full" pendingText={t("Sending code")}><Check size={18} aria-hidden="true" />{t("Give consent")}</SubmitButton>
              </form>
              <form action={decline}>
                {hidden}
                <SubmitButton size="lg" variant="secondary" className="w-full">{t("Not this time")}</SubmitButton>
              </form>
            </div>
          )}
          {((asked && !asked.ok) || (declined && !declined.ok)) && <p role="alert" className="mt-2 text-[13px] text-bad">{t.any((asked && !asked.ok ? asked : declined)!.message ?? "")}</p>}
        </>
      )}

      {asking && state === "code" && (
        asked && !asked.ok ? (
          <div className="mt-4 flex flex-col gap-2">
            <p role="alert" className="text-[13px] text-bad">{t.any(asked.message ?? "")}</p>
            <Button variant="ghost" onClick={() => setState("view")}>{t("Back")}</Button>
          </div>
        ) : (
          <form action={(fd) => { confirm(fd); }} className="mt-4 flex flex-col gap-3">
            <p className="text-[14px] text-ink2">{t("You are saying yes for {title}. To confirm, enter the 6-digit code sent to {phone}.", { title: c.child, phone: maskedPhone })}</p>
            {asked?.notSent && <p role="status" className="text-[13px] text-warn">{t.any(asked.message ?? "")}</p>}
            <label htmlFor={`ec-${c.eventId}-${c.studentId}`} className="sr-only">{t("6-digit code")}</label>
            <input id={`ec-${c.eventId}-${c.studentId}`} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required className={codeCls} />
            {confirmed && !confirmed.ok && <p role="alert" className="text-[13px] text-bad">{t.any(confirmed.message ?? "")}</p>}
            <div className="grid grid-cols-2 gap-2.5 mt-1">
              <Button variant="ghost" size="lg" className="w-full" onClick={() => setState("view")}>{t("Back")}</Button>
              <SubmitButton size="lg" className="w-full" pendingText={t("Checking")}>{t("Confirm")}</SubmitButton>
            </div>
          </form>
        )
      )}

      {!asking && (
        <div className="mt-4">
          <div className={cx("rounded-2xl p-3.5 flex items-start gap-3", answer === "GIVEN" ? "bg-ok/10" : "bg-sunken/60")}>
            <span className={cx("w-9 h-9 rounded-full grid place-items-center shrink-0", answer === "GIVEN" ? "bg-ok/15 text-ok" : "bg-surface text-ink3")}>{answer === "GIVEN" ? <Check size={18} strokeWidth={2.6} aria-hidden="true" /> : <X size={18} strokeWidth={2.6} aria-hidden="true" />}</span>
            <div className="min-w-0 text-[14px]" role="status">
              <p className="font-semibold">{answer === "GIVEN" ? t("{child} is going to {event}", { child: c.child, event: c.name }) : t("{child} is not going", { child: c.child })}</p>
              <p className="text-[13px] text-ink3 mt-0.5">{answer === "GIVEN" ? t("Confirmed with a one-time code. Any fee is in fees due.") : t("Saved. Nothing is charged.")}</p>
            </div>
          </div>
          {c.open && !preview && <button type="button" onClick={() => { setChanging(true); setState("view"); }} className="mt-3 text-[13px] font-semibold text-brand hover:underline h-8">{t("Change my answer")}{c.replyBy ? ` (${t("until {date}", { date: c.replyBy })})` : ""}</button>}
        </div>
      )}
      {asking && !c.open && <p className="mt-3 text-[13px] text-ink3">{t("The reply-by date has passed. Please call the school.")}</p>}
    </section>
  );
}
