import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { BellRing, ClipboardList, ExternalLink, MessageSquare, Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, Plus, SearchX, UserPlus } from "lucide-react";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { momentWhere } from "@/lib/periods";
import { callLogWhere } from "@/lib/front-office/calls";
import { requestStatus } from "@/lib/front-office/desk";
import { staffWithLogins } from "@/lib/front-office/people";
import { addDaysIso, clockAt, dayMonth, localOf, whenWords } from "@/lib/front-office/time";
import { CALL_STATUS, REQUEST_STATUS, hhmmOf, maskPhone, showPhone } from "@/lib/front-office/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ExportButton } from "@/components/ui/export-button";
import { cx } from "@/components/ui/cx";
import { SegLinks } from "@/components/ui/blocks";
import { PeriodFilter } from "@/components/list/period-filter";
import { UrlSearch, UrlSelect } from "@/components/money/url-filters";
import { DataList, Empty, Stack, Stats, TONE_SOFT, Toolbar } from "@/components/money/kit";
import { FoHead } from "../_components/head";
import { CommonSheets } from "../_components/common-sheets";
import { FollowUpSheet } from "../_components/desk-sheets";
import { RowMenu, type RowItem } from "../_components/row-menu";
import { closeCallAction, closeWalkInAction } from "../actions";
import { BASE, UUID, addQ, foGuard, foPeriod, one, qs, type SearchParams } from "../_lib/page";


export const metadata = { title: "Enquiries & Calls" };

const HREF = `${BASE}/enquiries`;
const SOURCE_WORDS: Record<string, string> = { "walk-in": "Walk-in", phone: "Phone" };

/** Enquiries & Calls (16 §2, mod-frontoffice.jsx EnquiriesPage): desk enquiries go to Admission Management; every call is logged; walk-in requests by number. */
export default async function EnquiriesPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await foGuard("enquiries");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const now = p.now;
  const view = ["calls", "requests"].includes(one(sp.view)) ? one(sp.view) : "enq";
  const q = one(sp.q).trim().slice(0, 60);
  const purpose = one(sp.purpose) || "all";
  const phones = p.can.parentPhones;
  const admSee = p.current.permissions["admission-management"].see !== "none";
  const admCreate = can(p.current.permissions, "admission-management", "create");
  const period = foPeriod(sp, p.dates, view === "calls" ? "today" : "last7");
  const range = period.range!;
  const span = momentWhere(range, p.tz);
  const today = momentWhere({ period: "today", from: p.todayStr, to: p.todayStr, label: "Today" }, p.tz);
  const weekAgo = momentWhere({ period: "last7", from: addDaysIso(p.todayStr, -6), to: p.todayStr, label: "Last 7 days" }, p.tz);

  const data = await withSchool(ctx, async (tx) => {
    const enqWhere: Prisma.EnquiryWhereInput = {
      archivedAt: null, source: { in: ["walk-in", "phone"] }, createdAt: span,
      ...(q ? { OR: [{ childName: { contains: q, mode: "insensitive" } }, { parentName: { contains: q, mode: "insensitive" } }, { enquiryNo: { contains: q, mode: "insensitive" } }, ...(phones && q.replace(/\D/g, "").length >= 3 ? [{ phone: { contains: q.replace(/\D/g, "") } }] : [])] } : {}),
    };
    const reqWhere: Prisma.WalkInRequestWhereInput = {
      archivedAt: null, createdAt: span,
      ...(q ? { OR: [{ requestNo: { contains: q.replace(/\s+/g, ""), mode: "insensitive" } }, { fromName: { contains: q, mode: "insensitive" } }, { request: { contains: q, mode: "insensitive" } }, { about: { contains: q, mode: "insensitive" } }] } : {}),
    };
    const [enqToday, callsToday, followUps, complaints, enquiries, calls, requests, logins] = await Promise.all([
      tx.enquiry.findMany({ where: { archivedAt: null, source: { in: ["walk-in", "phone"] }, createdAt: today }, select: { source: true } }),
      tx.callLogEntry.findMany({ where: { archivedAt: null, at: today }, select: { direction: true } }),
      tx.callLogEntry.findMany({ where: { archivedAt: null, status: "FOLLOW_UP", followUpAt: { lt: today.lt } }, select: { name: true }, orderBy: { followUpAt: "asc" } }),
      tx.callLogEntry.count({ where: { archivedAt: null, status: "QUERY", at: weekAgo } }),
      view === "enq" ? tx.enquiry.findMany({ where: enqWhere, orderBy: { createdAt: "desc" }, take: 300 }) : Promise.resolve([]),
      view === "calls" ? tx.callLogEntry.findMany({ where: callLogWhere({ from: span.gte, to: span.lt, purpose, q, phones }), orderBy: { at: "desc" }, take: 300 }) : Promise.resolve([]),
      view === "requests" ? tx.walkInRequest.findMany({ where: reqWhere, orderBy: { createdAt: "desc" }, take: 300 }) : Promise.resolve([]),
      staffWithLogins(tx),
    ]);
    const [classes, owners, tasks] = await Promise.all([
      tx.schoolClass.findMany({ where: { id: { in: enquiries.map((e) => e.classId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
      tx.staff.findMany({ where: { id: { in: enquiries.map((e) => e.ownerStaffId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } }),
      tx.task.findMany({ where: { id: { in: requests.map((r) => r.taskId).filter((x): x is string => Boolean(x)) } }, select: { id: true, status: true } }),
    ]);
    const fuId = UUID.test(one(sp.fu)) ? one(sp.fu) : null;
    const fuCall = fuId ? await tx.callLogEntry.findFirst({ where: { id: fuId, archivedAt: null } }) : null;
    return { enqToday, callsToday, followUps, complaints, enquiries, calls, requests, logins, classes, owners, tasks, fuCall };
  });

  const loginName = (id: string | null) => data.logins.find((l) => l.loginId === id)?.name ?? "";
  const keep = { view: view === "enq" ? null : view, ...period.keep, q: q || null, purpose: view === "calls" && purpose !== "all" ? purpose : null };
  const sheetHref = qs(HREF, keep);
  const walkIn = data.enqToday.filter((e) => e.source === "walk-in").length;
  const incoming = data.callsToday.filter((c) => c.direction === "IN").length;
  const followNames = [...new Set(data.followUps.map((f) => f.name))];
  const dayOf = (d: Date) => localOf(d, p.tz).slice(0, 10);
  const timeWords = (d: Date) => `${dayOf(d) === p.todayStr ? "" : `${dayMonth(new Date(`${dayOf(d)}T00:00:00Z`))}, `}${clockAt(d, p.tz)}`;
  const ph = (c: { phone: string; isParent: boolean }) => (c.isParent && !phones ? maskPhone(c.phone) : showPhone(c.phone));
  const exportHref = qs(`${HREF}/export`, { ...period.keep, q: q || null, purpose: purpose !== "all" ? purpose : null });

  return (
    <div>
      <FoHead pageName="Enquiries & Calls" href={HREF} sub="Walk-in and phone enquiries go straight to Admission Management. Every call is logged."
        actions={<>
          <ButtonLink href={addQ(sheetHref, { do: "call" })} scroll={false} variant="secondary" icon={PhoneCall}>Log a call</ButtonLink>
          {admCreate && <ButtonLink href={addQ(sheetHref, { do: "enquiry" })} scroll={false} variant="primary" icon={Plus}>New enquiry</ButtonLink>}
        </>} />
      <Stack>
        <Stats items={[
          { label: "Enquiries today", value: String(data.enqToday.length), sub: data.enqToday.length ? `${walkIn} walk-in, ${data.enqToday.length - walkIn} phone` : "None yet", icon: UserPlus, href: qs(HREF, { period: "today" }), active: view === "enq" },
          { label: "Calls today", value: String(data.callsToday.length), sub: `${incoming} incoming`, icon: Phone, href: qs(HREF, { view: "calls" }), active: view === "calls" },
          { label: "Follow-ups due today", value: String(data.followUps.length), sub: followNames.length ? followNames.slice(0, 2).join(", ") + (followNames.length > 2 ? ` and ${followNames.length - 2} more` : "") : "Nothing due", tone: data.followUps.length ? "warn" : undefined, icon: BellRing, href: qs(HREF, { view: "calls", period: "last30" }) },
          { label: "Complaints sent as queries", value: String(data.complaints), sub: "Last 7 days", icon: MessageSquare, href: qs(HREF, { view: "calls", purpose: "Complaint", period: "last7" }) },
        ]} />
        <SegLinks value={view} label="Enquiries, calls or walk-in requests" className="self-start max-w-full overflow-x-auto" options={[
          { value: "enq", label: <><UserPlus size={16} aria-hidden="true" />Enquiry register</>, href: HREF },
          { value: "calls", label: <><Phone size={16} aria-hidden="true" />Call log</>, href: qs(HREF, { view: "calls" }) },
          { value: "requests", label: <><ClipboardList size={16} aria-hidden="true" />Walk-in requests</>, href: qs(HREF, { view: "requests" }) },
        ]} />

        {view === "enq" && (
          <Card className="overflow-hidden">
            <CardHeader title="Enquiries taken at the desk" description="The same records as Admission Management, Enquiries" icon={UserPlus}
              action={admSee ? <ButtonLink href="/admission-management/enquiries" size="sm" variant="soft" icon={ExternalLink}>Open in Admissions</ButtonLink> : undefined} />
            <Toolbar>
              <UrlSearch id="enq-search" placeholder={phones ? "Child, parent, phone or enquiry number" : "Child, parent or enquiry number"} />
              <PeriodFilter {...p.dates} fallback="last7" />
            </Toolbar>
            <DataList rows={data.enquiries} rowKey={(e) => e.id} minWidth={820} caption="Enquiries taken at the desk"
              rowHref={admSee ? (e) => `/admission-management/enquiries/${e.id}` : undefined}
              footer="Owner and follow-up are set by Admissions as soon as the enquiry is saved"
              columns={[
                { key: "child", label: "Child", render: (e) => <div><p className="font-semibold leading-tight">{e.childName}</p><p className="text-[12px] text-ink3">{e.enquiryNo && <span className="font-mono">{e.enquiryNo} · </span>}{timeWords(e.createdAt)}</p></div> },
                { key: "parent", label: "Parent", render: (e) => <div><p className="leading-tight">{e.parentName}</p><p className="text-[12px] text-ink3 tnum">{phones ? showPhone(e.phone) : maskPhone(e.phone)}</p></div> },
                { key: "cls", label: "Class wanted", nowrap: true, render: (e) => data.classes.find((c) => c.id === e.classId)?.name ?? <span className="text-ink3">—</span> },
                { key: "src", label: "Source", render: (e) => <Pill tone={e.source === "phone" ? "info" : "brand"}>{SOURCE_WORDS[e.source] ?? e.source}</Pill> },
                { key: "owner", label: "Owner", render: (e) => <span className="text-[13.5px]">{data.owners.find((o) => o.id === e.ownerStaffId)?.fullName ?? <span className="text-ink3">Not given yet</span>}</span> },
                { key: "next", label: "Next follow-up", render: (e) => (e.nextFollowUpAt ? <span className={cx("text-[13px]", dayOf(e.nextFollowUpAt) <= p.todayStr && "text-warn font-semibold")}>{dayOf(e.nextFollowUpAt) === p.todayStr ? `Today, ${clockAt(e.nextFollowUpAt, p.tz)}` : whenWords(e.nextFollowUpAt, p.tz, now)}</span> : <span className="text-ink3">—</span>) },
              ]}
              phone={(e) => ({ title: `${e.childName}${data.classes.find((c) => c.id === e.classId) ? ` · ${data.classes.find((c) => c.id === e.classId)!.name}` : ""}`, sub: `${e.parentName} · ${timeWords(e.createdAt)}`, avatar: e.childName, pills: <Pill tone={e.source === "phone" ? "info" : "brand"} className="!h-[22px] !text-[11.5px]">{SOURCE_WORDS[e.source] ?? e.source}</Pill> })}
              empty={q ? <Empty icon={SearchX} title="No enquiry matches" body="Try the parent’s name or another date range." action={<ButtonLink href={HREF} variant="secondary">Clear filters</ButtonLink>} />
                : <Empty icon={UserPlus} title="No desk enquiries on these dates" body="Walk-in and phone enquiries saved here go straight to Admissions with an owner." action={admCreate ? <ButtonLink href={addQ(sheetHref, { do: "enquiry" })} scroll={false} variant="secondary" icon={Plus}>New enquiry</ButtonLink> : undefined} />} />
          </Card>
        )}

        {view === "calls" && (
          <Card className="overflow-hidden">
            <Toolbar>
              <UrlSearch id="call-search" placeholder={phones ? "Name, phone or note" : "Name or note"} />
              <UrlSelect id="call-purpose" param="purpose" label="Purpose" className="md:w-48" options={[{ value: "all", label: "All purposes" }, ...p.settings.callPurposes.map((x) => ({ value: x, label: x }))]} />
              <PeriodFilter {...p.dates} fallback="today" />
              <ExportButton href={exportHref} />
            </Toolbar>
            <DataList rows={data.calls} rowKey={(c) => c.id} minWidth={900} caption="Call log"
              footer={phones ? `${data.calls.length} call${data.calls.length === 1 ? "" : "s"} · ${period.label.toLowerCase()} · roles without “see parent phone numbers” see only the last 4 digits` : `${data.calls.length} call${data.calls.length === 1 ? "" : "s"} · ${period.label.toLowerCase()} · parents’ numbers show only the last 4 digits, also in the export`}
              columns={[
                { key: "t", label: "Time", nowrap: true, render: (c) => <span className="flex items-center gap-2 tnum text-[13.5px]"><span className={cx("w-7 h-7 rounded-lg grid place-items-center", c.direction === "IN" ? TONE_SOFT.info : TONE_SOFT.neutral)} aria-label={c.direction === "IN" ? "Incoming" : "Outgoing"}>{c.direction === "IN" ? <PhoneIncoming size={14} aria-hidden="true" /> : <PhoneOutgoing size={14} aria-hidden="true" />}</span>{timeWords(c.at)}</span> },
                { key: "name", label: "Caller or person called", render: (c) => <div><p className="font-semibold leading-tight">{c.name}</p>{c.who && <p className="text-[12px] text-ink3">{c.who}</p>}</div> },
                { key: "phone", label: "Phone", nowrap: true, render: (c) => <span className="tnum text-[13.5px]">{ph(c)}</span> },
                { key: "purpose", label: "Purpose", render: (c) => <div className="max-w-[260px]"><p className="text-[13.5px] font-medium">{c.purpose}</p>{c.note && <p className="text-[12px] text-ink3">{c.note}</p>}{c.queryNo && c.queryId && <Link href={`/communication/queries/${c.queryId}`} className="relative z-[1] text-[12px] font-semibold text-brand hover:underline">Query {c.queryNo}</Link>}</div> },
                { key: "fu", label: "Follow-up", render: (c) => (c.status === "FOLLOW_UP" && c.followUpAt ? <span className={cx("text-[13px] font-semibold", c.followUpAt <= now ? "text-bad" : "text-warn")}>{timeWords(c.followUpAt)}{c.followUpLoginId ? ` · ${loginName(c.followUpLoginId)}` : ""}</span> : <span className="text-ink3">—</span>) },
                { key: "st", label: "Status", render: (c) => { const s = CALL_STATUS[c.status] ?? CALL_STATUS.CLOSED; return <Pill tone={s.tone}>{s.label}</Pill>; } },
                { key: "act", label: "", render: (c) => <RowMenu label={`Actions for the call with ${c.name}`} items={callItems(c, sheetHref, phones)} /> },
              ]}
              phone={(c) => ({ title: c.name, sub: `${timeWords(c.at)} · ${c.purpose} · ${ph(c)}`, icon: c.direction === "IN" ? PhoneIncoming : PhoneOutgoing, iconTone: c.direction === "IN" ? "info" : "neutral", right: <RowMenu label={`Actions for the call with ${c.name}`} items={callItems(c, sheetHref, phones)} />, pills: c.status === "FOLLOW_UP" && c.followUpAt ? <Pill tone="warn" className="!h-[22px] !text-[11.5px]">Follow-up: {timeWords(c.followUpAt)}</Pill> : undefined })}
              empty={q || purpose !== "all" ? <Empty icon={SearchX} title="No call matches" body="Try another name, purpose or date range." action={<ButtonLink href={qs(HREF, { view: "calls" })} variant="secondary">Clear filters</ButtonLink>} />
                : <Empty icon={Phone} title="No calls logged on these dates" body="Log incoming and outgoing calls so nothing is forgotten." action={<ButtonLink href={addQ(sheetHref, { do: "call" })} scroll={false} variant="secondary" icon={PhoneCall}>Log a call</ButtonLink>} />} />
          </Card>
        )}

        {view === "requests" && (
          <Card className="overflow-hidden">
            <CardHeader title="Walk-in requests" description="Each has a number the person can ask about. The status follows the department’s task." icon={ClipboardList}
              action={<ButtonLink href={addQ(sheetHref, { do: "walkin" })} scroll={false} size="sm" variant="soft" icon={Plus}>New request</ButtonLink>} />
            <Toolbar>
              <UrlSearch id="req-search" placeholder="Request number, like REQ-2026-0012, or name" />
              <PeriodFilter {...p.dates} fallback="last7" />
            </Toolbar>
            <DataList rows={data.requests} rowKey={(r) => r.id} minWidth={820} caption="Walk-in requests"
              footer={`${data.requests.length} request${data.requests.length === 1 ? "" : "s"} · ${period.label.toLowerCase()}`}
              columns={[
                { key: "no", label: "Request", render: (r) => <div><p className="font-mono text-[13px] font-semibold">{r.requestNo}</p><p className="text-[12px] text-ink3">{timeWords(r.createdAt)}</p></div> },
                { key: "what", label: "What is asked", render: (r) => <div className="max-w-[300px]"><p className="text-[13.5px] font-medium">{r.request}</p>{r.note && <p className="text-[12px] text-ink3">{r.note}</p>}</div> },
                { key: "from", label: "From", render: (r) => <div><p className="text-[13.5px]">{r.fromName}</p>{r.about && <p className="text-[12px] text-ink3">{r.about}</p>}</div> },
                { key: "dept", label: "Department", render: (r) => <div><p className="text-[13.5px]">{r.department}</p>{r.handlerLoginId && <p className="text-[12px] text-ink3">{loginName(r.handlerLoginId)}</p>}</div> },
                { key: "st", label: "Status", render: (r) => { const s = REQUEST_STATUS[requestStatus(r, data.tasks.find((t) => t.id === r.taskId))] ?? REQUEST_STATUS.SENT; return <Pill tone={s.tone}>{s.label}</Pill>; } },
                { key: "act", label: "", render: (r) => requestStatus(r, data.tasks.find((t) => t.id === r.taskId)) === "DONE" ? null : <RowMenu label={`Actions for ${r.requestNo}`} items={[{ label: "Mark done", icon: "done", action: closeWalkInAction, fields: { requestId: r.id } }]} /> },
              ]}
              phone={(r) => { const s = REQUEST_STATUS[requestStatus(r, data.tasks.find((t) => t.id === r.taskId))] ?? REQUEST_STATUS.SENT; return { title: r.request, sub: `${r.requestNo} · ${r.fromName} · ${r.department}`, icon: ClipboardList, iconTone: s.tone, pills: <Pill tone={s.tone} className="!h-[22px] !text-[11.5px]">{s.label}</Pill> }; }}
              empty={q ? <Empty icon={SearchX} title={`No request matches “${q}”`} body="Check the number on the person’s slip or message, or try a wider date range." action={<ButtonLink href={qs(HREF, { view: "requests", period: "last30" })} variant="secondary">Show the last 30 days</ButtonLink>} />
                : <Empty icon={ClipboardList} title="No walk-in requests on these dates" body="A parent asking for a bonafide certificate or a fee statement gets a request number." action={<ButtonLink href={addQ(sheetHref, { do: "walkin" })} scroll={false} variant="secondary" icon={Plus}>Walk-in request</ButtonLink>} />} />
          </Card>
        )}
      </Stack>
      {data.fuCall && (
        <FollowUpSheet closeHref={sheetHref} call={{ id: data.fuCall.id, name: data.fuCall.name, note: data.fuCall.note }}
          staff={data.logins.map((s) => ({ value: s.loginId, label: `${s.name} · ${s.role}` }))}
          start={{ date: p.todayStr, time: hhmmOf(Math.min(23 * 60 + 30, Math.ceil((p.minute + 60) / 30) * 30)), who: data.fuCall.followUpLoginId ?? (data.logins.some((l) => l.loginId === p.current.user.id) ? p.current.user.id : data.logins[0]?.loginId ?? "") }} />
      )}
      <CommonSheets sp={sp} href={HREF} keepKeys={["view", "period", "from", "to", "q", "purpose"]} />
    </div>
  );
}

function callItems(c: { id: string; status: string; phone: string; isParent: boolean }, here: string, phones: boolean): RowItem[] {
  const items: RowItem[] = [{ label: c.status === "FOLLOW_UP" ? "Change the follow-up" : "Set a follow-up", icon: "bell", href: addQ(here, { fu: c.id }) }];
  if (!c.isParent || phones) items.push({ label: "Call back", icon: "call", href: `tel:+91${c.phone}` });
  if (c.status === "FOLLOW_UP") items.push({ label: "Mark closed", icon: "done", action: closeCallAction, fields: { callId: c.id } });
  return items;
}
