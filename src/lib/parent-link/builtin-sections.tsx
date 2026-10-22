// Communication's own sections on Parent Link: Critical notices, notices and
// consent forms. Fee Management, Attendance and Examination add theirs the
// same way (see ./sections.ts).
import "server-only";

import { registerSection, type GuardianView } from "./sections";
import { noticesForGuardian, markSeenByGuardian } from "../communication/notices";
import { consentWording, currentConsentTexts, standingConsents, type ConsentTextRow } from "./consent";
import { maskPhone } from "./links";
import { formatDate } from "../format";
import { CriticalNotices, NoticeList, type NoticeRow } from "@/components/parent-link/notices-section";
import { ConsentForm } from "@/components/parent-link/consent-form";
import type { SchoolContext, Tx } from "../db";
import { Check, FileSignature, ShieldCheck, X } from "lucide-react";
import { Pill } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";
import { makeT } from "../i18n/server";

async function noticesFor(tx: Tx, ctx: SchoolContext, view: GuardianView, children: GuardianView["children"]) {
  const rows = await noticesForGuardian(tx, ctx, children);
  return rows as NoticeRow[];
}

async function seen(tx: Tx, ctx: SchoolContext, view: GuardianView, rows: NoticeRow[]) {
  if (view.preview) return;
  for (const n of rows) await markSeenByGuardian(tx, ctx, n.id, view.guardianId);
}

registerSection<NoticeRow[]>({
  key: "notices-critical",
  switchKey: "notices",
  label: "Critical notices",
  description: "Pinned at the top until they expire",
  order: 0,
  scope: "family",
  load: async (tx, ctx, view) => {
    const rows = (await noticesFor(tx, ctx, view, view.children)).filter((n) => n.priority === "CRITICAL");
    await seen(tx, ctx, view, rows);
    return rows.length ? rows : null;
  },
  Render: CriticalNotices,
});

registerSection<NoticeRow[]>({
  key: "notices",
  label: "Notices",
  description: "Notices sent to the children's classes, newest first",
  order: 50,
  load: async (tx, ctx, view) => {
    const rows = (await noticesFor(tx, ctx, view, [view.child])).filter((n) => n.priority !== "CRITICAL");
    await seen(tx, ctx, view, rows);
    return rows.length ? rows : null;
  },
  Render: NoticeList,
});

type ConsentData = {
  maskedPhone: string;
  forms: { text: ConsentTextRow; wording: string; waitingSince: Date | null; replyBy: Date | null; children: { id: string; name: string; given: boolean; givenAt: Date | null; version: number | null }[] }[];
};

registerSection<ConsentData>({
  key: "consent",
  label: "Consent forms",
  description: "Forms waiting for an answer, and those already given",
  order: 90,
  scope: "family",
  load: async (tx, ctx, view) => {
    const texts = await currentConsentTexts(tx, ctx);
    if (!texts.length) return null;
    const ids = view.children.map((c) => c.id);
    const standing = await standingConsents(tx, ctx, { guardianIds: [view.guardianId], studentIds: ids });
    const requests = await tx.consentRequest.findMany({ where: { schoolId: ctx.schoolId, guardianIds: { has: view.guardianId } }, orderBy: { createdAt: "desc" } });
    const guardian = await tx.guardian.findUniqueOrThrow({ where: { id: view.guardianId }, select: { phone: true } });
    const forms = texts
      .map((text) => {
        const children = view.children.map((c) => {
          const rec = standing.find((r) => r.studentId === c.id && r.consentType === text.consentType);
          return { id: c.id, name: c.name, given: Boolean(rec && rec.consentTextId === text.id), givenAt: rec?.consentTextId === text.id ? rec.givenAt : null, version: rec?.consentTextId === text.id ? rec.textVersion : null };
        });
        const req = requests.find((r) => r.consentType === text.consentType);
        return { text, wording: consentWording(text, view.language), waitingSince: req && children.some((c) => !c.given) ? req.createdAt : null, replyBy: req?.replyBy ?? null, children };
      })
      // Waiting forms first.
      .sort((a, b) => Number(Boolean(b.waitingSince)) - Number(Boolean(a.waitingSince)));
    return { maskedPhone: maskPhone(guardian.phone), forms };
  },
  Render: ConsentSection,
});

function ConsentSection({ data, view }: { data: ConsentData; view: GuardianView }) {
  const t = makeT(view.lang);
  return (
    <div className="flex flex-col divide-y divide-line/70 -mt-1">
      {data.forms.map((f) => {
        const all = f.children.every((c) => c.given);
        return (
          <article key={f.text.id} className="py-4 first:pt-2 last:pb-0">
            <div className="flex items-start gap-3.5">
              <span className={cx("w-11 h-11 rounded-2xl grid place-items-center shrink-0", all ? "bg-ok/10 text-ok" : f.waitingSince ? "bg-brand/10 text-brand" : "bg-sunken text-ink3")}>
                {all ? <ShieldCheck size={21} aria-hidden="true" /> : <FileSignature size={21} aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                {f.waitingSince ? <Pill tone="warn" dot>{t("Consent needed")}</Pill> : all ? <Pill tone="ok">{t("Consent given")}</Pill> : null}
                <h3 className="font-semibold text-[15px] mt-1.5">{f.text.title}</h3>
                {f.replyBy && f.waitingSince && <p className="text-[13px] text-ink3">{t("Please reply by {date}", { date: formatDate(f.replyBy, view.timeZone) })}</p>}
              </div>
            </div>
            <details className="mt-2 group">
              <summary className="min-h-11 flex items-center cursor-pointer text-[13.5px] font-semibold text-brand list-none [&::-webkit-details-marker]:hidden">{t("Read the form (version {n})", { n: f.text.version })}</summary>
              <p className="whitespace-pre-line text-[13.5px] text-ink2 rounded-2xl bg-sunken/60 p-3.5">{f.wording}</p>
            </details>
            <ul className="mt-2 flex flex-col gap-1.5 text-[14px]">
              {f.children.map((c) => (
                <li key={c.id} className="flex items-center gap-2.5">
                  <span className={cx("w-6 h-6 rounded-full grid place-items-center shrink-0", c.given ? "bg-ok/15 text-ok" : "bg-sunken text-ink3")}>{c.given ? <Check size={14} strokeWidth={2.6} aria-hidden="true" /> : <X size={14} strokeWidth={2.6} aria-hidden="true" />}</span>
                  <span className="min-w-0"><span className="font-semibold">{c.name}</span>{" "}
                    {c.given && c.givenAt ? <span className="text-ink3 text-[13px]">· {t("given {date}", { date: formatDate(c.givenAt, view.timeZone) })}</span> : <span className="text-ink3 text-[13px]">· {t("not given")}</span>}</span>
                </li>
              ))}
            </ul>
            <ConsentForm token={view.token} consentTextId={f.text.id} title={f.text.title} maskedPhone={data.maskedPhone} preview={view.preview}
              kids={f.children.map((c) => ({ id: c.id, name: c.name, given: c.given }))} />
          </article>
        );
      })}
    </div>
  );
}
