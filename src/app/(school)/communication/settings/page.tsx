import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { formatDate } from "@/lib/format";
import { CHANNELS, CHANNEL_LABEL, type Channel } from "@/lib/messaging/channels";
import { ruleStates } from "@/lib/messaging/automatic";
import { BACKUP_TYPES, BACKUP_TYPE_LABEL, messageSettings, QUERY_TYPES } from "@/lib/messaging/settings";
import { ensureReadyTemplates, templateByKey } from "@/lib/messaging/templates";
import { OPT_OUT_WAYS } from "@/lib/messaging/optout";
import { QUERY_TYPE_LABEL, ensureTopics } from "@/lib/communication/queries";
import { sectionSwitches } from "@/lib/parent-link/section-list";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { ownerOptions } from "../queries/owners";
import { DeliveryForm, GroupArchive, OptOutPanel, ParentLinkForm, QueryRulesForm, RuleRow, TopicList, type RuleRowData } from "./settings-forms";

export const metadata: Metadata = { title: "Message Settings" };

const PARTS = [
  ["automatic", "Automatic messages"],
  ["delivery", "Delivery and SMS backup"],
  ["opt-out", "Consent and opt-out"],
  ["queries", "Queries"],
  ["groups", "Saved groups"],
  ["parent-link", "Parent Link"],
] as const;

export default async function MessageSettingsPage() {
  const access = await commPage("edit");
  const { current } = access;
  const tz = current.school.timeZone;
  if (!access.full) return <Alert tone="info">Only the Principal and School Admin can change Message Settings.</Alert>;
  const data = await withSchool(current.ctx, async (tx) => {
    const ctx = current.ctx;
    await ensureReadyTemplates(tx, ctx);
    await ensureTopics(tx, ctx);
    const [rules, settings, owners, topics, optedOut, groups] = await Promise.all([
      ruleStates(tx, ctx),
      messageSettings(tx, ctx),
      ownerOptions(tx, ctx),
      tx.queryTopic.findMany({ where: { schoolId: ctx.schoolId }, orderBy: [{ archivedAt: { sort: "desc", nulls: "first" } }, { sortOrder: "asc" }] }),
      tx.guardian.findMany({ where: { schoolId: ctx.schoolId, optedOut: true, archivedAt: null }, select: { id: true, name: true, relationship: true, phone: true }, orderBy: { name: "asc" }, take: 500 }),
      tx.recipientGroup.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null }, orderBy: { name: "asc" } }),
    ]);
    const records = await tx.optOutRecord.findMany({ where: { schoolId: ctx.schoolId, guardianId: { in: optedOut.map((g) => g.id) }, action: "opted-out" }, orderBy: { createdAt: "desc" } });
    const versions = await tx.templateVersion.findMany({ where: { schoolId: ctx.schoolId, isCurrent: true, templateId: { in: rules.flatMap((r) => Object.values(r.templateIds)).filter(Boolean) as string[] } }, select: { templateId: true, dltTemplateId: true, whatsappStatus: true, template: { select: { name: true } } } });
    const plTemplate = await templateByKey(tx, ctx, "parent-link", "whatsapp");
    const creators = await tx.userLogin.findMany({ where: { id: { in: groups.map((g) => g.createdById).filter(Boolean) as string[] } }, select: { id: true, displayName: true } });
    return { rules, settings, owners, topics, optedOut, records, versions, plTemplateId: plTemplate?.id ?? null, groups, creators };
  });
  const channels = CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }));
  const s = data.settings;

  const ruleRows: RuleRowData[] = data.rules.map((r) => ({
    key: r.key, label: r.label, when: r.when, module: r.module, audience: r.audience, isOn: r.isOn, channels: r.channels, sendTo: r.sendTo, timing: r.timing,
    timingFields: (r.timingFields ?? []).map((f) => ({ key: f.key, label: f.label, kind: f.kind })),
    templates: CHANNELS.map((c) => {
      const id = r.templateIds[c as Channel];
      const vs = data.versions.filter((v) => v.templateId === id);
      if (!id) return { channel: c, label: "No template for this channel. Add one in Message Templates.", href: null, problem: r.channels.includes(c) ? `No ${CHANNEL_LABEL[c]} template, so this channel is skipped.` : null };
      const noDlt = c === "sms" && vs.some((v) => !v.dltTemplateId);
      return { channel: c, label: vs[0]?.template.name ?? "Template", href: `/communication/templates/${id}`, problem: r.channels.includes(c) && noDlt ? "The SMS template has no DLT template ID, so SMS is skipped." : null };
    }),
  }));
  const groupsOfRules = [
    { title: "Parents", keys: ["absence", "late", "fee-due", "fee-paid", "exam-reminder", "result", "ptm", "homework-set", "admission-welcome"] },
    { title: "Birthday wishes and pending homework", keys: ["birthday-student", "birthday-staff", "homework-pending"] },
    { title: "Staff", keys: ["salary-slip"] },
  ];
  const people = data.owners.filter((o) => o.value.startsWith("user:")).map((o) => ({ value: o.value.slice(5), label: o.label }));

  return (
    <>
      <PageHeader title="Message Settings" href="/communication/settings" userId={current.user.id}>
        <ButtonLink href="/communication/settings/log">Automation log</ButtonLink>
      </PageHeader>
      <nav aria-label="Parts of Message Settings" className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1">
        {PARTS.map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line px-4 text-sm text-ink-2 hover:bg-surface-2">{label}</a>)}
      </nav>
      <p className="mb-4 text-sm text-ink-2">Channel connections, credits, the DLT entity ID and sender header are in <Link href="/settings/messaging" className="text-brand-text underline">Settings, SMS, WhatsApp &amp; Email</Link>. Consent texts and types are in <Link href="/settings/data-security" className="text-brand-text underline">Settings, Data Backup &amp; Security</Link>.</p>

      <div className="space-y-5">
        <Card id="automatic" className="scroll-mt-20">
          <CardHeader title="Automatic messages" description="When this happens, then send this. Each one never sends the same event to the same person twice, and parents who opted out are skipped." action={<ButtonLink href="/communication/settings/log" size="sm">Automation log</ButtonLink>} />
          <CardBody>
            {groupsOfRules.map((g) => (
              <div key={g.title} className="mb-3 last:mb-0">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-2">{g.title}</h3>
                <ul className="divide-y divide-line">
                  {ruleRows.filter((r) => g.keys.includes(r.key)).map((r) => <RuleRow key={r.key} rule={r} channels={channels} />)}
                </ul>
              </div>
            ))}
            <p className="mt-2 text-sm text-ink-2">Transport pickup, drop and arriving messages come with Transport Management.</p>
          </CardBody>
        </Card>

        <Card id="delivery" className="scroll-mt-20">
          <CardHeader title="Delivery and SMS backup" />
          <CardBody>
            <DeliveryForm retryLimit={s.retryLimit} backup={s.smsBackup} backupTypes={BACKUP_TYPES.map((t) => ({ value: t, label: BACKUP_TYPE_LABEL[t] }))} noticeApproval={s.noticeApproval} />
          </CardBody>
        </Card>

        <Card id="opt-out" className="scroll-mt-20">
          <CardHeader title="Consent and opt-out" description={`${data.optedOut.length} parent${data.optedOut.length === 1 ? "" : "s"} opted out of non-emergency messages.`} />
          <CardBody>
            <OptOutPanel ways={[...OPT_OUT_WAYS]} rows={data.optedOut.map((g) => {
              const r = data.records.find((x) => x.guardianId === g.id);
              return { id: g.id, name: g.name, detail: `${g.relationship} · ••${g.phone.slice(-4)}`, since: r ? formatDate(r.createdAt, tz) : "before records", how: r?.how ?? "Not recorded", note: r?.note ?? null };
            })} />
          </CardBody>
        </Card>

        <Card id="queries" className="scroll-mt-20">
          <CardHeader title="Queries" description="Reply time limits are optional, for larger schools. An overdue query is escalated once." />
          <CardBody>
            <QueryRulesForm on={s.queryTargets.on} hours={s.queryTargets.hours} types={QUERY_TYPES.map((t) => ({ value: t, label: QUERY_TYPE_LABEL[t] }))} escalateToId={s.queryTargets.escalateToId ?? ""} people={people} rating={s.queryRating} />
            <h3 className="mb-1 mt-6 font-semibold">Query topics and default owners</h3>
            <p className="mb-2 text-sm text-ink-2">A new query on a topic goes to its default owner.</p>
            <TopicList owners={data.owners} topics={data.topics.map((t) => ({ id: t.id, name: t.name, archived: Boolean(t.archivedAt), owner: t.defaultOwnerId ? `user:${t.defaultOwnerId}` : t.defaultDepartmentId ? `dept:${t.defaultDepartmentId}` : "" }))} />
          </CardBody>
        </Card>

        <Card id="groups" className="scroll-mt-20">
          <CardHeader title="Saved groups" description="Saved from Send Message with “Save as group”." />
          <CardBody>
            {data.groups.length === 0 ? <p className="text-ink-2">No saved groups yet. In Send Message, choose people and press &ldquo;Save as group&rdquo;.</p> : (
              <ul className="divide-y divide-line">
                {data.groups.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><span className="font-medium">{g.name}</span> <span className="text-sm text-ink-2">saved {formatDate(g.createdAt, tz)}{g.createdById ? ` by ${data.creators.find((c) => c.id === g.createdById)?.displayName ?? "staff"}` : ""}</span></span>
                    <GroupArchive id={g.id} name={g.name} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card id="parent-link" className="scroll-mt-20">
          <CardHeader title="Parent Link" />
          <CardBody>
            <ParentLinkForm on={s.parentLink.on} shows={s.parentLink.shows} switches={sectionSwitches()} autoSend={s.parentLink.autoSendOnAdmission} codeMinutes={s.parentLink.codeMinutes} deviceDays={s.parentLink.deviceDays} templateHref={data.plTemplateId ? `/communication/templates/${data.plTemplateId}` : null} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
