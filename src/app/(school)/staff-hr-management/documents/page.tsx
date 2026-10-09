import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { hrPage, BASE } from "@/lib/staff/page";
import { docStatus, DOC_TONE, showDocNumber, type DocStatus } from "@/lib/staff/documents";
import { hrSettings } from "@/lib/staff/settings";
import { monthEnd } from "@/lib/staff/dates";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { SubNav, Stat } from "../_components/bits";
import { UploadDocumentForm } from "./upload-form";
import { uploadDocument } from "./actions";

export const metadata: Metadata = { title: "Documents & ID Cards" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUSES: DocStatus[] = ["Expired", "Expiring soon", "Missing", "Valid"];
const BATCH = 50;

export default async function DocumentsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, viewer, tz, today } = await hrPage();
  const view = sp.view === "id-cards" ? "id-cards" : "documents";
  const status = STATUSES.find((s) => s === sp.status) ?? null;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const hr = viewer.change === "all";

  const data = await withSchool(current.ctx, async (tx) => {
    const settings = await hrSettings(tx, current.ctx);
    const soonDays = Math.max(...settings.reminderDays, 30);
    const [docs, staff, designations, printed] = await Promise.all([
      tx.staffDocument.findMany({
        where: { archivedAt: null, staff: { archivedAt: null, status: { notIn: ["RESIGNED", "RETIRED", "TERMINATED"] }, ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { staffCode: { contains: q, mode: "insensitive" } }] } : {}) } },
        include: { staff: { select: { id: true, fullName: true, staffCode: true, designation: true } } },
        orderBy: [{ expiresOn: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        take: 1000,
      }),
      tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true, designation: true } }),
      tx.staff.groupBy({ by: ["designation"], where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } }, _count: true, orderBy: { designation: "asc" } }),
      tx.staffIdCardPrint.findMany({ distinct: ["staffId"], select: { staffId: true } }),
    ]);
    return { settings, soonDays, docs, staff, designations, printed: new Set(printed.map((p) => p.staffId)) };
  });

  const rows = data.docs.map((d) => ({ ...d, st: docStatus(d, today, data.soonDays) }));
  const endOfMonth = monthEnd(today);
  const thisMonth = rows.filter((r) => r.expiresOn && r.expiresOn >= today && r.expiresOn <= endOfMonth).length;
  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.st === s).length])) as Record<DocStatus, number>;
  const shown = status ? rows.filter((r) => r.st === status) : rows;
  const staffOptions = data.staff.map((s) => ({ value: s.id, label: `${s.fullName} (${s.staffCode})` }));
  const link = (p: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const all = { view: view === "documents" ? null : view, status, q: q || null, ...p };
    for (const [k, v] of Object.entries(all)) if (v) u.set(k, v);
    const s = u.toString();
    return `${BASE}/documents${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Documents & ID Cards" href={`${BASE}/documents`} userId={current.user.id}>
        {hr && view === "documents" && <UploadDocumentForm staffOptions={staffOptions} types={data.settings.documentTypes} action={uploadDocument} />}
      </PageHeader>
      <SubNav current={view} items={[
        { key: "documents", label: "Documents", href: `${BASE}/documents`, count: counts.Expired + counts["Expiring soon"] },
        { key: "id-cards", label: "ID cards", href: `${BASE}/documents?view=id-cards` },
      ]} />

      {view === "documents" ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Expired" value={counts.Expired} href={link({ status: "Expired" })} tone={counts.Expired ? "danger" : undefined} />
            <Stat label={`Expiring in ${data.soonDays} days`} value={counts["Expiring soon"]} href={link({ status: "Expiring soon" })} tone={counts["Expiring soon"] ? "warning" : undefined} />
            <Stat label="Expiring this month" value={thisMonth} />
            <Stat label="Missing file" value={counts.Missing} href={link({ status: "Missing" })} />
          </div>
          <Card>
            <CardHeader title={status ? `${status} documents` : "All documents"} description={`${shown.length} document${shown.length === 1 ? "" : "s"}. Reminders go ${data.settings.reminderDays.join(" and ")} days before expiry to HR and the staff member.`} />
            <CardBody className="space-y-4">
              <form className="flex flex-wrap items-end gap-2" role="search" action={`${BASE}/documents`}>
                <div>
                  <label htmlFor="doc-q" className="mb-1 block text-sm font-medium">Search staff</label>
                  <input id="doc-q" name="q" defaultValue={q} placeholder="Name or staff ID" className="min-h-11 rounded-lg border border-line-strong bg-surface px-3" />
                </div>
                <div>
                  <label htmlFor="doc-status" className="mb-1 block text-sm font-medium">Status</label>
                  <select id="doc-status" name="status" defaultValue={status ?? ""} className="min-h-11 rounded-lg border border-line-strong bg-surface px-3">
                    <option value="">All</option>
                    {STATUSES.map((s) => <option key={s} value={s}>{s} ({counts[s]})</option>)}
                  </select>
                </div>
                <button className={buttonClass("secondary")}>Show</button>
                {(status || q) && <Link href={`${BASE}/documents`} className="inline-flex min-h-11 items-center px-2 text-brand-text underline">Clear filters</Link>}
              </form>
              {shown.length === 0 ? (
                <EmptyState title={rows.length ? "No documents match" : "No staff documents yet"}>
                  {rows.length ? "Change the status or search to see more." : "Upload certificates, ID proof and contracts with their expiry dates to get reminders before they expire."}
                </EmptyState>
              ) : (
                <ul className="divide-y divide-line">
                  {shown.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-medium"><Link href={`${BASE}/${d.staff.id}?tab=documents`} className="hover:underline">{d.staff.fullName}</Link> <span className="font-normal text-ink-2">· {d.staff.designation}</span></p>
                        <p className="text-sm text-ink-2">{d.kind}{d.number ? ` · ${showDocNumber(d.kind, d.number, viewer.restricted)}` : ""} · {d.expiresOn ? `Expires ${formatDate(d.expiresOn, tz)}` : "No expiry"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={DOC_TONE[d.st]}>{d.st}</Badge>
                        {d.fileId && <a href={`${BASE}/files/${d.fileId}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center px-2 font-medium text-brand-text hover:underline">Open<span className="sr-only"> {d.kind} of {d.staff.fullName}</span></a>}
                        {hr && d.st !== "Valid" && <UploadDocumentForm staffOptions={staffOptions} types={data.settings.documentTypes} action={uploadDocument} fixedStaffId={d.staff.id} replace={{ id: d.id, kind: d.kind }} />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
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
      <div className="space-y-5">
        <Card>
          <CardHeader title="Print ID cards" description={`${total} staff · ${never} never printed. Cards print ${BATCH} to a PDF, 8 cards on each A4 sheet, with the design from Settings, Documents & Templates.`} />
          <CardBody className="space-y-4">
            {total === 0 ? <p className="text-ink-2">No active staff to print.</p> : (
              <>
                <div>
                  <p className="mb-2 font-medium">All staff</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: batches }, (_, i) => (
                      <a key={i} className={buttonClass(i === 0 ? "primary" : "secondary", "sm")} href={`${BASE}/id-cards?batch=${i + 1}`} target="_blank" rel="noopener">
                        {batches === 1 ? `Print all ${total}` : `Batch ${i + 1} of ${batches} (${Math.min(BATCH, total - i * BATCH)})`}
                      </a>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 font-medium">By designation</p>
                  <ul className="divide-y divide-line">
                    {data.designations.map((d) => {
                      const n = d._count;
                      const b = Math.ceil(n / BATCH);
                      return (
                        <li key={d.designation} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <span><span className="font-medium">{d.designation}</span> <span className="text-ink-2">· {n}</span></span>
                          <span className="flex flex-wrap gap-2">
                            {Array.from({ length: b }, (_, i) => (
                              <a key={i} className={buttonClass("secondary", "sm")} href={`${BASE}/id-cards?designation=${encodeURIComponent(d.designation)}&batch=${i + 1}`} target="_blank" rel="noopener">
                                {b === 1 ? "Print" : `Batch ${i + 1} of ${b}`}<span className="sr-only"> ID cards for {d.designation}</span>
                              </a>
                            ))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <p className="text-sm text-ink-2">To print chosen staff, tick them on the <Link href={BASE} className="text-brand-text underline">Staff List</Link> and choose Print ID cards. A card printed before is recorded as a reprint.</p>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    );
  }
}
