import type { Metadata } from "next";
import Link from "next/link";
import { FileWarning, FolderOpen, Hourglass, IdCard, Printer, SearchX, FileX } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { dateWhere, periodFromSearch } from "@/lib/periods";
import { hrPage, BASE } from "@/lib/staff/page";
import { docStatus, DOC_TONE, showDocNumber, type DocStatus } from "@/lib/staff/documents";
import { hrSettings } from "@/lib/staff/settings";
import { monthEnd } from "@/lib/staff/dates";
import { campusStaffWhere } from "@/lib/staff/list";
import { StaffHead } from "../_components/head";
import { Avatar } from "../_components/bits";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Empty, ListFooter, Row as ListRow, SegLinks, Stats, Toolbar } from "@/components/ui/blocks";
import { DataList, cardPill, type DataColumn } from "@/components/ui/data-list";
import { ListToolbar } from "@/components/list/list-toolbar";
import { UploadDocumentForm } from "./upload-form";
import { uploadDocument } from "./actions";

export const metadata: Metadata = { title: "Documents & ID Cards" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUSES: DocStatus[] = ["Expired", "Expiring soon", "Missing", "Valid"];
const BATCH = 50;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function DocumentsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, viewer, tz, today } = await hrPage();
  const view = sp.view === "id-cards" ? "id-cards" : sp.view === "all" ? "all" : "attention";
  const status = STATUSES.find((s) => s === sp.status) ?? null;
  const q = one(sp.q).trim().slice(0, 60);
  const range = periodFromSearch(sp, { timeZone: tz });
  const hr = viewer.change === "all";

  const data = await withSchool(current.ctx, async (tx) => {
    const settings = await hrSettings(tx, current.ctx);
    const soonDays = Math.max(...settings.reminderDays, 30);
    // One campus: the documents, counts and ID cards of their campus's staff (and their own).
    const mine = campusStaffWhere(viewer);
    const onRoll = { archivedAt: null, status: { notIn: ["RESIGNED" as const, "RETIRED" as const, "TERMINATED" as const] }, AND: [mine] };
    const [all, docs, staff, designations, printed] = await Promise.all([
      tx.staffDocument.findMany({ where: { archivedAt: null, staff: onRoll }, select: { fileId: true, expiresOn: true, staffId: true } }),
      tx.staffDocument.findMany({
        where: {
          archivedAt: null,
          ...(range ? { expiresOn: dateWhere(range) } : {}),
          staff: { ...onRoll, ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { staffCode: { contains: q, mode: "insensitive" } }] } : {}) },
        },
        include: { staff: { select: { id: true, fullName: true, staffCode: true, designation: true, photoFileId: true } } },
        orderBy: [{ expiresOn: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        take: 1000,
      }),
      tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, AND: [mine] }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true, designation: true } }),
      tx.staff.groupBy({ by: ["designation"], where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, AND: [mine] }, _count: true, orderBy: { designation: "asc" } }),
      tx.staffIdCardPrint.findMany({ distinct: ["staffId"], select: { staffId: true } }),
    ]);
    return { settings, soonDays, all, docs, staff, designations, printed: new Set(printed.map((p) => p.staffId)) };
  });

  const everyDoc = data.all.map((d) => docStatus(d, today, data.soonDays));
  const counts = Object.fromEntries(STATUSES.map((s) => [s, everyDoc.filter((x) => x === s).length])) as Record<DocStatus, number>;
  const endOfMonth = monthEnd(today);
  const thisMonth = data.all.filter((r) => r.expiresOn && r.expiresOn >= today && r.expiresOn <= endOfMonth).length;
  const staffWithDocs = new Set(data.all.map((d) => d.staffId)).size;
  const rows = data.docs.map((d) => ({ ...d, st: docStatus(d, today, data.soonDays) }));
  type Doc = (typeof rows)[number];
  const shown = rows.filter((r) => (status ? r.st === status : view === "attention" ? r.st !== "Valid" : true));
  const staffOptions = data.staff.map((s) => ({ value: s.id, label: `${s.fullName} (${s.staffCode})` }));
  const anyFilter = Boolean(status || q || range);
  const viewHref = (v: string) => `${BASE}/documents${v === "attention" ? "" : `?view=${v}`}`;

  const columns: DataColumn<Doc>[] = [
    { key: "who", label: "Staff member", render: (d) => (
      <div className="flex items-center gap-3">
        <Avatar name={d.staff.fullName} photoFileId={d.staff.photoFileId} size={34} />
        <div className="min-w-0"><p className="font-semibold leading-tight">{d.staff.fullName}</p><p className="text-[12.5px] text-ink3">{d.staff.designation}</p></div>
      </div>
    ) },
    { key: "kind", label: "Document", render: (d) => d.kind },
    { key: "number", label: "Number", render: (d) => d.number ? <span className="font-mono text-[13px]">{showDocNumber(d.kind, d.number, viewer.restricted)}</span> : <span className="text-ink3">–</span> },
    { key: "expires", label: "Expires", nowrap: true, render: (d) => d.expiresOn ? <span className="tnum">{formatDate(d.expiresOn, tz)}</span> : <span className="text-ink3">No expiry</span> },
    { key: "status", label: "Status", render: (d) => <Pill tone={DOC_TONE[d.st]}>{d.st}</Pill> },
    { key: "act", label: <span className="sr-only">Actions</span>, align: "right", render: (d) => (
      <div className="relative z-[1] flex items-center justify-end gap-1">
        {d.fileId && <a href={`${BASE}/files/${d.fileId}`} target="_blank" rel="noopener" className={buttonClass("ghost", "sm")}>Open<span className="sr-only"> {d.kind} of {d.staff.fullName}</span></a>}
        {hr && d.st !== "Valid" && <UploadDocumentForm staffOptions={staffOptions} types={data.settings.documentTypes} action={uploadDocument} fixedStaffId={d.staff.id} replace={{ id: d.id, kind: d.kind }} />}
      </div>
    ) },
  ];

  return (
    <>
      <StaffHead page="Documents & ID Cards" href={`${BASE}/documents`} sub="Certificates, ID proof and contracts with expiry reminders · staff ID cards"
        actions={<>
          {view !== "id-cards" && <ButtonLink href={viewHref("id-cards")} icon={IdCard} className="max-md:hidden">ID cards</ButtonLink>}
          {hr && view !== "id-cards" && <UploadDocumentForm staffOptions={staffOptions} types={data.settings.documentTypes} action={uploadDocument} />}
        </>} />

      <Stats label="Staff documents" className="mb-5" items={[
        { label: "Documents on file", icon: FolderOpen, value: data.all.length - counts.Missing, sub: `for ${staffWithDocs} staff` },
        { label: "Expiring this month", icon: Hourglass, value: thisMonth, sub: `reminders ${data.settings.reminderDays.join(" and ")} days before`, tone: thisMonth ? "warn" : undefined },
        { label: "Expired", icon: FileWarning, value: counts.Expired, sub: "need renewal", tone: counts.Expired ? "bad" : undefined, href: `${BASE}/documents?status=Expired` },
        { label: "Missing", icon: FileX, value: counts.Missing, sub: "not collected yet", href: `${BASE}/documents?status=Missing` },
      ]} />

      <SegLinks label="Documents views" className="mb-4" value={view} options={[
        { value: "attention", label: "Needs attention", href: viewHref("attention") },
        { value: "all", label: "All documents", href: viewHref("all") },
        { value: "id-cards", label: "ID cards", href: viewHref("id-cards") },
      ]} />

      {view !== "id-cards" ? (
        <Card className="overflow-hidden">
          <Toolbar>
            <ListToolbar placeholder="Staff name or staff ID" showArchived={false} period={{ timeZone: tz, allLabel: "Expires: any" }}
              filters={[{ key: "status", label: "Status", allLabel: view === "attention" ? "Needs attention" : "Every status", options: STATUSES.map((s) => ({ value: s, label: `${s} (${counts[s]})` })) }]} />
          </Toolbar>
          <p className="border-b border-line px-4 py-3 text-[13.5px] text-ink2">Reminders go to HR and the staff member {data.settings.reminderDays.join(" and ")} days before expiry.</p>
          <DataList caption="Staff documents" rows={shown} columns={columns} rowKey={(d) => d.id} minWidth={900}
            rowHref={(d) => `${BASE}/${d.staff.id}?tab=documents`} rowLabel={(d) => `Open ${d.staff.fullName}'s documents`}
            mobile={(d) => ({ title: d.staff.fullName, avatar: d.staff.fullName, sub: `${d.kind} · ${d.expiresOn ? `expires ${formatDate(d.expiresOn, tz)}` : "no expiry"}`, pills: [<Pill key="s" tone={DOC_TONE[d.st]} className={cardPill}>{d.st}</Pill>] })}
            footer={<ListFooter shown={shown.length} total={shown.length} />}
            empty={anyFilter || rows.length
              ? <Empty icon={SearchX} title={view === "attention" && !anyFilter ? "Every document is in order" : "No documents match"} body={view === "attention" && !anyFilter ? "Nothing has expired, is expiring soon or is missing." : "Change the status, date or search to see more."} action={anyFilter ? <ButtonLink href={viewHref(view)}>Clear filters</ButtonLink> : undefined} />
              : <Empty icon={FolderOpen} title="No staff documents yet" body="Upload certificates, ID proof and contracts with their expiry dates to get reminders before they expire." />} />
        </Card>
      ) : (
        <IdCards />
      )}
    </>
  );

  function IdCards() {
    const total = data.staff.length;
    const batches = Math.ceil(total / BATCH);
    const never = data.staff.filter((s) => !data.printed.has(s.id)).length;
    return (
      <Card>
        <CardHeader title="Print ID cards" icon={Printer} description={`${total} staff · ${never} never printed. Cards print ${BATCH} to a PDF, 8 cards on each A4 sheet, with the design from Settings, Documents & Templates.`} />
        {total === 0 ? <p className="px-5 pb-5 text-ink3">No active staff to print.</p> : (
          <div className="space-y-4 px-5 pb-5">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: batches }, (_, i) => (
                <a key={i} className={buttonClass(i === 0 ? "primary" : "secondary", "md")} href={`${BASE}/id-cards?batch=${i + 1}`} target="_blank" rel="noopener">
                  <IdCard size={17} aria-hidden="true" />{batches === 1 ? `Print all ${total}` : `Batch ${i + 1} of ${batches} (${Math.min(BATCH, total - i * BATCH)})`}
                </a>
              ))}
            </div>
            <div className="divide-y divide-line rounded-2xl border border-line">
              {data.designations.map((d) => {
                const n = d._count;
                const b = Math.ceil(n / BATCH);
                return (
                  <ListRow key={d.designation} icon={IdCard} title={d.designation} sub={`${n} staff`} right={
                    <span className="flex flex-wrap gap-2">
                      {Array.from({ length: b }, (_, i) => (
                        <a key={i} className={buttonClass("secondary", "sm")} href={`${BASE}/id-cards?designation=${encodeURIComponent(d.designation)}&batch=${i + 1}`} target="_blank" rel="noopener">
                          {b === 1 ? "Print" : `Batch ${i + 1} of ${b}`}<span className="sr-only"> ID cards for {d.designation}</span>
                        </a>
                      ))}
                    </span>
                  } />
                );
              })}
            </div>
            <p className="text-[13px] text-ink3">To print chosen staff, tick them on the <Link href={BASE} className="font-semibold text-brand underline">Staff List</Link> and choose Print ID cards. A card printed before is recorded as a reprint.</p>
          </div>
        )}
      </Card>
    );
  }
}
