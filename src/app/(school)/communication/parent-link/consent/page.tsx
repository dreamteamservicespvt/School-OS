import type { Metadata } from "next";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { formatDate, formatDateTime } from "@/lib/format";
import { currentConsentTexts, requestStatus } from "@/lib/parent-link/consent";
import { schoolToday } from "@/lib/communication/time";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { ParentLinkNav } from "../sub-nav";
import { whoOptions } from "../who-options";
import { ConsentRequestForm, RemindButton } from "./consent-forms";

export const metadata: Metadata = { title: "Consent forms" };

export default async function ConsentPage() {
  const access = await commPage();
  const { current } = access;
  const tz = current.school.timeZone;
  const today = schoolToday(tz).toISOString().slice(0, 10);
  const data = await withSchool(current.ctx, async (tx) => {
    const ctx = current.ctx;
    const [texts, who, requests] = await Promise.all([
      currentConsentTexts(tx, ctx),
      whoOptions(tx, ctx),
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
      <PageHeader title="Parent Link" href="/communication/parent-link/consent" userId={current.user.id} />
      <ParentLinkNav on="consent" />
      <div className="grid grid-cols-1 gap-6 *:min-w-0 lg:grid-cols-5">
        <section aria-labelledby="ask" className="lg:col-span-2">
          <h2 id="ask" className="mb-1 text-lg font-semibold">Request consent</h2>
          <p className="mb-3 text-ink-2">Each guardian sees the form on their Parent Link and agrees with a one-time code to their mobile.</p>
          {data.texts.length === 0 ? (
            <Alert tone="info" action={<ButtonLink href="/settings/data-security" size="sm">Open settings</ButtonLink>}>No consent texts yet. Add consent types and their wording in Settings, Data Backup &amp; Security.</Alert>
          ) : (
            <ConsentRequestForm texts={data.texts.map((t) => ({ value: t.id, label: `${t.title} (version ${t.version})` }))} who={data.who} defaultReplyBy={defaultReply.toISOString().slice(0, 10)} minDate={today} />
          )}
        </section>
        <section aria-labelledby="sent" className="lg:col-span-3">
          <h2 id="sent" className="mb-3 text-lg font-semibold">Requests sent</h2>
          {data.statuses.length === 0 ? <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-ink-2">No consent requests yet. Requests you send appear here with given, waiting and withdrawn counts.</p> : (
            <ul className="space-y-3">
              {data.statuses.map(({ request: r, given, waiting, withdrawn }) => {
                const t = data.allTexts.find((x) => x.id === r.consentTextId);
                const open = r.replyBy.toISOString().slice(0, 10) >= today;
                const total = r.guardianIds.length || 1;
                return (
                  <li key={r.id} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{t?.title ?? r.consentType}{t ? ` · version ${t.version}` : ""}</p>
                        <p className="text-sm text-ink-2">{r.audienceLabel} · sent {formatDate(r.createdAt, tz)} · reply by {formatDate(r.replyBy, "UTC")}{r.lastReminderAt ? ` · reminded ${formatDateTime(r.lastReminderAt, tz)}` : ""}</p>
                      </div>
                      <Badge tone={open ? "brand" : "neutral"}>{open ? "Open" : "Closed"}</Badge>
                    </div>
                    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <span className="bg-success" style={{ width: `${(given.length / total) * 100}%` }} />
                      <span className="bg-ink-2" style={{ width: `${(withdrawn.length / total) * 100}%` }} />
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div><dt className="text-sm text-ink-2">Given</dt><dd className="text-lg font-semibold tabular-nums text-success">{given.length}</dd></div>
                      <div><dt className="text-sm text-ink-2">Waiting</dt><dd className="text-lg font-semibold tabular-nums">{waiting.length}</dd></div>
                      <div><dt className="text-sm text-ink-2">Withdrawn</dt><dd className="text-lg font-semibold tabular-nums">{withdrawn.length}</dd></div>
                    </dl>
                    {open && waiting.length > 0 && <div className="mt-3"><RemindButton id={r.id} count={waiting.length} /></div>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
