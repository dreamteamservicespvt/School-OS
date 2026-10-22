// The parent's own page for an online application (no login): the number,
// where it stands in plain words, and the application fee to pay online.
// Only someone holding the link's token can open it.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, CircleCheck, Clock } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format";
import { UUID_RE } from "@/lib/admission/act";
import { applicationStatus, checkStatusToken, publicForm, schoolByCode } from "@/lib/admission/public";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";
import { ApplyNotice, ApplyShell } from "../../shell";
import { PayButton } from "./pay-button";
import { schoolPageLanguage } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your application", robots: { index: false, follow: false }, referrer: "no-referrer" };

const STEPS = ["Received", "Papers checked", "Decision", "Admitted"] as const;
const WHERE: Record<string, { step: number; words: string; tone: "info" | "ok" | "warn" | "bad" | "neutral" }> = {
  SUBMITTED: { step: 0, words: "Received. The school will check it and call you.", tone: "info" },
  SUBMITTED_ONLINE: { step: 0, words: "Received. The school will check it and call you.", tone: "info" },
  REVIEWED: { step: 1, words: "Checked by the school. Papers are next.", tone: "info" },
  DOCUMENTS: { step: 1, words: "The school is checking the papers.", tone: "info" },
  TEST_INTERVIEW: { step: 1, words: "A test or interview is next. The school will tell you the date.", tone: "info" },
  DECISION: { step: 2, words: "Waiting for the school’s decision.", tone: "warn" },
  WAITING_LIST: { step: 2, words: "On the waiting list. The school will call you if a seat frees up.", tone: "warn" },
  APPROVED: { step: 3, words: "Approved. The school will call you to confirm the admission.", tone: "ok" },
  ADMITTED: { step: 4, words: "Admitted. Welcome to the school.", tone: "ok" },
  REJECTED: { step: -1, words: "Not approved this time. The school has sent you a message.", tone: "bad" },
  WITHDRAWN: { step: -1, words: "Withdrawn.", tone: "neutral" },
};

export default async function StatusPage({ params, searchParams }: { params: Promise<{ code: string; id: string }>; searchParams: Promise<{ t?: string; new?: string }> }) {
  const { code, id } = await params;
  const { t: token, new: isNew } = await searchParams;
  const school = await schoolByCode(decodeURIComponent(code));
  if (!school || !UUID_RE.test(id)) notFound();
  const page = await schoolPageLanguage(school.id);
  const { t } = page;
  if (!token || !checkStatusToken(school.id, id, token)) {
    return <ApplyShell schoolName={school.name} page={page}><ApplyNotice title={t("This link is not valid")}>{t("Please use the link the school sent you, or call the school office.")}</ApplyNotice></ApplyShell>;
  }
  const [a, form] = await Promise.all([applicationStatus(school.id, id), publicForm(school.id)]);
  if (!a) notFound();
  const where = WHERE[a.stage] ?? WHERE.SUBMITTED;
  const tz = form.school.timeZone;
  const canPay = a.onlinePayment && a.feeDue && (a.fee.key === "due" || a.fee.key === "waiting") && where.step >= 0;
  return (
    <ApplyShell schoolName={form.school.name} sub={t("Your application")} page={page}>
      {isNew && (
        <div className="flex flex-col items-center text-center mb-5">
          <span className="w-14 h-14 rounded-full bg-ok text-surface grid place-items-center shadow-pop"><Check size={30} strokeWidth={3} aria-hidden="true" /></span>
          <h1 className="font-display text-[22px] font-semibold mt-3">{t("Application sent")}</h1>
          <p className="text-[14px] text-ink3 mt-1">{a.feeDue ? t("Keep this page. The link lets you see where your application stands and pay the fee.") : t("Keep this page. The link lets you see where your application stands.")}</p>
        </div>
      )}
      <Card className="p-4 md:p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3 justify-between">
          <div className="min-w-0">
            {!isNew && <h1 className="sr-only">{t("Your application")}</h1>}
            <p className="font-semibold text-[17px] leading-tight">{a.fullName}</p>
            <p className="text-[13px] text-ink3">{a.className} · <span className="font-mono">{a.applicationNo}</span> · {t("sent {date}", { date: formatDate(a.createdAt, tz) })}</p>
          </div>
          <Pill tone={where.tone} className="shrink-0">{where.step >= 4 ? t("Admitted") : where.step < 0 ? (a.stage === "REJECTED" ? t("Not approved") : t("Withdrawn")) : t("In progress")}</Pill>
        </div>
        <p className="text-[14.5px]">{t.any(where.words)}</p>
        {where.step >= 0 && (
          <ol className="grid grid-cols-4 gap-1.5" aria-label={t("Steps")}>
            {STEPS.map((s, i) => {
              const done = i < where.step || where.step >= 4;
              const now = i === where.step;
              return (
                <li key={s} className="flex flex-col gap-1.5">
                  <span className={cx("h-1.5 rounded-full", done ? "bg-ok" : now ? "bg-brand" : "bg-sunken")} aria-hidden="true" />
                  <span className={cx("text-[11.5px] leading-tight", now ? "font-semibold text-ink" : "text-ink3")}>{t.any(s)}{done && <span className="sr-only"> ({t("done")})</span>}{now && <span className="sr-only"> ({t("now")})</span>}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {a.feeDue !== null && (
        <Card className="p-4 md:p-5 mt-4 flex flex-col gap-3">
          <p className="font-semibold text-[15px]">{t("Application fee")}</p>
          {a.fee.key === "paid" ? (
            <p className="text-[14px] text-ok font-semibold flex items-center gap-2"><CircleCheck size={18} aria-hidden="true" />{t("Paid")}</p>
          ) : (
            <>
              <p className="text-[14px] text-ink2">{t("{amount} to pay.", { amount: a.feeDue })}{a.fee.key === "waiting" && <span className="flex items-center gap-1.5 text-ink3 text-[13px] mt-1"><Clock size={14} aria-hidden="true" />{t("A payment was started. If money was taken, the receipt appears here once Razorpay confirms it.")}</span>}</p>
              {canPay ? <PayButton code={form.school.code} id={id} token={token} amount={a.feeDue} /> : <p className="text-[13.5px] text-ink3">{t("Please pay at the school office.")}</p>}
            </>
          )}
          {a.receipts.length > 0 && (
            <ul className="border-t border-line/70 pt-3 flex flex-col gap-1.5 text-[13.5px]">
              {a.receipts.map((r) => <li key={r.receiptNo ?? String(r.at)} className="flex justify-between gap-3"><span>{t("Receipt")} <span className="font-mono">{r.receiptNo}</span>{r.at ? ` · ${formatDateTime(r.at, tz)}` : ""}</span><b className="font-semibold tnum">{r.amount}</b></li>)}
            </ul>
          )}
        </Card>
      )}
      {form.school.phone && <p className="text-[13px] text-ink3 mt-5 text-center">{t("Questions? Call the school office on")} <a className="font-semibold text-brand tnum" href={`tel:${form.school.phone}`}>{form.school.phone}</a>.</p>}
    </ApplyShell>
  );
}
