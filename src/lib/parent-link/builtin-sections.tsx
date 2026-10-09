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
  return (
    <div className="space-y-4">
      {data.forms.map((f) => (
        <article key={f.text.id} className="rounded-xl border border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-semibold">{f.text.title}</h3>
            {f.waitingSince ? (
              <span className="rounded-full bg-warn-bg px-2.5 py-0.5 text-xs font-medium text-warn-text">Waiting for your answer</span>
            ) : f.children.every((c) => c.given) ? (
              <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">Given</span>
            ) : null}
          </div>
          {f.replyBy && f.waitingSince && <p className="text-sm text-ink-2">Please answer by {formatDate(f.replyBy, view.timeZone)}</p>}
          <details className="mt-2">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-brand-text">Read the form (version {f.text.version})</summary>
            <p className="whitespace-pre-line text-sm">{f.wording}</p>
          </details>
          <ul className="my-2 space-y-1 text-sm">
            {f.children.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{c.name}:</span>{" "}
                {c.given && c.givenAt ? <span className="text-success">Given on {formatDate(c.givenAt, view.timeZone)}</span> : <span className="text-ink-2">Not given</span>}
              </li>
            ))}
          </ul>
          <ConsentForm token={view.token} consentTextId={f.text.id} title={f.text.title} maskedPhone={data.maskedPhone} preview={view.preview}
            kids={f.children.map((c) => ({ id: c.id, name: c.name, given: c.given }))} />
        </article>
      ))}
    </div>
  );
}
