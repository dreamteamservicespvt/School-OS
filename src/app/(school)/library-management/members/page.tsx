// Members & Cards (13 §2): every active student and staff member borrows
// automatically, with the limit from Library Settings. The list shows the
// card number, limit, books out, fines due and status. The librarian blocks
// or unblocks a member and changes a limit, each with a reason, and prints
// library cards by class from the "Library card" design.
import Link from "next/link";
import type { Metadata } from "next";
import { IdCard, Search, UsersRound } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatRupees } from "@/lib/format";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { fileLink } from "@/lib/files";
import { yearsFor } from "@/lib/academic/years";
import { sectionsForCurrentYears } from "@/lib/academic";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { SegLinks } from "@/components/ui/blocks";
import { Pager } from "@/components/ui/data-list";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSearch, UrlSelect } from "@/components/ui/url-controls";
import { Stats, Stack, Toolbar, DataList, Empty } from "@/components/money/kit";
import { memberByKey, type Member } from "@/lib/library/members";
import type { LibrarySettings } from "@/lib/library/settings";
import { books as bookWords } from "@/lib/library/words";
import { LibHead } from "../_components/head";
import { BlockSheet, LimitSheet } from "../_components/sheets";
import { BASE, libGuard, one, qs, type SearchParams } from "../_lib/page";
import { memberRows, readMembersFilter, type MemberRow } from "../_lib/members";

export const metadata: Metadata = { title: "Members & Cards · Library Management" };

const settingsLimit = (s: LibrarySettings, m: Pick<Member, "kind" | "level">) => (m.kind === "STAFF" ? s.staffBooks : s.rules.find((r) => r.level === m.level)?.books ?? s.studentBooks);

export default async function MembersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await libGuard("members");
  const { current, settings: s, can, today } = p;
  const params = readListParams(sp, ["type", "sec"]);
  const f = readMembersFilter((k) => one(sp[k]));
  const blockKey = can.members ? one(sp.block) : "";
  const limitKey = can.members ? one(sp.limit) : "";

  const d = await withSchool(current.ctx, async (tx) => {
    // Each campus's current year (a school's campuses can start the year on different dates).
    const yearIds = (await yearsFor(tx, current.ctx, current.campusId)).map((y) => y.id);
    const [list, sections, blocked, staffCount, studentCount, sheetMember] = await Promise.all([
      memberRows(tx, current.ctx, s, f, today, skipTake(params)),
      sectionsForCurrentYears(tx, current.ctx, current.campusId),
      tx.libraryMember.count({ where: { blockedAt: { not: null } } }),
      tx.staff.count({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } } }),
      yearIds.length ? tx.enrolment.count({ where: { academicYearId: { in: yearIds }, archivedAt: null, student: { archivedAt: null, status: { in: ["ACTIVE", "ADMITTED", "PROMOTED"] } } } }) : Promise.resolve(0),
      blockKey || limitKey ? memberByKey(tx, current.ctx, s, blockKey || limitKey) : Promise.resolve(null),
    ]);
    const out = await tx.bookIssue.count({ where: { returnedAt: null } });
    return { ...list, sections, blocked, staffCount, studentCount, sheetMember, out };
  });

  const base = `${BASE}/members`;
  const href = (change: Record<string, string | number | null>) => listHref(base, params, { page: null, ...change });
  const tabHref = (t: string) => listHref(base, { ...params, filters: {}, q: "", page: 1 }, { type: t === "students" ? null : t });
  const exportHref = qs(`${base}/export`, { type: f.tab === "students" ? null : f.tab, q: f.q || null, sec: f.sec || null });
  const sectionName = d.sections.find((x) => x.id === f.sec)?.label;
  const cardsHref = f.tab === "staff" ? `${base}/cards?type=staff` : f.sec ? `${base}/cards?sec=${f.sec}` : null;

  const actions = can.members && cardsHref ? (
    <ButtonLink href={cardsHref} icon={IdCard} target="_blank" prefetch={false}>{f.tab === "staff" ? "Print staff cards" : `Print cards for ${sectionName}`}</ButtonLink>
  ) : undefined;

  const columns = [
    { key: "name", label: "Name", render: (m: MemberRow) => (
      <span className="flex items-center gap-2.5 min-w-[180px]"><Avatar name={m.name} src={m.photoFileId ? fileLink(m.photoFileId, current.ctx.schoolId) : null} size={32} /><b className="font-semibold">{m.name}</b></span>
    ) },
    { key: "type", label: "Type", render: (m: MemberRow) => (m.kind === "STAFF" ? "Staff" : "Student") },
    { key: "group", label: "Class or department", render: (m: MemberRow) => m.group },
    { key: "card", label: "Card no.", nowrap: true, render: (m: MemberRow) => <span className="font-mono text-[13px]">{m.cardNo}</span> },
    { key: "limit", label: "Limit", nowrap: true, render: (m: MemberRow) => <span title={m.limitChanged ? `Changed: ${m.limitChanged.reason}` : undefined}>{bookWords(m.limit)}{m.limitChanged && <span className="text-info"> *</span>}</span> },
    { key: "out", label: "Books out", align: "right" as const, render: (m: MemberRow) => <span className={m.overdue ? "text-bad font-semibold" : ""}>{m.out}{m.overdue ? ` (${m.overdue} late)` : ""}</span> },
    { key: "fines", label: "Fines due", align: "right" as const, nowrap: true, render: (m: MemberRow) => (m.finesPaise > BigInt(0) ? <span className="text-warn font-semibold">{formatRupees(m.finesPaise)}</span> : "") },
    { key: "status", label: "Status", render: (m: MemberRow) => (m.blocked ? <Pill tone="bad">Blocked</Pill> : m.active ? <Pill tone="ok">Active</Pill> : <Pill>Not active</Pill>) },
    ...(can.members ? [{ key: "act", label: "", render: (m: MemberRow) => (
      <span className="flex gap-3 justify-end text-[13px] font-semibold whitespace-nowrap">
        <Link href={href({ limit: m.key })} scroll={false} className="text-brand hover:underline">Limit</Link>
        <Link href={href({ block: m.key })} scroll={false} className={m.blocked ? "text-brand hover:underline" : "text-bad hover:underline"}>{m.blocked ? "Unblock" : "Block"}</Link>
      </span>
    ) }] : []),
  ];

  return (
    <>
      <LibHead pageName="Members & Cards" href={base} mode={p.mode} actions={actions} sub="Every student and staff member borrows automatically. Limits come from Library Settings." />
      <Stack>
        <Stats items={[
          { label: "Students", value: d.studentCount.toLocaleString("en-IN"), href: tabHref("students"), active: f.tab === "students" },
          { label: "Staff", value: d.staffCount.toLocaleString("en-IN"), href: tabHref("staff"), active: f.tab === "staff" },
          { label: "Blocked", value: d.blocked.toLocaleString("en-IN"), tone: d.blocked ? "bad" : undefined, href: tabHref("blocked"), active: f.tab === "blocked" },
          { label: "Books out now", value: d.out.toLocaleString("en-IN") },
        ]} />
        <Card>
          <Toolbar className="md:flex-wrap">
            <SegLinks label="Members" value={f.tab} options={[{ value: "students", label: "Students", href: tabHref("students") }, { value: "staff", label: "Staff", href: tabHref("staff") }, { value: "blocked", label: "Blocked", href: tabHref("blocked") }]} />
            <UrlSearch placeholder={f.tab === "staff" ? "Search name or staff code" : "Search name or admission number"} label="Search members" className="flex-1 md:min-w-[260px]" id="members-search" />
            <div className="flex gap-2 flex-wrap">
              {f.tab === "students" && d.sections.length > 0 && <UrlSelect param="sec" label="Class" options={[{ value: "", label: "All classes" }, ...d.sections.map((x) => ({ value: x.id, label: x.label }))]} />}
              {can.export && <ExportButton href={exportHref} />}
            </div>
          </Toolbar>
          {can.members && f.tab === "students" && !f.sec && (
            <p className="px-5 py-2.5 text-[13px] text-ink3 border-b border-line flex items-center gap-2"><IdCard size={15} aria-hidden="true" />Choose a class to print its library cards. The card number is the admission number, as on the ID card.</p>
          )}
          <DataList rows={d.rows} rowKey={(m) => m.key} minWidth={900} caption="Library members"
            empty={<Empty icon={f.q ? Search : UsersRound} title={f.tab === "blocked" ? "Nobody is blocked" : f.q ? "No members match" : "No members"} body={f.q ? "Try another name or number." : undefined} />}
            columns={columns}
            phone={(m) => ({
              title: m.name, sub: `${m.group} · ${m.cardNo}`, avatar: m.name,
              right: m.blocked ? <Pill tone="bad">Blocked</Pill> : <span className="text-[12.5px] text-ink3 tnum">{m.out} of {m.limit}</span>,
              pills: <>
                {m.overdue > 0 && <Pill tone="bad">{m.overdue} late</Pill>}
                {m.finesPaise > BigInt(0) && <Pill tone="warn">{formatRupees(m.finesPaise)} due</Pill>}
                {can.members && <span className="flex gap-3 text-[12.5px] font-semibold"><Link href={href({ limit: m.key })} scroll={false} className="text-brand">Limit</Link><Link href={href({ block: m.key })} scroll={false} className={m.blocked ? "text-brand" : "text-bad"}>{m.blocked ? "Unblock" : "Block"}</Link></span>}
              </>,
            })}
          />
          {d.total > 0 && <Pager page={params.page} pageSize={PAGE_SIZE} total={d.total} prevHref={listHref(base, params, { page: params.page > 2 ? params.page - 1 : null })} nextHref={listHref(base, params, { page: params.page + 1 })} />}
        </Card>
      </Stack>
      {d.sheetMember && blockKey && <BlockSheet closeHref={href({ block: null })} memberKey={d.sheetMember.key} name={d.sheetMember.name} blocked={Boolean(d.sheetMember.blocked)} />}
      {d.sheetMember && limitKey && !blockKey && (
        <LimitSheet closeHref={href({ limit: null })} memberKey={d.sheetMember.key} name={d.sheetMember.name} limit={d.sheetMember.limit} fromSettings={!d.sheetMember.limitChanged} settingsLimit={settingsLimit(s, d.sheetMember)} />
      )}
    </>
  );
}
