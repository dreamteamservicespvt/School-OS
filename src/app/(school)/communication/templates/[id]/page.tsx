import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { formatDateTime } from "@/lib/format";
import { CHANNEL_LABEL, channelSetups, type Channel } from "@/lib/messaging/channels";
import { categoryLabel, languageLabel, render, sampleValues, smsParts, variableLabel } from "@/lib/messaging/templates";
import { ruleTemplateIds, usedBy, WHATSAPP_STATUS_LABEL } from "@/lib/communication/templates-admin";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { ApprovalButton, ArchiveTemplate, RefreshApproval } from "./template-actions";

export const metadata: Metadata = { title: "Message template" };

const WA_TONE: Record<string, BadgeTone> = { APPROVED: "success", PENDING: "warning", REJECTED: "danger", NOT_SUBMITTED: "neutral" };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const access = await commPage();
  const { current } = access;
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => {
    const t = await tx.template.findFirst({ where: { id, schoolId: current.ctx.schoolId }, include: { versions: { orderBy: [{ language: "asc" }, { version: "desc" }] } } });
    if (!t) return null;
    const uses = await tx.messageRecipient.groupBy({ by: ["templateVersionId"], where: { schoolId: current.ctx.schoolId, templateVersionId: { in: t.versions.map((v) => v.id) } }, _count: { _all: true } });
    const people = await tx.userLogin.findMany({ where: { id: { in: t.versions.map((v) => v.createdById).filter(Boolean) as string[] } }, select: { id: true, displayName: true } });
    return { t, uses: new Map(uses.map((u) => [u.templateVersionId, u._count._all])), people: new Map(people.map((p) => [p.id, p.displayName])), firstIds: await ruleTemplateIds(tx, current.ctx), provider: (await channelSetups(tx, current.ctx)).whatsapp.provider };
  });
  if (!data) notFound();
  const { t } = data;
  const currentVersions = t.versions.filter((v) => v.isCurrent);
  const old = t.versions.filter((v) => !v.isCurrent);
  const rules = usedBy(t, data.firstIds, t.id);
  const canEdit = access.full && !t.archivedAt;
  const anyPending = currentVersions.some((v) => v.whatsappStatus === "PENDING");

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/communication/templates" className="text-brand-text hover:underline">← Message Templates</Link></p>
      <PageHeader title={t.name} href={`/communication/templates/${t.id}`} userId={current.user.id}>
        <div className="flex flex-wrap gap-2">
          {canEdit && <ButtonLink href={`/communication/templates/${t.id}/edit`} variant="primary">Edit</ButtonLink>}
          {access.full && <ArchiveTemplate id={t.id} name={t.name} archived={Boolean(t.archivedAt)} usedBy={rules} />}
        </div>
      </PageHeader>
      {t.archivedAt && <Alert tone="warning" className="mb-4">Archived on {formatDateTime(t.archivedAt, tz)}. It cannot be chosen for new messages.</Alert>}

      <Card className="mb-4">
        <CardBody>
          <dl className="grid gap-3 sm:grid-cols-4">
            <Detail label="Category">{categoryLabel(t.category)}</Detail>
            <Detail label="Channel">{CHANNEL_LABEL[t.channel as Channel] ?? t.channel}</Detail>
            <Detail label="Languages">{currentVersions.map((v) => languageLabel(v.language)).join(", ")}</Detail>
            <Detail label="Used by">{rules.length ? rules.join(", ") : "Typed messages only"}</Detail>
          </dl>
        </CardBody>
      </Card>

      {t.channel === "whatsapp" && data.provider === "sandbox" && <Alert tone="info" className="mb-4">WhatsApp is in test mode, so a template sent for approval is approved straight away. Connect WhatsApp in Settings, SMS, WhatsApp &amp; Email to send it to WhatsApp for real.</Alert>}
      {anyPending && access.full && <div className="mb-4"><RefreshApproval id={t.id} /></div>}

      <div className="space-y-4">
        {currentVersions.map((v) => {
          const preview = render(v.body, sampleValues);
          const missingDlt = t.channel === "sms" && !v.dltTemplateId;
          return (
            <Card key={v.id}>
              <CardHeader title={`${languageLabel(v.language)} · version ${v.version}`} description={`Saved ${formatDateTime(v.createdAt, tz)}${v.createdById ? ` by ${data.people.get(v.createdById) ?? "staff"}` : ""} · used in ${data.uses.get(v.id) ?? 0} message${data.uses.get(v.id) === 1 ? "" : "s"}`}
                action={t.channel === "whatsapp" ? <Badge tone={WA_TONE[v.whatsappStatus ?? "NOT_SUBMITTED"]}>{WHATSAPP_STATUS_LABEL[v.whatsappStatus ?? "NOT_SUBMITTED"]}</Badge> : missingDlt ? <Badge tone="danger">Draft</Badge> : undefined} />
              <CardBody>
                {missingDlt && <Alert tone="danger" className="mb-3">This SMS template has no DLT template ID, so it cannot be used. Add the ID from the DLT portal with Edit.</Alert>}
                {v.whatsappStatus === "REJECTED" && <Alert tone="danger" className="mb-3">WhatsApp rejected this text{v.whatsappNote ? `: ${v.whatsappNote}` : ""}. Change the wording with Edit and send it again.</Alert>}
                <div className="grid grid-cols-1 gap-4 *:min-w-0 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-1 text-sm font-medium text-ink-2">Text</h3>
                    {v.subject && <p className="font-semibold">{v.subject}</p>}
                    <p className="whitespace-pre-line break-words rounded-xl border border-line p-3 font-mono text-sm">{v.body}</p>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Detail label="Blanks">{v.variables.length ? v.variables.map((k) => `{${k}} ${variableLabel(k)}`).join(", ") : "None"}</Detail>
                      {t.channel === "sms" && <Detail label="DLT template ID">{v.dltTemplateId ? <span className="font-mono">{v.dltTemplateId}</span> : <span className="font-medium text-danger">Missing</span>}</Detail>}
                      {t.channel === "sms" && <Detail label="Length">{smsParts(v.body)} SMS part{smsParts(v.body) > 1 ? "s" : ""} before blanks</Detail>}
                      {t.channel === "whatsapp" && v.whatsappName && <Detail label="WhatsApp name"><span className="font-mono text-sm">{v.whatsappName}</span></Detail>}
                    </dl>
                    {t.channel === "whatsapp" && access.full && !t.archivedAt && (v.whatsappStatus === "NOT_SUBMITTED" || v.whatsappStatus === "REJECTED" || !v.whatsappStatus) && <div className="mt-3"><ApprovalButton versionId={v.id} /></div>}
                  </div>
                  <div>
                    <h3 className="mb-1 text-sm font-medium text-ink-2">Preview with sample data</h3>
                    <div className="rounded-2xl bg-surface-2 p-4">
                      <div className="rounded-xl rounded-tl-none bg-surface p-3 shadow-card">
                        <p className="whitespace-pre-line break-words">{preview.ok ? preview.text : v.body}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <section aria-labelledby="older" className="mt-6">
        <h2 id="older" className="mb-2 text-lg font-semibold">Earlier versions</h2>
        {old.length === 0 ? <p className="text-ink-2">No earlier versions. Each save makes a new one; messages already sent keep theirs.</p> : (
          <ul className="space-y-2">
            {old.map((v) => (
              <li key={v.id} className="rounded-xl border border-line bg-surface p-3">
                <p className="text-sm text-ink-2">{languageLabel(v.language)} · version {v.version} · {formatDateTime(v.createdAt, tz)} · used in {data.uses.get(v.id) ?? 0} message{data.uses.get(v.id) === 1 ? "" : "s"}{v.dltTemplateId ? ` · DLT ${v.dltTemplateId}` : ""}</p>
                <p className="mt-1 whitespace-pre-line break-words">{v.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
