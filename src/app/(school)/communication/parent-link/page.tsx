import type { Metadata } from "next";
import Link from "next/link";
import { Ban, ChartColumn, Eye, EyeOff, FileSignature, Link2, Plus, Send, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { formatDate, formatDateTime } from "@/lib/format";
import { childrenByGuardian, LINK_FILTERS, linkCampusWhere, linkListWhere, linkSummary } from "@/lib/communication/parent-link-admin";
import { maskPhone } from "@/lib/parent-link/links";
import { requestStatus } from "@/lib/parent-link/consent";
import { sectionSwitches } from "@/lib/parent-link/section-list";
import { messageSettings } from "@/lib/messaging/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { Stats } from "@/components/ui/stats";
import { Toolbar } from "@/components/ui/toolbar";
import { DataList } from "@/components/ui/data-list";
import { Banner } from "@/components/ui/banner";
import { Bars } from "@/components/ui/charts";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cx } from "@/components/ui/cx";
import { UrlSearch, UrlSelect } from "@/components/ui/url-filters";
import { PeriodFilter } from "@/components/list/period-filter";
import { EmptyState } from "@/components/empty-state";
import { ExportMenu } from "@/components/communication/export-menu";
import { CommHead } from "../_components/comm-head";
import { RemindButton } from "./consent/consent-forms";
import { ResendBar, ShowsCard } from "./link-tools";

export const metadata: Metadata = { title: "Parent Link" };

type Search = Promise<Record<string, string | string[] | undefined>>;
const DAY = 86400_000;

export default async function ParentLinkPage({ searchParams }: { searchParams: Search }) {
  const access = await commPage();
  const { current } = access;
  const tz = current.school.timeZone;
  const params = readListParams(await searchParams, LINK_FILTERS);
  const now = new Date();
  const weeks = 6;
  const since = new Date(now.getTime() - weeks * 7 * DAY);
  const data = await withSchool(current.ctx, async (tx) => {
    const ctx = current.ctx;
    // A person limited to one campus sees the links of their campus's guardians, and its classes, only.
    const campusId = access.scope.campusId ?? null;
    const mine = await linkCampusWhere(tx, ctx, campusId);
    const campusLinks = campusId ? (await tx.parentLink.findMany({ where: { schoolId: ctx.schoolId, ...mine }, select: { id: true } })).map((l) => l.id) : null;
    const where = await linkListWhere(tx, ctx, params, now, tz, campusId);
    const [rows, total, summary, settings, classes, sections, opens, everOpened, sentCount, requests] = await Promise.all([
      tx.parentLink.findMany({ where, orderBy: params.sort === "opened" ? { lastOpenedAt: { sort: params.dir, nulls: "last" } } : { createdAt: params.sort === "created" ? params.dir : "desc" }, ...skipTake(params), include: { devices: { where: { revokedAt: null, expiresAt: { gt: now } }, select: { id: true } } } }),
      tx.parentLink.count({ where }),
      linkSummary(tx, ctx, now, campusId),
      messageSettings(tx, ctx),
      tx.schoolClass.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, ...(campusId ? { campusId } : {}) }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
      tx.section.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, ...(campusId ? { schoolClass: { campusId } } : {}) }, select: { id: true, name: true, classId: true }, orderBy: { name: "asc" } }),
      tx.auditLogEntry.findMany({ where: { schoolId: ctx.schoolId, recordType: "Parent Link", action: "opened", at: { gte: since }, ...(campusLinks ? { recordId: { in: campusLinks } } : {}) }, select: { recordId: true, at: true }, take: 50_000 }),
      tx.parentLink.count({ where: { schoolId: ctx.schoolId, lastOpenedAt: { not: null }, ...mine } }),
      tx.parentLink.count({ where: { schoolId: ctx.schoolId, lastSentAt: { not: null }, ...mine } }),
      tx.consentRequest.findMany({ where: { schoolId: ctx.schoolId }, orderBy: { createdAt: "desc" }, take: 3 }),
    ]);
    const guardians = await tx.guardian.findMany({ where: { id: { in: rows.map((r) => r.guardianId) } }, select: { id: true, name: true, phone: true } });
    const kids = await childrenByGuardian(tx, ctx, rows.map((r) => r.guardianId), campusId);
    const preview = await tx.parentLink.findFirst({ where: { schoolId: ctx.schoolId, status: "ACTIVE", ...mine }, orderBy: { createdAt: "asc" }, select: { id: true } });
    const consents = [];
    for (const r of requests) consents.push(await requestStatus(tx, ctx, r.id));
    const texts = await tx.consentText.findMany({ where: { schoolId: ctx.schoolId, id: { in: requests.map((r) => r.consentTextId) } }, select: { id: true, title: true, version: true } });
    return { rows, total, summary, settings, classes, sections, opens, everOpened, sentCount, consents, texts, guardians: new Map(guardians.map((g) => [g.id, g])), kids, previewId: preview?.id ?? null };
  });
  const s = data.summary;
  const pl = data.settings.parentLink;
  const canEdit = access.full;
  const filtered = Boolean(params.q || Object.keys(params.filters).length);
  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? "";
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "–");
  const today = now.toISOString().slice(0, 10);

  // Guardians opening their link each week (distinct links per week, from the audit log).
  const weekStart = (d: Date) => Math.floor((now.getTime() - d.getTime()) / (7 * DAY));
  const perWeek = Array.from({ length: weeks }, () => new Set<string>());
  for (const o of data.opens) { const w = weekStart(o.at); if (w >= 0 && w < weeks && o.recordId) perWeek[w].add(o.recordId); }
  const bars = perWeek.map((set, i) => ({ k: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: tz }).format(new Date(now.getTime() - (i + 1) * 7 * DAY + DAY)), v: set.size })).reverse();
  const quick = (filters: Record<string, string>) => listHref("/communication/parent-link", { ...params, filters, page: 1, q: "" }, {});
  const kidsOf = (guardianId: string) => (data.kids.get(guardianId) ?? []).map((k) => `${k.name}${k.classLabel ? ` (${k.classLabel})` : ""}${k.restricted ? ", not on Parent Link: custody restriction" : ""}`).join("; ");
  const opened = (l: (typeof data.rows)[number]) => (l.lastOpenedAt ? formatDateTime(l.lastOpenedAt, tz) : "Never");

  return (
    <>
      <CommHead access={access} page="Parent Link" href="/communication/parent-link"
        sub="One personal link per guardian for all their children. No password, no app."
        actions={<>
          <ButtonLink href="/communication/parent-link/consent" variant="secondary" icon={FileSignature} className="hidden md:inline-flex">Request consent</ButtonLink>
          <ButtonLink href="/communication/parent-link/send" variant="primary" icon={Send}>Send to existing families</ButtonLink>
        </>} />
      <div className="flex flex-col gap-5 lg:gap-6">
        {!pl.on && <Banner tone="warn" title="Parent Link is switched off.">Parents who open their link see “Parent Link is not available right now”. Switch it on under What parents see.</Banner>}
        <Stats items={[
          { label: "Links active", value: s.active.toLocaleString("en-IN"), icon: Link2, sub: "One per guardian", href: quick({ status: "ACTIVE" }) },
          { label: "Opened in last 30 days", value: s.opened30.toLocaleString("en-IN"), icon: Eye, tone: "ok", sub: `${pct(s.opened30, s.active)} of guardians`, href: quick({ status: "ACTIVE", opened: "30" }) },
          { label: "Never opened", value: s.never.toLocaleString("en-IN"), icon: EyeOff, tone: s.never ? "warn" : undefined, sub: "Resend or call them", href: quick({ status: "ACTIVE", opened: "never" }) },
          { label: "Revoked", value: s.revoked.toLocaleString("en-IN"), icon: Ban, sub: "Lost phone, shared link", href: quick({ status: "REVOKED" }) },
          { label: "Families with no link", value: s.withoutLink.toLocaleString("en-IN"), icon: Users, tone: s.withoutLink ? "info" : undefined, sub: "Send them theirs", href: "/communication/parent-link/send" },
        ]} />
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6 items-start">
          <ShowsCard settings={pl} switches={sectionSwitches()} previewHref={data.previewId ? `/communication/parent-link/${data.previewId}/preview` : null} />
          <Card className="min-w-0">
            <CardHeader title="Links sent and opened" description="Guardians opening their link each week" icon={ChartColumn} />
            <div className="px-5"><Bars data={bars} height={150} ariaLabel="Guardians opening Parent Link per week" /></div>
            <ul className="px-5 pb-5 pt-2 text-[13.5px] flex flex-col gap-1.5 tnum">
              <li className="flex justify-between gap-3"><span className="text-ink2">Links sent</span><b className="font-semibold">{data.sentCount.toLocaleString("en-IN")}</b></li>
              <li className="flex justify-between gap-3"><span className="text-ink2">Opened at least once</span><b className="font-semibold">{data.everOpened.toLocaleString("en-IN")} · {pct(data.everOpened, s.active + s.revoked)}</b></li>
              <li className="flex justify-between gap-3"><span className="text-ink2">Sent automatically on admission</span><b className="font-semibold">{pl.autoSendOnAdmission ? "On" : "Off"}</b></li>
            </ul>
          </Card>
          <Card className="lg:col-span-2 xl:col-span-1">
            <CardHeader title="Consent records" description="Agreed on Parent Link with a one-time code" icon={FileSignature}
              action={canEdit ? <ButtonLink href="/communication/parent-link/consent" size="sm" variant="soft" icon={Plus}>Request</ButtonLink> : undefined} />
            <ul className="px-5 pb-5 flex flex-col gap-4">
              {data.consents.map(({ request: r, given, waiting, withdrawn }) => {
                const t = data.texts.find((x) => x.id === r.consentTextId);
                const tot = Math.max(1, r.guardianIds.length);
                const open = r.replyBy.toISOString().slice(0, 10) >= today;
                return (
                  <li key={r.id} className="flex flex-col gap-2 pb-4 border-b border-line/70 last:border-0 last:pb-0">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0"><p className="font-semibold text-[14px] leading-snug">{t?.title ?? r.consentType}</p><p className="text-[12.5px] text-ink3">{r.audienceLabel} · version {t?.version ?? 1} · reply by {formatDate(r.replyBy, "UTC")}</p></div>
                      {canEdit && open && waiting.length > 0 && <RemindButton id={r.id} count={waiting.length} />}
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
              {!data.consents.length && <li className="text-[13.5px] text-ink3">No consent requests yet. Guardians agree to each form on their Parent Link with a one-time code.</li>}
              {data.consents.length > 0 && <li><Link href="/communication/parent-link/consent" className="text-[13px] font-semibold text-brand hover:underline">All consent requests</Link></li>}
            </ul>
          </Card>
        </div>
        <Card className="overflow-hidden min-w-0">
          <Toolbar className="flex-wrap">
            <UrlSearch placeholder="Guardian name or mobile" className="min-w-[14rem]" />
            <UrlSelect param="opened" label="Opened" className="md:w-48" options={[{ value: "", label: "All links" }, { value: "30", label: "Opened in 30 days" }, { value: "not30", label: "Not in 30 days" }, { value: "never", label: "Never opened" }]} />
            <UrlSelect param="status" label="Status" className="md:w-36" options={[{ value: "", label: "Any status" }, { value: "ACTIVE", label: "Active" }, { value: "REVOKED", label: "Revoked" }]} />
            <UrlSelect param="class" label="Class" className="md:w-36" options={[{ value: "", label: "All classes" }, ...data.classes.map((c) => ({ value: c.id, label: c.name }))]} />
            {params.filters.class && <UrlSelect param="section" label="Section" className="md:w-36" options={[{ value: "", label: "All sections" }, ...data.sections.filter((x) => x.classId === params.filters.class).map((x) => ({ value: x.id, label: `${className(x.classId)} ${x.name}` }))]} />}
            <PeriodFilter timeZone={tz} />
            {data.total > 0 && <ExportMenu href={listHref("/communication/parent-link/export", { ...params, page: 1 }, {})} />}
          </Toolbar>
          <DataList
            caption="Parent Links"
            rows={data.rows}
            rowKey={(l) => l.id}
            href={(l) => `/communication/parent-link/${l.id}`}
            minWidth={860}
            select={canEdit ? { form: "pl-bulk", label: (l) => `Choose ${data.guardians.get(l.guardianId)?.name ?? "guardian"}` } : undefined}
            paging={{ page: params.page, pageSize: PAGE_SIZE, total: data.total, href: (p) => listHref("/communication/parent-link", params, { page: p }) }}
            empty={
              <EmptyState bare Icon={Link2} title={filtered ? "No links here" : "No Parent Links yet"}
                action={!filtered ? <ButtonLink href="/communication/parent-link/send" icon={Send}>Send to existing families</ButtonLink> : undefined}>
                {filtered ? "Change the search or filters." : "Each guardian gets one personal link to see their children's fees, attendance and notices on a phone. Links are sent when an admission is approved."}
              </EmptyState>
            }
            columns={[
              { key: "name", label: "Guardian", render: (l) => { const g = data.guardians.get(l.guardianId); return <div className="flex items-center gap-2.5"><Avatar name={g?.name ?? "Parent"} size={34} /><div><p className="font-semibold leading-tight">{g?.name ?? "Parent"}</p><p className="text-[12.5px] text-ink3 tnum whitespace-nowrap">{maskPhone(g?.phone ?? "")}</p></div></div>; } },
              { key: "kids", label: "Children", render: (l) => <span className="text-[13px]">{kidsOf(l.guardianId) || <span className="text-ink3">None studying now</span>}</span> },
              { key: "status", label: "Status", render: (l) => <Pill tone={l.status === "ACTIVE" ? "ok" : "bad"} dot>{l.status === "ACTIVE" ? "Active" : "Revoked"}</Pill> },
              { key: "created", label: "Created", nowrap: true, render: (l) => <span className="tnum text-[13px]">{formatDate(l.createdAt, tz)}</span> },
              { key: "last", label: "Last opened", nowrap: true, render: (l) => <span className={cx("tnum text-[13px]", !l.lastOpenedAt && "text-warn font-semibold")}>{opened(l)}</span> },
              { key: "phones", label: "Phones verified", align: "right", render: (l) => <span className="tnum">{l.devices.length}</span> },
            ]}
            mobile={(l) => {
              const g = data.guardians.get(l.guardianId);
              return {
                title: g?.name ?? "Parent", sub: `${kidsOf(l.guardianId) || "No child studying"} · opened ${opened(l).toLowerCase()}`, avatar: g?.name ?? "Parent",
                pills: [
                  <Pill key="s" tone={l.status === "ACTIVE" ? "ok" : "bad"} className="!h-[22px] !text-[11.5px]">{l.status === "ACTIVE" ? "Active" : "Revoked"}</Pill>,
                  !l.lastOpenedAt && l.status === "ACTIVE" ? <Pill key="n" tone="warn" className="!h-[22px] !text-[11.5px]">Never opened</Pill> : null,
                ],
              };
            }}
          />
        </Card>
      </div>
      {canEdit && <ResendBar form="pl-bulk" />}
    </>
  );
}
