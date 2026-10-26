import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText, History as HistoryIcon, Info, Pencil } from "lucide-react";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { formatDateTime } from "@/lib/format";
import { channelSetups } from "@/lib/messaging/channels";
import { categoryLabel, languageLabel, render, sampleValues, smsParts, variableLabel } from "@/lib/messaging/templates";
import { ruleTemplateIds, usedBy, WHATSAPP_STATUS_LABEL } from "@/lib/communication/templates-admin";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill, type PillTone } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { BackLink, Col, DL, RecordHead, Split } from "@/components/ui/split";
import { UrlSegmented } from "@/components/ui/url-filters";
import { ChannelPills } from "../../_components/channel-pills";
import { ApprovalButton, ArchiveTemplate, RefreshApproval } from "./template-actions";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Message template") };
}

const WA_TONE: Record<string, PillTone> = { APPROVED: "ok", PENDING: "warn", REJECTED: "bad", NOT_SUBMITTED: "neutral" };

/** The text with its blanks picked out, as in the design's VarText. */
function BlankText({ text }: { text: string }) {
  return <>{text.split(/(\{[a-z_]+\})/g).map((part, i) => (/^\{[a-z_]+\}$/.test(part) ? <span key={i} className="font-mono text-[12.5px] px-1 rounded bg-brand/10 text-brand">{part}</span> : <span key={i}>{part}</span>))}</>;
}

export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sp = await searchParams;
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
  const lang = typeof sp.lang === "string" && currentVersions.some((v) => v.language === sp.lang) ? sp.lang : currentVersions[0]?.language;
  const v = currentVersions.find((x) => x.language === lang) ?? null;
  const rules = usedBy(t, data.firstIds, t.id);
  const canEdit = access.full && !t.archivedAt;
  const anyPending = currentVersions.some((x) => x.whatsappStatus === "PENDING");
  const isSms = t.channel === "sms";
  const isWa = t.channel === "whatsapp";
  const missingDlt = isSms && currentVersions.some((x) => !x.dltTemplateId);
  const wa = v?.whatsappStatus ?? "NOT_SUBMITTED";
  const preview = v ? render(v.body, sampleValues) : null;
  const usedIn = (vid: string) => { const n = data.uses.get(vid) ?? 0; return `${n.toLocaleString("en-IN")} message${n === 1 ? "" : "s"}`; };
  const maxVersion = Math.max(1, ...currentVersions.map((x) => x.version));

  const details: [string, React.ReactNode][] = [
    ["Category", categoryLabel(t.category)],
    ["Channel", <ChannelPills key="c" channels={[t.channel]} />],
    ["Languages", currentVersions.map((x) => languageLabel(x.language)).join(", ") || "–"],
    ["Used by", rules.length ? rules.join(", ") : "Typed messages only"],
  ];
  if (isSms && v) {
    details.push(["DLT template ID", v.dltTemplateId ? <span key="d" className="font-mono text-[13px]">{v.dltTemplateId}</span> : <Pill key="d" tone="bad"><Words k="Missing" /></Pill>]);
    details.push(["Length", `${smsParts(v.body)} SMS part${smsParts(v.body) > 1 ? "s" : ""} before blanks`]);
  }
  if (isWa && v?.whatsappName) details.push(["WhatsApp name", <span key="w" className="font-mono text-[13px]">{v.whatsappName}</span>]);

  return (
    <>
      <BackLink href="/communication/templates" label="Message Templates" sub={`Version ${maxVersion}`} />
      <RecordHead title={t.name}
        sub={<>
          <Pill tone="neutral">{categoryLabel(t.category)}</Pill>
          {isWa && <Pill tone={WA_TONE[wa]} dot><Words k="WhatsApp" /> {WHATSAPP_STATUS_LABEL[wa].toLowerCase()}</Pill>}
          {isSms && (missingDlt ? <Pill tone="bad"><Words k="DLT template ID missing" /></Pill> : <Pill tone="ok"><Words k="DLT ID added" /></Pill>)}
          {t.archivedAt && <Pill tone="neutral"><Words k="Archived" /></Pill>}
        </>}
        actions={<>
          {canEdit && <ButtonLink href={`/communication/templates/${t.id}/edit`} variant="secondary" icon={Pencil}><Words k="Edit" /></ButtonLink>}
          {access.full && <ArchiveTemplate id={t.id} name={t.name} archived={Boolean(t.archivedAt)} usedBy={rules} />}
        </>} />

      <div className="flex flex-col gap-5 lg:gap-6">
        {t.archivedAt && <Banner tone="info" title={`Archived on ${formatDateTime(t.archivedAt, tz)}.`}><Words k="It cannot be chosen for new messages." /></Banner>}
        {missingDlt && <Banner tone="bad" title="No DLT template ID."><Words k="This SMS template cannot send SMS yet. DREAM TEAM registers the text on the DLT portal and adds its ID." /></Banner>}
        {isWa && data.provider === "sandbox" && <Banner tone="info" title="WhatsApp is in test mode."><Words k="A template sent for approval is approved straight away. Once DREAM TEAM connects WhatsApp, it goes to WhatsApp for real." /></Banner>}
        {v?.whatsappStatus === "REJECTED" && <Banner tone="warn" title="WhatsApp rejected this text.">{v.whatsappNote ? `“${v.whatsappNote}” ` : ""}<Words k="Change the wording with Edit and send it again." /></Banner>}
        <Split side={340}>
          <Card className="min-w-0">
            <CardHeader title="The text" icon={FileText} description={v ? `Saved ${formatDateTime(v.createdAt, tz)}${v.createdById ? ` by ${data.people.get(v.createdById) ?? "staff"}` : ""} · used in ${usedIn(v.id)}` : undefined} />
            {v ? (
              <div className="px-5 pb-5 flex flex-col gap-4">
                {currentVersions.length > 1 && <UrlSegmented param="lang" label="Language" size="sm" className="self-start" options={currentVersions.map((x) => ({ value: x.language === currentVersions[0].language ? "" : x.language, label: languageLabel(x.language) }))} />}
                <div className="rounded-xl bg-sunken/70 border border-line p-3.5 text-[14.5px] leading-relaxed whitespace-pre-line break-words">
                  {v.subject && <p className="font-semibold mb-1">{v.subject}</p>}
                  <BlankText text={v.body} />
                </div>
                <div>
                  <p className="eyebrow text-ink3 mb-1.5"><Words k="Blanks in this template" /></p>
                  {v.variables.length ? (
                    <div className="flex gap-1.5 flex-wrap">{v.variables.map((k) => <span key={k} title={variableLabel(k)} className="font-mono text-[12px] px-2 py-1 rounded-lg bg-brand/10 text-brand">{`{${k}}`}</span>)}</div>
                  ) : <p className="text-[13.5px] text-ink3"><Words k="None. Everyone gets the same text." /></p>}
                </div>
                <div>
                  <p className="eyebrow text-ink3 mb-1.5"><Words k="Preview with sample details" /></p>
                  <div className="rounded-2xl rounded-tl-md bg-surface border border-line p-3.5 shadow-card text-[14px] leading-relaxed whitespace-pre-line break-words">{preview?.ok ? preview.text : v.body}</div>
                </div>
                {(isWa && access.full && !t.archivedAt) && (
                  <div className="flex gap-2 flex-wrap">
                    {(wa === "NOT_SUBMITTED" || wa === "REJECTED") && <ApprovalButton versionId={v.id} />}
                    {anyPending && <RefreshApproval id={t.id} />}
                  </div>
                )}
              </div>
            ) : <p className="px-5 pb-5 text-[13.5px] text-ink3"><Words k="No text saved yet." /></p>}
          </Card>
          <Col>
            <Card>
              <CardHeader title="Details" icon={Info} />
              <DL cols={1} rows={details} />
            </Card>
            <Card>
              <CardHeader title="Versions" icon={HistoryIcon} description="Messages already sent keep the version they used" />
              <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[13.5px]">
                {t.versions.filter((x) => x.language === lang).map((x) => (
                  <li key={x.id} className="flex justify-between gap-3">
                    <span><b className="font-semibold">v{x.version}</b>{x.isCurrent && <span className="text-ok font-semibold"> <Words k="· in use" /></span>}<span className="block text-[12.5px] text-ink3"><Words k="Used in" /> {usedIn(x.id)}</span></span>
                    <span className="text-ink3 text-right text-[12.5px]">{x.createdById ? `${data.people.get(x.createdById) ?? "Staff"} · ` : ""}{formatDateTime(x.createdAt, tz)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Col>
        </Split>
      </div>
    </>
  );
}
