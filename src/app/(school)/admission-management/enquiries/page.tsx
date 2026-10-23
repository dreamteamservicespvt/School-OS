import type { Metadata } from "next";
import { CircleAlert, Inbox, MessageCircle, SearchX, Upload } from "lucide-react";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { formatDate, formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { admissionPage, admissionViewYear, viewerOnCampus, BASE } from "@/lib/admission/page";
import { backToThisYear, viewNow } from "@/lib/academic/view-year";
import { ViewYearStrip } from "@/components/view-year-strip";
import { UUID_RE, instantToLocal, zonedToInstant } from "@/lib/admission/act";
import { ENQUIRY_FILTERS, enquiryOrder, enquiryWhere } from "@/lib/admission/list";
import { enquiryScope, canWorkOn } from "@/lib/admission/access";
import { CLOSED_STATUSES, admissionYears, label, listYears, live } from "@/lib/admission/settings";
import { enquiryChoices, names } from "@/lib/admission/choices";
import { enquiryTemplates } from "@/lib/admission/enquiries";
import { seatsFor } from "@/lib/admission/seats";
import { phoneWords, whenWords } from "@/lib/admission/words";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Chips } from "@/components/ui/chips";
import { DataList, Pager } from "@/components/ui/data-list";
import { rowList, type ListRow } from "../_components/list-rows";
import { BULK_FORM } from "./bulk-form";
import { ExportMenu, UrlSearch, UrlSegmented, UrlSelect } from "@/components/ui/url-filters";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/empty-state";
import { cx } from "@/components/ui/cx";
import { AdmissionHead } from "../_components/head";
import { AddEnquiryButton } from "./enquiry-forms";
import { EnquiryBulk } from "./campaign-bar";
import { EnquiryPanel, type PanelEnquiry } from "./panel";
import { STATUS_TONE } from "@/lib/admission/tones";
import { periodFromSearch } from "@/lib/periods";
import { PeriodFilter } from "@/components/list/period-filter";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Enquiries") };
}

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const PATH = `${BASE}/enquiries`;

export default async function EnquiriesPage({ searchParams }: Search) {
  const page = await admissionPage();
  const { current, settings, year, tz } = page;
  const raw = await searchParams;
  // One campus chosen on the Dashboard (?campus=): that campus's enquiries, as the card counted them.
  const viewer = await viewerOnCampus(page, raw.campus);
  // Another year (?year=): its enquiries alone, as at its last day when it is over, read-only (gap list G36).
  const yearView = await admissionViewYear(page, viewer, raw.year);
  const shut = Boolean(yearView?.past);
  const today = yearView ? yearView.asOf.toISOString().slice(0, 10) : page.today;
  const params = readListParams(raw, ENQUIRY_FILTERS);
  const openId = typeof raw.id === "string" && UUID_RE.test(raw.id) ? raw.id : null;
  const now = viewNow(yearView, new Date());
  const own = viewer.see !== "all";
  const dayStart = zonedToInstant(`${today}T00:00`, tz);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const range = periodFromSearch(raw, { timeZone: tz });

  const data = await withSchool(current.ctx, async (tx) => {
    // Every open year of each campus the person sees (only theirs when limited to one campus).
    const [years, admitting] = await Promise.all([listYears(tx, viewer.campusId, yearView), admissionYears(tx, current.ctx, settings, viewer.campusId)]);
    const yearIds = years.map((y) => y.id);
    const where = enquiryWhere(params, viewer, { yearId: yearIds.length ? yearIds : ["00000000-0000-0000-0000-000000000000"], timeZone: tz, now, range });
    const base = { AND: [enquiryScope(viewer)], archivedAt: null, academicYearId: { in: yearIds } };
    const open = { ...base, status: { notIn: [...CLOSED_STATUSES] } };
    const [rows, total, choices, n, all, mine, dueToday, overdue, week, lost, openCount] = await Promise.all([
      tx.enquiry.findMany({
        where, orderBy: enquiryOrder(params), ...skipTake(params),
        include: { campaign: { select: { name: true } }, activities: params.filters.view === "whatsapp" ? { where: { kind: "message" }, orderBy: { at: "desc" }, take: 1 } : false },
      }),
      tx.enquiry.count({ where }),
      enquiryChoices(tx, current.ctx, current, settings, tz),
      names(tx),
      tx.enquiry.count({ where: base }),
      viewer.staffId ? tx.enquiry.count({ where: { ...base, ownerStaffId: viewer.staffId } }) : Promise.resolve(0),
      tx.enquiry.count({ where: { ...open, nextFollowUpAt: { gte: dayStart, lt: dayEnd } } }),
      tx.enquiry.count({ where: { ...open, nextFollowUpAt: { lt: now } } }),
      tx.enquiry.count({ where: { ...base, createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } } }),
      tx.enquiry.count({ where: { ...base, status: "lost" } }),
      tx.enquiry.count({ where: open }),
    ]);
    let panel: PanelEnquiry | null = null;
    let canWork = false;
    if (openId) {
      const e = await tx.enquiry.findFirst({
        where: { id: openId, AND: [enquiryScope(viewer)] },
        include: { campaign: { select: { name: true } }, activities: { orderBy: { at: "desc" } }, applications: { where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } },
      });
      if (e) {
        canWork = canWorkOn(viewer, e) && !e.archivedAt && !shut;
        const users = await tx.userLogin.findMany({ where: { id: { in: [...new Set([e.createdById, ...e.activities.map((a) => a.byId)].filter((x): x is string => Boolean(x)))] } }, select: { id: true, displayName: true } });
        const who = (id: string | null) => users.find((u) => u.id === id)?.displayName ?? null;
        const seat = e.classId ? (await seatsFor(tx, e.academicYearId, [e.classId])).get(e.classId) : undefined;
        const ey = years.find((y) => y.id === e.academicYearId);
        const midYear = (y: { id: string; status: string; campusId: string }) => y.status === "ACTIVE" && admitting.some((a) => a.campusId === y.campusId && a.id !== y.id);
        const isOpen = !CLOSED_STATUSES.includes(e.status);
        panel = {
          id: e.id, childName: e.childName, parentName: e.parentName, phone: e.phone, email: e.email,
          className: e.classId ? n.classes.get(e.classId) ?? null : null,
          enquiryNo: e.enquiryNo, yearLabel: ey ? (midYear(ey) ? `${ey.name} mid-year` : ey.name) : "Earlier year",
          status: e.status, statusLabel: label(settings.statusList, e.status), source: e.source, sourceLabel: label(settings.sourceList, e.source),
          firstSourceLabel: e.firstSource !== e.source ? label(settings.sourceList, e.firstSource) : null,
          ownerStaffId: e.ownerStaffId, ownerName: e.ownerStaffId ? n.staff.get(e.ownerStaffId) ?? null : null,
          nextFollowUp: isOpen && e.nextFollowUpAt ? whenWords(e.nextFollowUpAt, tz, now) : null,
          nextFollowUpLocal: isOpen && e.nextFollowUpAt && e.nextFollowUpAt > now ? instantToLocal(e.nextFollowUpAt, tz) : null,
          due: isOpen && e.nextFollowUpAt ? (e.nextFollowUpAt < now ? "overdue" : e.nextFollowUpAt < dayEnd ? "today" : "later") : null,
          nextAction: isOpen ? e.nextAction : null, campaign: e.campaign?.name ?? null, created: formatDate(e.createdAt, tz), addedBy: who(e.createdById),
          seats: seat ? (seat.free > 0 ? `${seat.free} ${seat.free === 1 ? "seat" : "seats"} left` : "Class is full") : e.classId ? "No sections yet" : null,
          lostReason: e.status === "lost" && e.lostReason ? label(settings.lossList, e.lostReason) : null, lostNote: e.status === "lost" ? e.lostNote : null,
          referredBy: e.referredBy, currentSchool: e.currentSchool, childDob: e.childDob ? formatDate(e.childDob, "UTC") : null,
          applicationId: e.applications[0]?.id ?? null, archived: Boolean(e.archivedAt),
          activities: e.activities.map((a) => ({ id: a.id, kind: a.kind, text: a.text, when: formatDateTime(a.at, tz), by: who(a.byId), direction: a.direction })),
          saved: { id: e.id, childName: e.childName, parentName: e.parentName, phone: e.phone, email: e.email, classId: e.classId, childDob: e.childDob ? e.childDob.toISOString().slice(0, 10) : null, currentSchool: e.currentSchool, referredBy: e.referredBy, customFields: (e.customFields ?? {}) as Record<string, string> },
        };
      }
    }
    return { years, admitting, rows, total, choices, n, counts: { all, mine, dueToday, overdue, week, lost, openCount }, panel, canWork };
  });

  const { rows, total, choices, n, counts, panel } = data;
  const view = params.filters.view === "whatsapp" ? "whatsapp" : "all";
  const quick = params.filters.quick ?? "all";
  const chip = (value: string | null) => listHref(PATH, params, { quick: value, page: null, id: null });
  const yearLabel = (id: string) => {
    const y = data.years.find((x) => x.id === id);
    return y ? (y.status === "ACTIVE" && data.admitting.some((a) => a.campusId === y.campusId && a.id !== y.id) ? `${y.name} mid-year` : y.name) : "";
  };
  const yearsText = data.years.length > 1 && year ? `${year.name} and mid-year ${data.years.find((y) => y.status === "ACTIVE" && y.id !== year.id && y.campusId === year.campusId)?.name ?? ""}`.trim() : year?.name ?? "";
  const sub = own ? `Only the enquiries you added or own · ${counts.all} ${counts.all === 1 ? "enquiry" : "enquiries"}` : `${counts.openCount} open enquiries · ${yearsText}`;
  const canAdd = viewer.change !== "none" && data.years.length > 0 && !shut;
  const full = viewer.change === "all" && !own && !shut;
  const selectable = full;
  const narrow = Boolean(panel);
  const filtered = Boolean(params.q || Object.keys(params.filters).filter((k) => k !== "view").length);
  const rowHref = (id: string) => listHref(PATH, params, { id });

  const columns = [
    { key: "child", label: "Child" },
    ...(narrow ? [] : [{ key: "parent", label: "Parent", nowrap: true }, { key: "class", label: "Class wanted", nowrap: true }, { key: "source", label: view === "whatsapp" ? "Last message" : "Source" }]),
    { key: "status", label: "Status" },
    { key: "owner", label: "Owner", nowrap: true },
    { key: "next", label: "Next follow-up" },
    ...(narrow ? [] : [{ key: "created", label: "Created", nowrap: true }]),
  ];
  const listRows: ListRow[] = rows.map((e) => {
    const isOpen = !CLOSED_STATUSES.includes(e.status);
    const due = isOpen && e.nextFollowUpAt ? (e.nextFollowUpAt < now ? "overdue" : e.nextFollowUpAt < dayEnd ? "today" : "later") : null;
    const cls = e.classId ? n.classes.get(e.classId) ?? "" : "Not decided";
    const next = due && e.nextFollowUpAt
      ? <span key="n" className={cx("text-[13px] tnum whitespace-nowrap", due === "overdue" ? "text-bad font-semibold" : due === "today" ? "text-warn font-semibold" : "text-ink2")}>{due === "overdue" && <CircleAlert size={13} className="inline -mt-0.5 mr-1" aria-label="Overdue" />}{whenWords(e.nextFollowUpAt, tz, now)}</span>
      : <span key="n" className="text-ink3"><Words k="None" /></span>;
    const status = <Pill key="st" tone={STATUS_TONE[e.status] ?? "neutral"}>{label(settings.statusList, e.status)}</Pill>;
    const owner = e.ownerStaffId ? n.staff.get(e.ownerStaffId) ?? "" : "No owner";
    const last = "activities" in e && Array.isArray(e.activities) ? (e.activities as { text: string }[])[0]?.text : undefined;
    return {
      key: e.id, href: rowHref(e.id), active: e.id === openId,
      cells: [
        <div key="c" className="flex items-center gap-3 min-w-0"><Avatar name={e.childName} size={34} /><div className="min-w-0"><p className="font-semibold leading-tight truncate">{e.childName}</p><p className="text-[12px] text-ink3 font-mono">{e.enquiryNo ?? ""}</p></div></div>,
        ...(narrow ? [] : [
          <div key="p"><p className="leading-tight">{e.parentName}</p><p className="text-[12.5px] text-ink3 tnum">{phoneWords(e.phone)}</p></div>,
          <div key="cl"><p className="font-medium">{cls}</p><p className="text-[12px] text-ink3">{yearLabel(e.academicYearId)}</p></div>,
          view === "whatsapp"
            ? <p key="s" className="text-[13px] text-ink2 max-w-[220px] truncate">{last ? `“${last}”` : <span className="text-ink3"><Words k="No messages yet" /></span>}</p>
            : <div key="s"><p className="text-[13.5px]">{label(settings.sourceList, e.source)}</p>{e.campaign && <p className="text-[12px] text-info whitespace-nowrap">{e.campaign.name}</p>}</div>,
        ]),
        status,
        <span key="o" className="text-[13.5px]">{owner}</span>,
        next,
        ...(narrow ? [] : [<span key="cr" className="text-[13px] tnum">{formatDate(e.createdAt, tz)}</span>]),
      ],
      mobile: {
        title: e.childName, sub: `${e.parentName} · ${cls} · ${label(settings.sourceList, e.source)}`, avatar: e.childName,
        pills: [<Pill key="s" tone={STATUS_TONE[e.status] ?? "neutral"} className="!h-[22px] !text-[11.5px]">{label(settings.statusList, e.status)}</Pill>,
          due && e.nextFollowUpAt ? <Pill key="n" tone={due === "overdue" ? "bad" : due === "today" ? "warn" : "neutral"} className="!h-[22px] !text-[11.5px]">{due === "overdue" ? "Overdue · " : ""}{whenWords(e.nextFollowUpAt, tz, now)}</Pill> : null],
      },
    };
  });

  const quickOpts = [
    { value: "all", label: own ? "All of mine" : "All", count: counts.all, href: chip(null) },
    ...(viewer.change === "none" || !viewer.staffId || own ? [] : [{ value: "mine", label: "My enquiries", count: counts.mine, href: chip("mine") }]),
    { value: "today", label: "Follow-up today", count: counts.dueToday, href: chip("today") },
    { value: "overdue", label: "Overdue", count: counts.overdue, href: chip("overdue") },
    { value: "new-week", label: "New this week", count: counts.week, href: chip("new-week") },
    { value: "lost", label: "Lost", count: counts.lost, href: chip("lost") },
  ];

  const actions = (
    <>
      {full && <ButtonLink href={`${PATH}/import`} variant="secondary" icon={Upload} className="hidden md:inline-flex"><Words k="Import" /></ButtonLink>}
      {canAdd && <AddEnquiryButton c={choices} />}
    </>
  );
  const empty = filtered ? (
    <EmptyState bare Icon={SearchX} title="No enquiries match" action={<ButtonLink href={PATH} variant="secondary"><Words k="Clear filters" /></ButtonLink>}>
      {params.q ? `Nobody called “${params.q}”. Try the phone number.` : "Try a different filter."}
    </EmptyState>
  ) : (
    <EmptyState bare Icon={Inbox} title={own ? "No enquiries of yours yet" : "No enquiries yet"} action={canAdd ? <AddEnquiryButton c={choices} /> : undefined}>
      <Words k="Add each walk-in or phone enquiry here, with a follow-up date, so no family is forgotten." />
    </EmptyState>
  );

  return (
    <>
      <AdmissionHead href={PATH} sub={sub} actions={actions} />
      <ViewYearStrip year={yearView} back={backToThisYear(PATH, raw)} />
        <div className={cx("grid gap-5 lg:gap-6 items-start", panel && "xl:grid-cols-[minmax(0,1fr)_420px]")}>
          <div className={cx("min-w-0 flex-col gap-4", panel ? "hidden xl:flex" : "flex")}>
            <Chips value={quick} options={quickOpts} />
            <Card className="overflow-hidden">
              <div className="flex flex-col gap-2.5 p-3 md:p-4 border-b border-line/70">
                <div className="flex flex-col md:flex-row gap-2.5 md:items-center">
                  <UrlSearch placeholder="Child, parent, phone or ENQ number" />
                  <UrlSegmented param="view" label="Show" options={[{ value: "all", label: "All enquiries" }, { value: "whatsapp", label: <><MessageCircle size={15} aria-hidden="true" /><Words k="WhatsApp" /></> }]} />
                  {!narrow && <ExportMenu href={listHref(`${PATH}/export`, params, { page: null, id: null })} />}
                </div>
                <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2">
                  <PeriodFilter timeZone={tz} allLabel="Any date added" className="col-span-2 md:col-span-1" />
                  <UrlSelect param="class" label="Class" allLabel="All classes" options={choices.classes} className="md:w-36" />
                  <UrlSelect param="source" label="Source" allLabel="All sources" options={live(settings.sourceList).map((s) => ({ value: s.key, label: s.label }))} className="md:w-36" />
                  {!own && <UrlSelect param="owner" label="Owner" allLabel="All owners" options={[...choices.owners.map((o) => ({ value: o.value, label: o.label.replace(/ \(.*\)$/, "") })), { value: "none", label: "No owner" }]} className="col-span-2 md:col-span-1 md:w-44" />}
                </div>
              </div>
              {selectable && <EnquiryBulk owners={choices.owners} campaigns={settings.campaignsOn} schoolName={current.school.name} />}
              <DataList caption="Enquiries" {...rowList(columns)} rows={listRows} minWidth={narrow ? 600 : 980} empty={empty} selectOnPhone
                select={selectable ? { form: BULK_FORM, value: (r) => r.key, label: (r) => `Select ${r.mobile.avatar ?? "enquiry"}` } : undefined}
                footer={<Pager page={params.page} pageSize={PAGE_SIZE} total={total} prevHref={listHref(PATH, params, { page: params.page - 1 })} nextHref={listHref(PATH, params, { page: params.page + 1 })} />} />
            </Card>
          </div>
          {panel && (
            <EnquiryPanel key={panel.id} e={panel} closeHref={listHref(PATH, params, { id: null })} canWork={data.canWork} full={full}
              canArchive={full && can(current.permissions, "admission-management", "archive")} c={choices}
              statuses={live(settings.statusList).filter((s) => !CLOSED_STATUSES.includes(s.key)).map((s) => ({ value: s.key, label: s.label }))}
              lossReasons={live(settings.lossList).map((s) => ({ value: s.key, label: s.label }))}
              templates={enquiryTemplates(current.school.name, panel)} />
          )}
          {openId && !panel && (
            <Card className="xl:col-start-2"><EmptyState Icon={SearchX} title="Enquiry not found" action={<ButtonLink href={PATH} variant="secondary"><Words k="All enquiries" /></ButtonLink>}><Words k="It may have been archived, or it belongs to someone else." /></EmptyState></Card>
          )}
        </div>
    </>
  );
}
