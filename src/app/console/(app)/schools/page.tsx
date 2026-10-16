import type { Metadata } from "next";
import { Download, Plus, Send } from "lucide-react";
import { requireConsole } from "@/lib/console/current";
import { filterChoices, listSchools, readSchoolFilters, SETUP_FILTER, CONSOLE_TZ, type SchoolRow } from "@/lib/console/list";
import { maskMobile } from "@/lib/console/activity";
import { withConsole } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageHead } from "@/components/ui/display";
import { Chips, DataList, ListEmpty, Progress, TONE_TEXT } from "@/components/ui/kit";
import { ExportMenu } from "@/components/ui/kit-client";
import { InlineBulkBar } from "@/components/ui/list-controls";
import { ListToolbar } from "@/components/list/list-toolbar";
import { cx } from "@/components/ui/cx";
import { SchoolLogo, StatusPill } from "@/components/console/bits";
import { ActSheet } from "@/components/console/sheets";
import { CloseSheetButton, UrlSheet } from "@/components/ui/url-sheet";
import { bulkResendAction } from "./actions";

export const metadata: Metadata = { title: "Schools" };

type SP = Record<string, string | string[] | undefined>;

export default async function SchoolsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const c = await requireConsole();
  const sp = await searchParams;
  const f = readSchoolFilters({ ...sp, ids: undefined });
  const [data, choices] = await Promise.all([listSchools(f), filterChoices()]);
  const fresh = await withConsole((tx) => {
    const now = new Date();
    const ist = new Date(now.toLocaleString("en-US", { timeZone: CONSOLE_TZ }));
    return tx.consoleSchool.count({ where: { status: { not: "CLOSED" }, createdAt: { gte: new Date(Date.UTC(ist.getFullYear(), ist.getMonth(), 1) - 330 * 60_000) } } });
  });
  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && !["status", "bulk", "ids"].includes(k)) keep.set(k, v);
  const withStatus = (s: string) => { const n = new URLSearchParams(keep); if (s) n.set("status", s); return n.toString() ? `/console/schools?${n}` : "/console/schools"; };
  const here = withStatus(f.status);
  const exportQs = new URLSearchParams(keep);
  if (f.status) exportQs.set("status", f.status);
  const exportHref = `/console/schools/export${exportQs.toString() ? `?${exportQs}` : ""}`;

  // Bulk resend: the chosen schools whose admin has not signed in and has a live or expired invite.
  let sheet: React.ReactNode = null;
  if (sp.bulk === "resend" && c.can("invite")) {
    const ids = readSchoolFilters({ ids: sp.ids }).ids ?? [];
    const chosen = data.rows.filter((r) => ids.includes(r.id));
    const pend = chosen.filter((r) => r.status !== "CLOSED" && r.inviteId && r.admin.tone !== "ok");
    const invites = pend.length ? await withConsole((tx) => tx.schoolInvite.findMany({ where: { id: { in: pend.map((r) => r.inviteId!) } } })) : [];
    sheet = pend.length === 0
      ? <UrlSheet title="Nothing to resend" closeHref={here} footer={<CloseSheetButton variant="secondary">Close</CloseSheetButton>}><p className="text-[14px] text-ink2">Every chosen school already has an admin who signed in, or has no invite to resend.</p></UrlSheet>
      : (
        <ActSheet title={`Resend ${pend.length} admin ${pend.length === 1 ? "invite" : "invites"}?`} closeHref={here} action={bulkResendAction} submitLabel={`Send ${pend.length} new ${pend.length === 1 ? "invite" : "invites"}`} hidden={{ pairs: pend.map((r) => `${r.id}:${r.inviteId}`).join(",") }}>
          <p>A new link goes on the same channels to:</p>
          <ul className="flex flex-col gap-1">
            {pend.map((r) => { const i = invites.find((x) => x.id === r.inviteId); return <li key={r.id}>· <b className="text-ink">{i?.name ?? r.adminName}</b>{i && <>, +91 {maskMobile(i.phone)}</>} <span className="text-ink3">({r.name})</span></li>; })}
          </ul>
          <p>Old links stop working.</p>
        </ActSheet>
      );
  }

  const bulkActions = [
    ...(c.can("invite") ? [{ label: "Resend admin invites", href: `${here}${here.includes("?") ? "&" : "?"}bulk=resend`, icon: <Send size={15} aria-hidden="true" /> }] : []),
    { label: "Export", href: `/console/schools/export?format=xlsx`, file: true, icon: <Download size={15} aria-hidden="true" /> },
  ];

  return (
    <div>
      <PageHead title="Schools" sub={`${data.total} ${data.total === 1 ? "school" : "schools"} · ${fresh} added this month`}
        actions={<><ExportMenu href={exportHref} className="hidden md:block" />{c.can("add") && <ButtonLink href="/console/schools/new" variant="primary" icon={Plus}>Add School</ButtonLink>}</>} />
      <Chips label="Status" value={f.status} options={[
        { value: "", label: "All schools", count: data.chips.all, href: withStatus("") },
        { value: "trial", label: "Trial", count: data.chips.trial, href: withStatus("trial") },
        { value: "active", label: "Active", count: data.chips.active, href: withStatus("active") },
        { value: "suspended", label: "Suspended", count: data.chips.suspended, href: withStatus("suspended") },
        { value: "closed", label: "Closed", count: data.chips.closed, href: withStatus("closed") },
      ]} />
      <div className="mt-4">
        <ListToolbar placeholder="School name, city, phone or school code" showArchived={false}
          period={{ timeZone: CONSOLE_TZ, allLabel: "Added: any date" }}
          filters={[
            { key: "board", label: "Board", options: choices.boards, allLabel: "All boards" },
            { key: "setup", label: "Setup", options: SETUP_FILTER, allLabel: "Any setup progress" },
          ]}
          more={[
            { key: "city", label: "City", options: choices.cities, allLabel: "Any city" },
            { key: "by", label: "Added by", options: choices.adders, allLabel: "Anyone in DREAM TEAM" },
          ]} />
      </div>
      <Card className="overflow-hidden">
        <InlineBulkBar form="schools-bulk" actions={bulkActions} />
        <DataList<SchoolRow>
          rows={data.rows}
          rowKey={(r) => r.id}
          href={(r) => `/console/schools/${r.id}`}
          minWidth={1000}
          caption="Schools"
          select={{ form: "schools-bulk", label: (r) => `Choose ${r.name}` }}
          empty={<ListEmpty title="No schools match" body={f.q ? `Nothing for “${f.q}”. Try the school code, like SPS-HYD-001, or the school’s phone.` : "Try a different status or filter."} action={<ButtonLink href="/console/schools" variant="secondary">Clear filters</ButtonLink>} />}
          columns={[
            { key: "school", label: "School", className: "min-w-[270px]", render: (r) => (
              <div className="flex items-center gap-3"><SchoolLogo name={r.name} size={38} /><div className="min-w-0"><p className="font-semibold leading-tight">{r.name}</p><p className="text-[12px] text-ink3 font-mono">{r.code}</p></div></div>
            ) },
            { key: "city", label: "City and board", nowrap: true, render: (r) => <><p className="leading-tight">{r.city ?? "—"}</p><p className="text-[12.5px] text-ink3">{r.board ?? "—"}</p></> },
            { key: "status", label: "Status", render: (r) => <><StatusPill status={r.status} /><p className={cx("text-[12px] mt-1 whitespace-nowrap", r.grace ? "text-warn font-semibold" : "text-ink3")}>{r.statusSub}</p></> },
            { key: "admin", label: "School Admin", render: (r) => <><p className="leading-tight whitespace-nowrap">{r.adminName}</p><p className={cx("text-[12.5px] font-semibold", r.admin.tone === "warn" || r.admin.tone === "bad" || r.admin.tone === "ok" || r.admin.tone === "info" ? TONE_TEXT[r.admin.tone] : "text-ink3")}>{r.admin.label}</p></> },
            { key: "setup", label: "Setup", render: (r) => (
              <div className="flex items-center gap-2.5 w-28"><Progress value={(r.setupDone * 100) / Math.max(1, r.setupTotal)} tone={r.setupDone >= r.setupTotal ? "ok" : r.stuck ? "warn" : "brand"} className="flex-1" label={`Setup ${r.setupDone} of ${r.setupTotal}`} /><span className="text-[13px] font-semibold tnum whitespace-nowrap">{r.setupDone} of {r.setupTotal}</span></div>
            ) },
            { key: "students", label: "Students", align: "right", render: (r) => (r.students ? <span className="font-semibold">{r.students.toLocaleString("en-IN")}</span> : <span className="text-ink3">—</span>) },
            { key: "added", label: "Added", nowrap: true, render: (r) => <><p>{formatDate(r.createdAt)}</p><p className="text-[12.5px] text-ink3">by {r.addedBy}</p></> },
          ]}
          mobile={(r) => ({
            lead: <SchoolLogo name={r.name} size={44} />,
            title: r.name,
            sub: `${r.city ?? "—"} · ${r.board ?? "—"} · ${r.adminName}`,
            pills: <><StatusPill status={r.status} className="!h-[22px] !text-[11.5px]" /><Pill tone={r.admin.tone} className="!h-[22px] !text-[11.5px]">{r.admin.label}</Pill><Pill tone="neutral" className="!h-[22px] !text-[11.5px]">Setup {r.setupDone} of {r.setupTotal}</Pill></>,
            right: <><p className="font-semibold tnum text-[14.5px]">{r.students ? r.students.toLocaleString("en-IN") : "—"}</p><p className="text-[11.5px] text-ink3">students</p></>,
          })}
          footer={<span className="flex w-full items-center justify-between gap-3"><span>Showing {data.rows.length} of {data.total}</span><span className="hidden md:inline">Counts only. Student names, fees and salaries stay inside each school.</span></span>}
        />
      </Card>
      {sheet}
    </div>
  );
}
