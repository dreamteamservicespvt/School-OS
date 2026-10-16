import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, BellOff, Check, Coins, History, Link2, MessageSquareText, Plus, ShieldCheck, ToggleRight, Users, Zap } from "lucide-react";
import { withSchool } from "@/lib/db";
import { commOfficePage } from "@/lib/communication/access";
import { formatDate, formatDateTime } from "@/lib/format";
import { CHANNELS, CHANNEL_LABEL, channelSetups, type Channel } from "@/lib/messaging/channels";
import { creditBalances } from "@/lib/messaging/credits";
import { ruleStates } from "@/lib/messaging/automatic";
import { BACKUP_TYPES, BACKUP_TYPE_LABEL, messageSettings, QUERY_TYPES } from "@/lib/messaging/settings";
import { ensureReadyTemplates, templateByKey } from "@/lib/messaging/templates";
import { OPT_OUT_WAYS } from "@/lib/messaging/optout";
import { QUERY_TYPE_LABEL, ensureTopics } from "@/lib/communication/queries";
import { COMM_FEATURES, COMM_FEATURE_LIST } from "@/lib/communication/features";
import { pushConfigured } from "@/lib/push";
import { OUTCOME_LABEL } from "@/lib/communication/automation-log";
import { sectionSwitches } from "@/lib/parent-link/section-list";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { HBars } from "@/components/ui/charts";
import { Row, SettingRow } from "@/components/ui/rows";
import { Col } from "@/components/ui/split";
import { cx } from "@/components/ui/cx";
import { CommHead } from "../_components/comm-head";
import { ownerOptions } from "../queries/owners";
import { DeliveryForm, FeatureSwitches, GroupArchive, OptOutPanel, ParentLinkForm, QueryRulesForm, RuleRow, TopicList, type RuleRowData } from "./settings-forms";

export const metadata: Metadata = { title: "Message Settings" };

export default async function MessageSettingsPage() {
  const access = await commOfficePage("edit");
  const { current } = access;
  const tz = current.school.timeZone;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const data = await withSchool(current.ctx, async (tx) => {
    const ctx = current.ctx;
    await ensureReadyTemplates(tx, ctx);
    await ensureTopics(tx, ctx);
    const [rules, settings, owners, topics, optedOut, groups, balances, used, setups, school, roles, features, runs] = await Promise.all([
      ruleStates(tx, ctx),
      messageSettings(tx, ctx),
      ownerOptions(tx, ctx),
      tx.queryTopic.findMany({ where: { schoolId: ctx.schoolId }, orderBy: [{ archivedAt: { sort: "desc", nulls: "first" } }, { sortOrder: "asc" }] }),
      tx.guardian.findMany({ where: { schoolId: ctx.schoolId, optedOut: true, archivedAt: null }, select: { id: true, name: true, relationship: true, phone: true }, orderBy: { name: "asc" }, take: 500 }),
      tx.recipientGroup.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null }, orderBy: { name: "asc" } }),
      creditBalances(tx, ctx),
      tx.creditLedgerEntry.groupBy({ by: ["channel"], where: { schoolId: ctx.schoolId, amount: { lt: 0 }, createdAt: { gte: monthStart } }, _sum: { amount: true } }),
      channelSetups(tx, ctx),
      tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { smsSenderHeader: true, smsDltEntityId: true, phone: true } }),
      tx.role.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, isEnabled: true }, select: { key: true, name: true, permissions: true }, orderBy: { name: "asc" } }),
      tx.schoolFeature.findMany({ where: { schoolId: ctx.schoolId, featureKey: { in: COMM_FEATURE_LIST.map((f) => f.key) } } }),
      tx.automationLog.findMany({ where: { schoolId: ctx.schoolId }, orderBy: { createdAt: "desc" }, take: 6 }),
    ]);
    const records = await tx.optOutRecord.findMany({ where: { schoolId: ctx.schoolId, guardianId: { in: optedOut.map((g) => g.id) }, action: "opted-out" }, orderBy: { createdAt: "desc" } });
    const versions = await tx.templateVersion.findMany({ where: { schoolId: ctx.schoolId, isCurrent: true, templateId: { in: rules.flatMap((r) => Object.values(r.templateIds)).filter(Boolean) as string[] } }, select: { templateId: true, dltTemplateId: true, whatsappStatus: true, template: { select: { name: true } } } });
    const plTemplate = await templateByKey(tx, ctx, "parent-link", "whatsapp");
    const creators = await tx.userLogin.findMany({ where: { id: { in: groups.map((g) => g.createdById).filter(Boolean) as string[] } }, select: { id: true, displayName: true } });
    return { rules, settings, owners, topics, optedOut, records, versions, plTemplateId: plTemplate?.id ?? null, groups, creators, balances, used, setups, school, roles, features, runs };
  });
  const channels = CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }));
  const s = data.settings;
  const usedOf = (c: string) => Math.abs(data.used.find((u) => u.channel === c)?._sum.amount ?? 0);
  const totalLeft = data.balances.whatsapp + data.balances.sms;

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
    ...(current.modulesOn.has("transport-management") ? [{ title: "School bus", keys: ["bus-pickup", "bus-drop", "bus-arriving"] }] : []),
  ];
  const people = data.owners.filter((o) => o.value.startsWith("user:")).map((o) => ({ value: o.value.slice(5), label: o.label }));
  const ruleName = (k: string | null) => data.rules.find((r) => r.key === k)?.label ?? "Automatic message";

  const senders: [string, string | null, string][] = [
    ["WhatsApp Business number", data.setups.whatsapp.config.displayNumber || null, data.setups.whatsapp.isOn ? (data.setups.whatsapp.environment === "live" ? "Connected" : "Connected in test mode") : "Not switched on"],
    ["SMS sender header", data.school.smsSenderHeader, data.setups.sms.isOn ? "Registered on the DLT portal" : "SMS is not switched on"],
    ["DLT entity ID", data.school.smsDltEntityId, "From the telecom DLT portal"],
    ["Email sender", data.setups.email.config.fromAddress || null, data.setups.email.isOn ? "Sends from this address" : "Email is not switched on"],
    ["Reply-to phone", data.school.phone, "Shown at the end of Parent Link"],
  ];

  // Who may send to whom, read from the school's own roles (Settings, Users & Permissions).
  const WIDE = ["accountant", "receptionist", "office-staff", "admission-counsellor"];
  const whoRows = data.roles.map((r) => {
    const level = ((r.permissions ?? {}) as Record<string, string>).communication ?? "none";
    const key = r.key ?? "";
    const emergency = level === "full" && ["principal", "school-admin"].includes(key);
    const send = level === "full" ? "All" : level === "own" ? (WIDE.includes(key) ? "Parents, any section" : "Own sections") : "—";
    const notices = level === "full" ? "All" : level === "own" || level === "view" ? "Reads" : "—";
    const history = level === "full" ? "All" : level === "own" ? "Own messages" : level === "view" ? "All" : "—";
    return { name: r.name, cells: [send, level === "full" ? "All" : "—", notices, history, level === "full" ? "All" : level === "own" ? "Own queries" : "—", emergency ? "All" : "—"] };
  }).filter((r) => r.cells.some((c) => c !== "—")).sort((a, b) => (b.cells.filter((c) => c === "All").length - a.cells.filter((c) => c === "All").length) || a.name.localeCompare(b.name));
  const cell = (x: string) => (x === "All" ? <span className="inline-flex items-center gap-1 text-ok font-semibold"><Check size={15} strokeWidth={2.6} aria-hidden="true" />All</span> : x === "—" ? <span className="text-ink3">—</span> : <span className="text-ink2">{x}</span>);

  return (
    <>
      <CommHead access={access} page="Message Settings" href="/communication/settings"
        sub="Credits, sender IDs, SMS backup, who may message whom, and the automatic messages."
        actions={<ButtonLink href="/communication/settings/log" variant="secondary" icon={History}>Automation log</ButtonLink>} />
      <div className="flex flex-col gap-5 lg:gap-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6 items-start">
          <Card>
            <CardHeader title="Message credits" description="1 credit per WhatsApp message or SMS part. Email and app notices are free." icon={Coins}
              action={<ButtonLink href="/settings/messaging" size="sm" variant="primary" icon={Plus}>Top up</ButtonLink>} />
            <div className="px-5 pb-5 flex flex-col gap-4">
              <div className="flex items-end gap-3 flex-wrap">
                <p className="font-display text-[34px] font-semibold tnum leading-none">{totalLeft.toLocaleString("en-IN")}</p>
                <p className="text-[13px] text-ink3 pb-1">credits left</p>
              </div>
              <HBars rows={[{ k: "WhatsApp", v: data.balances.whatsapp }, { k: "SMS", v: data.balances.sms }]} unit="" labelWidth={86} ariaLabel="Credits left by channel" />
              <p className="text-[12.5px] text-ink3 tnum">Used this month: {(usedOf("whatsapp") + usedOf("sms")).toLocaleString("en-IN")} ({usedOf("whatsapp").toLocaleString("en-IN")} WhatsApp, {usedOf("sms").toLocaleString("en-IN")} SMS). A warning goes to the School Admin below {data.setups.whatsapp.lowCreditAlert.toLocaleString("en-IN")} credits.</p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Sender IDs and DLT" description="What parents see as the sender" icon={BadgeCheck}
              action={<ButtonLink href="/settings/messaging" size="sm" variant="ghost">Connections</ButtonLink>} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              {senders.map(([t, v, sub]) => (
                <SettingRow key={t} title={t} sub={sub}>
                  {v ? <span className={cx("text-[13.5px] font-semibold", /\d{10,}|^[A-Z]{6}$/.test(v) && "font-mono text-[12.5px]")}>{v}</span> : <span className="text-[13px] text-ink3">Not set</span>}
                </SettingRow>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6 items-start">
          <Card id="delivery" className="scroll-mt-20">
            <CardHeader title="SMS backup and delivery" description="When WhatsApp fails or is not read in time" icon={MessageSquareText} />
            <div className="px-5 pb-5">
              <DeliveryForm retryLimit={s.retryLimit} backup={s.smsBackup} backupTypes={BACKUP_TYPES.map((t) => ({ value: t, label: BACKUP_TYPE_LABEL[t] }))} noticeApproval={s.noticeApproval} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Optional pages and alerts" description="Switched on for this school only. Their data stays if switched off." icon={ToggleRight} />
            <FeatureSwitches features={COMM_FEATURE_LIST.map((f) => ({
              key: f.key,
              label: f.label,
              description: f.key === COMM_FEATURES.push && !pushConfigured() ? `${f.description} Not set up on this server yet: ask DREAM TEAM support.` : f.description,
              on: data.features.some((x) => x.featureKey === f.key && x.isOn),
            }))} />
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader title="Who may send to whom" description="Set from each role in Settings, Users & Permissions. Teachers are never offered other classes." icon={ShieldCheck}
            action={<ButtonLink href="/settings/users/roles" size="sm" variant="ghost">Roles</ButtonLink>} />
          <div className="overflow-x-auto border-t border-line">
            <table className="text-[13px] min-w-[760px] w-full">
              <thead><tr className="text-ink3 border-b border-line">{["Role", "Send messages", "Staff", "Notices", "Message History", "Queries", "Emergency"].map((h, i) => <th key={h} scope="col" className={cx("font-semibold py-2.5 px-3 text-left whitespace-nowrap", i === 0 && "sticky left-0 bg-surface pl-5")}>{h}</th>)}</tr></thead>
              <tbody>
                {whoRows.map((r) => (
                  <tr key={r.name} className="border-b border-line/70 last:border-0">
                    <th scope="row" className="sticky left-0 bg-surface pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap text-left">{r.name}</th>
                    {r.cells.map((x, i) => <td key={i} className="px-3 py-2.5 whitespace-nowrap">{cell(x)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line">Only the Principal and School Admin may send an emergency broadcast. Parents who opted out still get emergency messages.</p>
        </Card>

        <Card id="automatic" className="scroll-mt-20">
          <CardHeader title="Automatic messages" description="When this happens, send this. Each rule sends once per event per person, never twice. Parents who opted out are skipped." icon={Zap} />
          {groupsOfRules.map((g) => (
            <div key={g.title} className="border-t border-line/70">
              <p className="eyebrow text-ink3 px-5 pt-3">{g.title}</p>
              <ul className="divide-y divide-line/70">
                {ruleRows.filter((r) => g.keys.includes(r.key)).map((r) => <RuleRow key={r.key} rule={r} channels={channels} />)}
              </ul>
            </div>
          ))}
          {!current.modulesOn.has("transport-management") && <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line/70">Bus pickup, drop and arriving messages show here when Transport is switched on.</p>}
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6 items-start">
          <Card>
            <CardHeader title="Automation log" description="What was sent, to whom and why" icon={History}
              action={<ButtonLink href="/communication/settings/log" size="sm" variant="ghost">See all</ButtonLink>} />
            <ul className="px-2 pb-2">
              {data.runs.map((m) => (
                <li key={m.id}><Row icon={Zap} iconTone={m.outcome === "sent" ? "brand" : m.outcome === "no-credits" ? "bad" : "neutral"} href={m.messageId ? `/communication/history/${m.messageId}` : undefined} title={`${ruleName(m.ruleKey)} → ${m.recipientName}`} sub={`${m.eventLabel} · ${OUTCOME_LABEL[m.outcome] ?? m.outcome} · ${formatDateTime(m.createdAt, tz)}`} /></li>
              ))}
              {!data.runs.length && <li className="px-3 py-3 text-[13.5px] text-ink3">No automatic messages sent yet.</li>}
            </ul>
          </Card>
          <Card id="opt-out" className="scroll-mt-20">
            <CardHeader title="Parents who opted out" description={`${data.optedOut.length.toLocaleString("en-IN")} ${data.optedOut.length === 1 ? "parent" : "parents"} · they still get emergency messages`} icon={BellOff} />
            <div className="px-5 pb-5">
              <OptOutPanel ways={[...OPT_OUT_WAYS]} rows={data.optedOut.map((g) => {
                const r = data.records.find((x) => x.guardianId === g.id);
                return { id: g.id, name: g.name, detail: `${g.relationship} · ••${g.phone.slice(-4)}`, since: r ? formatDate(r.createdAt, tz) : "before records", how: r?.how ?? "Not recorded", note: r?.note ?? null };
              })} />
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6 items-start">
          <Card id="queries" className="scroll-mt-20">
            <CardHeader title="Feedback & Queries" description="Reply time limits are optional, for larger schools. An overdue query is escalated once." icon={MessageSquareText} />
            <div className="px-5 pb-5">
              <QueryRulesForm on={s.queryTargets.on} hours={s.queryTargets.hours} types={QUERY_TYPES.map((t) => ({ value: t, label: QUERY_TYPE_LABEL[t] }))} escalateToId={s.queryTargets.escalateToId ?? ""} people={people} rating={s.queryRating} />
              <h3 className="mb-1 mt-6 font-semibold text-[14px]">Query topics and default owners</h3>
              <p className="mb-2 text-[13px] text-ink3">A new query on a topic goes to its default owner.</p>
              <TopicList owners={data.owners} topics={data.topics.map((t) => ({ id: t.id, name: t.name, archived: Boolean(t.archivedAt), owner: t.defaultOwnerId ? `user:${t.defaultOwnerId}` : t.defaultDepartmentId ? `dept:${t.defaultDepartmentId}` : "" }))} />
            </div>
          </Card>
          <Col>
            <Card id="parent-link" className="scroll-mt-20">
              <CardHeader title="Parent Link" description="Sending on admission, one-time codes and phones" icon={Link2} />
              <div className="px-5 pb-5">
                <ParentLinkForm on={s.parentLink.on} shows={s.parentLink.shows} switches={sectionSwitches()} autoSend={s.parentLink.autoSendOnAdmission} codeMinutes={s.parentLink.codeMinutes} deviceDays={s.parentLink.deviceDays} templateHref={data.plTemplateId ? `/communication/templates/${data.plTemplateId}` : null} />
              </div>
            </Card>
            <Card id="groups" className="scroll-mt-20">
              <CardHeader title="Saved groups" description="Saved from Send Message with “Save as group”" icon={Users} />
              <ul className="px-5 pb-5 flex flex-col gap-2.5">
                {data.groups.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0"><b className="font-semibold text-[14px] block">{g.name}</b><span className="text-[12.5px] text-ink3">Saved {formatDate(g.createdAt, tz)}{g.createdById ? ` by ${data.creators.find((c) => c.id === g.createdById)?.displayName ?? "staff"}` : ""}</span></span>
                    <GroupArchive id={g.id} name={g.name} />
                  </li>
                ))}
                {!data.groups.length && <li className="text-[13.5px] text-ink3">No saved groups yet. In Send Message, choose people and press “Save as group”.</li>}
              </ul>
            </Card>
          </Col>
        </div>
        <p className="text-[12.5px] text-ink3">Consent texts and types are in <Link href="/settings/data-security" className="text-brand font-semibold hover:underline">Settings, Data Backup &amp; Security</Link>.</p>
      </div>
    </>
  );
}
