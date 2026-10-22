import type { Metadata } from "next";
import { FileSignature, ListChecks } from "lucide-react";
import { withSchool } from "@/lib/db";
import { commOfficePage } from "@/lib/communication/access";
import { formatDate, formatDateTime } from "@/lib/format";
import { currentConsentTexts, requestStatus } from "@/lib/parent-link/consent";
import { schoolToday } from "@/lib/communication/time";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { BackLink, RecordHead, Split } from "@/components/ui/split";
import { whoOptions } from "../who-options";
import { ConsentRequestForm, RemindButton } from "./consent-forms";

export const metadata: Metadata = { title: "Consent forms" };

export default async function ConsentPage() {
  const access = await commOfficePage();
  const { current } = access;
  const tz = current.school.timeZone;
  const today = schoolToday(tz).toISOString().slice(0, 10);
  const data = await withSchool(current.ctx, async (tx) => {
    const ctx = current.ctx;
    const [texts, who, requests] = await Promise.all([
      currentConsentTexts(tx, ctx),
      whoOptions(tx, ctx, access.scope.campusId),
      tx.consentRequest.findMany({ where: { schoolId: ctx.schoolId }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    const statuses = [];
    for (const r of requests) statuses.push(await requestStatus(tx, ctx, r.id));
    const allTexts = await tx.consentText.findMany({ where: { schoolId: ctx.schoolId, id: { in: requests.map((r) => r.consentTextId) } }, select: { id: true, title: true, version: true } });
    return { texts, who, statuses, allTexts };
  });
  const defaultReply = new Date(`${today}T00:00:00Z`);
  defaultReply.setUTCDate(defaultReply.getUTCDate() + 14);

  return (
    <>
      <BackLink href="/communication/parent-link" label="Parent Link" />
      <RecordHead title="Consent forms" sub={<span className="text-[14px] text-ink3">Guardians see each form on their Parent Link and agree with a one-time code to their mobile.</span>} />
      <Split side={380}>
        <Card className="min-w-0">
          <CardHeader title="Requests sent" icon={ListChecks} description="Given, waiting and withdrawn for each request" />
          <ul className="px-5 pb-5 flex flex-col gap-4">
            {data.statuses.map(({ request: r, given, waiting, withdrawn }) => {
              const t = data.allTexts.find((x) => x.id === r.consentTextId);
              const open = r.replyBy.toISOString().slice(0, 10) >= today;
              const tot = Math.max(1, r.guardianIds.length);
              return (
                <li key={r.id} className="flex flex-col gap-2 pb-4 border-b border-line/70 last:border-0 last:pb-0">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[14px] leading-snug">{t?.title ?? r.consentType}{t ? ` · version ${t.version}` : ""} <Pill tone={open ? "info" : "neutral"} className="!h-5 !text-[11px] ml-1">{open ? "Open" : "Closed"}</Pill></p>
                      <p className="text-[12.5px] text-ink3">{r.audienceLabel} · sent {formatDate(r.createdAt, tz)} · reply by {formatDate(r.replyBy, "UTC")}{r.lastReminderAt ? ` · reminded ${formatDateTime(r.lastReminderAt, tz)}` : ""}</p>
                    </div>
                    {open && waiting.length > 0 && <RemindButton id={r.id} count={waiting.length} />}
                  </div>
                  <span className="flex h-2 rounded-full overflow-hidden bg-sunken" aria-hidden="true">
                    <span className="bg-ok" style={{ width: `${(given.length / tot) * 100}%` }} />
                    <span className="bg-warn" style={{ width: `${(waiting.length / tot) * 100}%` }} />
                    <span className="bg-bad" style={{ width: `${(withdrawn.length / tot) * 100}%` }} />
                  </span>
                  <p className="text-[13px] tnum flex gap-x-3 gap-y-1 flex-wrap">
                    <span><b className="font-semibold text-ok">{given.length.toLocaleString("en-IN")}</b> given</span>
                    <span><b className="font-semibold text-warn">{waiting.length.toLocaleString("en-IN")}</b> waiting</span>
                    <span><b className="font-semibold text-bad">{withdrawn.length.toLocaleString("en-IN")}</b> withdrawn</span>
                  </p>
                </li>
              );
            })}
            {!data.statuses.length && <li className="text-[13.5px] text-ink3">No consent requests yet. Requests you send appear here with given, waiting and withdrawn counts.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Request consent" icon={FileSignature} description="Each guardian agrees with a one-time code" />
          {data.texts.length === 0 ? (
            <div className="px-5 pb-5">
              <Banner tone="info" title="No consent texts yet." action={<ButtonLink href="/settings/data-security" size="sm" variant="secondary">Open settings</ButtonLink>}>Add consent types and their wording in Settings, Data Backup &amp; Security.</Banner>
            </div>
          ) : (
            <ConsentRequestForm texts={data.texts.map((t) => ({ value: t.id, label: `${t.title} (version ${t.version})` }))} who={data.who} defaultReplyBy={defaultReply.toISOString().slice(0, 10)} minDate={today} />
          )}
        </Card>
      </Split>
    </>
  );
}
