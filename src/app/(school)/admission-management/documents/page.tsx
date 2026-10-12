import type { Metadata } from "next";
import { FolderOpen, SearchX } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { momentWhere, periodFromSearch } from "@/lib/periods";
import { workPage, BASE } from "@/lib/admission/page";
import { UUID_RE } from "@/lib/admission/act";
import { progressOf } from "@/lib/admission/documents";
import { classRules, docLabel, openYears } from "@/lib/admission/settings";
import { names } from "@/lib/admission/choices";
import { phoneWords } from "@/lib/admission/words";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Chips } from "@/components/ui/chips";
import { Avatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/rows";
import { DataList, Pager, type ListRow } from "@/components/ui/data-list";
import { UrlSearch, UrlSelect } from "@/components/ui/url-filters";
import { PeriodFilter } from "@/components/list/period-filter";
import { EmptyState } from "@/components/empty-state";
import { cx } from "@/components/ui/cx";
import { AdmissionHead } from "../_components/head";
import { DocumentsPanel, type PanelApp, type PanelDoc } from "./panel";

export const metadata: Metadata = { title: "Documents & Verification" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const PATH = `${BASE}/documents`;
const NONE = "00000000-0000-0000-0000-000000000000";
const WORKING: Prisma.ApplicationWhereInput["stage"] = { in: ["SUBMITTED", "SUBMITTED_ONLINE", "REVIEWED", "DOCUMENTS", "TEST_INTERVIEW", "DECISION", "APPROVED", "WAITING_LIST"] };

export default async function DocumentsPage({ searchParams }: Search) {
  const { current, viewer, year, tz } = await workPage();
  const raw = await searchParams;
  const params = readListParams(raw, ["show", "class", "period", "from", "to"]);
  const range = periodFromSearch(raw, { timeZone: tz });
  const openId = typeof raw.id === "string" && UUID_RE.test(raw.id) ? raw.id : null;
  const f = params.filters;

  const data = await withSchool(current.ctx, async (tx) => {
    const years = await openYears(tx);
    const base: Prisma.ApplicationWhereInput = {
      archivedAt: null, academicYearId: { in: years.length ? years.map((y) => y.id) : [NONE] }, stage: WORKING,
      ...(f.class && UUID_RE.test(f.class) ? { classId: f.class } : {}),
      ...(range ? { createdAt: momentWhere(range, tz) } : {}),
      ...(params.q ? { OR: [{ fullName: { contains: params.q, mode: "insensitive" } }, { applicationNo: { contains: params.q, mode: "insensitive" } }] } : {}),
    };
    const shows: Record<string, Prisma.ApplicationWhereInput> = {
      missing: { documents: { some: { required: true, status: { in: ["NOT_RECEIVED", "REJECTED"] } } } },
      verify: { documents: { some: { status: "RECEIVED" } } },
      done: { documents: { none: { required: true, status: { not: "VERIFIED" } } } },
    };
    const where = { ...base, ...(f.show && shows[f.show] ? { AND: [shows[f.show]] } : {}) };
    const [rows, total, rules, n, all, missing, verify, done] = await Promise.all([
      tx.application.findMany({ where, orderBy: { createdAt: "asc" }, ...skipTake(params), include: { documents: { select: { docType: true, status: true } } } }),
      tx.application.count({ where }),
      classRules(tx),
      names(tx),
      tx.application.count({ where: base }),
      tx.application.count({ where: { ...base, AND: [shows.missing] } }),
      tx.application.count({ where: { ...base, AND: [shows.verify] } }),
      tx.application.count({ where: { ...base, AND: [shows.done] } }),
    ]);
    let panel: PanelApp | null = null;
    if (openId) {
      const app = await tx.application.findFirst({ where: { id: openId, archivedAt: null }, include: { documents: true } });
      if (app) {
        const checklist = rules.get(app.classId)?.documents ?? [];
        const ids = [...new Set(app.documents.flatMap((d) => [d.verifiedById, d.uploadedById]).filter((x): x is string => Boolean(x)))];
        const users = await tx.userLogin.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
        const who = (id: string | null) => users.find((u) => u.id === id)?.displayName ?? "Parent (online)";
        const types = [...checklist, ...app.documents.filter((d) => !checklist.some((c) => c.type === d.docType)).map((d) => ({ type: d.docType, required: d.required }))];
        const docs: PanelDoc[] = types.map((c) => {
          const d = app.documents.find((x) => x.docType === c.type);
          const status = d?.status ?? "NOT_RECEIVED";
          const detail = status === "VERIFIED" ? `By ${who(d!.verifiedById)}, ${d!.verifiedAt ? formatDateTime(d!.verifiedAt, tz) : ""}${d!.originalSeen ? " · original seen at counter" : ""}`
            : status === "RECEIVED" ? `Uploaded ${d!.uploadedAt ? formatDateTime(d!.uploadedAt, tz) : ""}${d!.uploadedById ? ` by ${who(d!.uploadedById)}` : ""}`
              : status === "REJECTED" ? `Rejected: ${d!.rejectReason ?? ""}. A new copy is needed.` : "Not collected yet";
          return { type: c.type, label: docLabel(c.type), required: c.required, id: d?.id ?? null, status, detail, fileHref: d?.fileId ? `${BASE}/files/${d.fileId}` : null, originalSeen: Boolean(d?.originalSeen), rejectReason: d?.rejectReason ?? null };
        });
        const p = progressOf(app.documents, checklist);
        const y = years.find((x) => x.id === app.academicYearId);
        panel = {
          id: app.id, name: app.fullName, className: n.classes.get(app.classId) ?? "", applicationNo: app.applicationNo,
          yearLabel: y ? (y.status === "ACTIVE" && year && year.id !== y.id ? `${y.name} mid-year` : y.name) : "",
          parent: app.fatherName ?? app.motherName ?? app.guardianName ?? "Parent", phone: phoneWords(app.phone),
          verified: p.requiredVerified, required: p.required, docs,
          missing: docs.filter((d) => d.status === "NOT_RECEIVED" || d.status === "REJECTED").map((d) => d.status === "REJECTED" ? `${d.label} (new copy: ${(d.rejectReason ?? "").toLowerCase()})` : d.label),
        };
      }
    }
    return { rows, total, rules, n, counts: { all, missing, verify, done }, panel };
  });

  const { n, panel } = data;
  const chip = (v: string | null) => listHref(PATH, params, { show: v, page: null });
  const rowHref = (id: string) => listHref(PATH, params, { id });
  const filtered = Boolean(params.q || Object.keys(f).length);
  const classes = [...n.classes.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  const listRows: ListRow[] = data.rows.map((r) => {
    const checklist = data.rules.get(r.classId)?.documents ?? [];
    const p = progressOf(r.documents, checklist);
    const toVerify = r.documents.filter((d) => d.status === "RECEIVED").length;
    const missing = checklist.filter((c) => !r.documents.some((d) => d.docType === c.type && (d.status === "RECEIVED" || d.status === "VERIFIED"))).map((c) => docLabel(c.type));
    const cls = n.classes.get(r.classId) ?? "";
    const done = p.required === 0 || p.requiredVerified >= p.required;
    return {
      key: r.id, href: rowHref(r.id), active: r.id === openId,
      cells: [
        <div key="c" className="flex items-center gap-3 min-w-0"><Avatar name={r.fullName} size={34} /><div className="min-w-0"><p className="font-semibold leading-tight truncate">{r.fullName}</p><p className="text-[12px] text-ink3 whitespace-nowrap">{cls} · <span className="font-mono">{r.applicationNo}</span></p></div></div>,
        <span key="p" className="flex items-center gap-2 w-32"><Progress value={p.required ? (p.requiredVerified / p.required) * 100 : 100} tone={done ? "ok" : "warn"} className="flex-1" /><span className="text-[12.5px] font-semibold tnum">{p.requiredVerified} of {p.required}</span></span>,
        missing.length ? <span key="m" className="text-[13px] text-warn">{missing.join(", ")}</span> : toVerify ? <span key="m" className="text-[13px] text-info">{toVerify} to verify</span> : <span key="m" className="text-[13px] text-ok">None</span>,
      ],
      mobile: {
        title: r.fullName, sub: `${cls} · ${p.requiredVerified} of ${p.required} verified`, avatar: r.fullName,
        pills: [missing.length ? <Pill key="m" tone="warn" className="!h-[22px] !text-[11.5px]">{missing.length} missing</Pill> : done ? <Pill key="ok" tone="ok" className="!h-[22px] !text-[11.5px]">All verified</Pill> : <Pill key="v" tone="info" className="!h-[22px] !text-[11.5px]">{toVerify} to verify</Pill>],
      },
    };
  });

  return (
    <>
      <AdmissionHead href={PATH} sub="Birth certificate, TC, marksheets and other papers, checked against the list for each class" />
      <div className={cx("grid gap-5 lg:gap-6 items-start", "xl:grid-cols-[minmax(0,1fr)_440px]")}>
        <div className={cx("min-w-0 flex-col gap-4", panel ? "hidden xl:flex" : "flex")}>
          <Chips value={f.show ?? "all"} label="Show" options={[
            { value: "all", label: "All applicants", count: data.counts.all, href: chip(null) },
            { value: "missing", label: "Papers missing", count: data.counts.missing, href: chip("missing") },
            { value: "verify", label: "To verify", count: data.counts.verify, href: chip("verify") },
            { value: "done", label: "All verified", count: data.counts.done, href: chip("done") },
          ]} />
          <Card className="overflow-hidden">
            <div className="flex flex-col md:flex-row gap-2.5 p-3 md:p-4 border-b border-line/70 md:items-center flex-wrap">
              <UrlSearch placeholder="Applicant name or application number" />
              <div className="grid grid-cols-2 md:flex gap-2">
                <PeriodFilter timeZone={tz} allLabel="Any date submitted" />
                <UrlSelect param="class" label="Class" allLabel="All classes" options={classes} className="md:w-36" />
              </div>
            </div>
            <DataList label="Applicants and their papers" columns={[{ key: "c", label: "Applicant" }, { key: "p", label: "Verified" }, { key: "m", label: "Missing papers" }]} rows={listRows} minWidth={560}
              empty={filtered ? (
                <EmptyState bare Icon={SearchX} title="No applicants match" action={<ButtonLink href={PATH} variant="secondary">Clear filters</ButtonLink>}>Try another filter or search.</EmptyState>
              ) : (
                <EmptyState bare Icon={FolderOpen} title="No applicants yet">Applicants still being processed appear here with the papers for their class.</EmptyState>
              )}
              footer={<Pager page={params.page} pageSize={PAGE_SIZE} total={data.total} prevHref={listHref(PATH, params, { page: params.page - 1 })} nextHref={listHref(PATH, params, { page: params.page + 1 })} />} />
          </Card>
        </div>
        {panel ? (
          <DocumentsPanel key={panel.id} a={panel} closeHref={listHref(PATH, params, {})} canWork={viewer.change === "all"} />
        ) : openId ? (
          <Card><EmptyState bare Icon={SearchX} title="Applicant not found" action={<ButtonLink href={PATH} variant="secondary">All applicants</ButtonLink>}>It may have been archived.</EmptyState></Card>
        ) : (
          <Card className="hidden xl:block"><EmptyState bare Icon={FolderOpen} title="Pick an applicant">Their checklist for the class applied for opens here, with Verify and Reject on each paper.</EmptyState></Card>
        )}
      </div>
    </>
  );
}
