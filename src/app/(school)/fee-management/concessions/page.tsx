import Link from "next/link";
import { Award, BadgePercent, BookOpen, Gift, Hourglass, Paperclip, Plus, ReceiptIndianRupee, SearchX, ShieldCheck, Undo2 } from "lucide-react";
import { withSchool, type Tx } from "@/lib/db";
import type { SchoolContext } from "@/lib/db";
import { canDecide } from "@/lib/approvals";
import { fileLink } from "@/lib/files";
import { formatDate, formatRupees } from "@/lib/format";
import { canSeeStudent } from "@/lib/fees/access";
import { concessionRows, refundRows, scholarshipTypes, type ConcessionRow, type RefundRow } from "@/lib/fees/concession-list";
import { studentCard } from "@/lib/fees/dues";
import { findStudents } from "@/lib/fees/find";
import { refundable } from "@/lib/fees/refunds";
import { modeLabel, percentWord, REFUND_MODES } from "@/lib/fees/words";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Banner, DataList, DL, Empty, Stack, Stats, Toolbar, type Tone } from "@/components/money/kit";
import { LinkTabs } from "@/components/ui/link-tabs";
import { UrlSearch, UrlSegmented } from "@/components/money/url-filters";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { FeeHead } from "../_components/fee-head";
import { BASE, feePeriod, feeGuard, one, qs, type SearchParams } from "../_lib/page";
import { ApproveButton, ArchiveRule, ConcessionSheet, DeclineSheet, MarkRefundedSheet, RefundSheet, RevokeSheet, RuleSheet, RuleSwitch } from "./sheets";

export const metadata = { title: "Concessions & Refunds" };

const HREF = `${BASE}/concessions`;
const ZERO = BigInt(0);
const UUID = /^[0-9a-f-]{36}$/i;
const TABS = ["concessions", "bulk", "scholarships", "refunds"] as const;
type TabKey = (typeof TABS)[number];

const C_STATUS: Record<string, [string, BadgeTone, Tone]> = {
  WAITING: ["Waiting", "warn", "warn"],
  APPROVED: ["Approved", "info", "info"],
  APPLIED: ["Applied", "ok", "ok"],
  REJECTED: ["Rejected", "bad", "bad"],
  TAKEN_OFF: ["Taken off", "neutral", "neutral"],
  REFUNDED: ["Refunded", "ok", "ok"],
};
const status = (s: string) => C_STATUS[s] ?? [s, "neutral", "neutral"];

type Decision = { can: boolean; waitingFor: string };

/** Who may decide each waiting request, and who it waits for. */
async function decisions(tx: Tx, ctx: SchoolContext, approvalIds: string[]) {
  const out = new Map<string, Decision>();
  if (!approvalIds.length) return out;
  const approvals = await tx.approval.findMany({ where: { id: { in: approvalIds } } });
  const users = await tx.userLogin.findMany({ where: { id: { in: approvals.map((a) => a.currentApproverId).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
  const roles = await tx.role.findMany({ where: { key: { in: approvals.map((a) => a.currentApproverRole).filter((x): x is string => Boolean(x)) } }, select: { key: true, name: true } });
  for (const a of approvals) {
    const who = (a.currentApproverId && users.find((u) => u.id === a.currentApproverId)?.displayName) || (a.currentApproverRole && roles.find((r) => r.key === a.currentApproverRole)?.name) || "the approver";
    out.set(a.id, { can: await canDecide(tx, ctx, a), waitingFor: who });
  }
  return out;
}

/** Concessions & Refunds (06 §2, mod-fees.jsx Concessions): discounts, scholarships and refunds, each with a reason and who approved it. */
export default async function ConcessionsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await feeGuard("concessions");
  const sp = await searchParams;
  const canEdit = p.does("concessions");
  const tab: TabKey = (TABS as readonly string[]).includes(one(sp.tab)) ? (one(sp.tab) as TabKey) : "concessions";
  const q = one(sp.q).trim().slice(0, 80);
  const stRaw = one(sp.st);
  const per = feePeriod(sp, p.dates, null);
  const doing = canEdit ? one(sp.do) : "";
  const student = one(sp.student);
  const sq = one(sp.sq).trim().slice(0, 80);
  const open = UUID.test(one(sp.open)) ? one(sp.open) : "";
  const decline = canEdit && UUID.test(one(sp.decline)) ? one(sp.decline) : "";
  const revoke = canEdit && UUID.test(one(sp.revoke)) ? one(sp.revoke) : "";
  const mark = canEdit && UUID.test(one(sp.mark)) ? one(sp.mark) : "";
  const ruleId = one(sp.rule);
  const isRefunds = tab === "refunds";
  const st = isRefunds ? (["WAITING", "APPROVED", "REFUNDED", "REJECTED"].includes(stRaw) ? stRaw : "") : (["WAITING", "APPLIED", "REJECTED"].includes(stRaw) ? stRaw : "");
  const ctx = p.current.ctx;

  const data = await withSchool(ctx, async (tx) => {
    const yearId = p.year?.id ?? null;
    const filter = { q, status: st || null, range: per.range, timeZone: p.tz };
    const [cons, refs, schol, rules, heads, counts] = await Promise.all([
      tab === "concessions" ? concessionRows(tx, filter) : null,
      tab === "refunds" ? refundRows(tx, filter) : null,
      tab === "scholarships" ? Promise.all([scholarshipTypes(tx, yearId), concessionRows(tx, { ...filter, scholarship: true })]) : null,
      tx.bulkDiscountRule.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } }),
      tx.feeHead.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
      Promise.all([
        tx.concession.aggregate({ where: { status: "APPLIED", ...(yearId ? { academicYearId: yearId } : {}) }, _sum: { appliedPaise: true }, _count: { _all: true } }),
        tx.concession.count({ where: { status: "WAITING" } }),
        tx.refund.count({ where: { status: "WAITING" } }),
        tx.refund.aggregate({ where: { status: "REFUNDED", ...(p.year ? { refundedOn: { gte: p.year.startDate, lte: p.year.endDate } } : {}) }, _sum: { amountPaise: true }, _count: { _all: true } }),
        tx.refund.count({ where: { status: "APPROVED" } }),
        tx.concession.groupBy({ by: ["studentId"], where: { type: "SCHOLARSHIP", status: "APPLIED", ...(yearId ? { academicYearId: yearId } : {}) } }),
        tx.concession.count({ where: { type: "SCHOLARSHIP" } }),
        tx.concession.count(),
        tx.refund.count(),
      ]),
    ]);
    const ruleUse = await tx.concession.groupBy({ by: ["bulkRuleId"], where: { bulkRuleId: { in: rules.map((r) => r.id) }, status: "APPLIED" }, _count: { _all: true }, _sum: { appliedPaise: true } });

    // The record opened from Approvals or a row.
    let opened: { kind: "concession"; row: ConcessionRow } | { kind: "refund"; row: RefundRow } | null = null;
    if (open || decline || revoke || mark) {
      const idWanted = open || decline || revoke || mark;
      const c = await tx.concession.findFirst({ where: { id: idWanted }, select: { id: true, studentId: true, createdAt: true } });
      if (c) {
        const r = (await concessionRows(tx, { timeZone: p.tz, ids: [c.id] }, 1)).rows[0];
        if (r) opened = { kind: "concession", row: r };
      } else {
        const rf = await tx.refund.findFirst({ where: { id: idWanted }, select: { id: true } });
        if (rf) {
          const r = (await refundRows(tx, { timeZone: p.tz, ids: [rf.id] }, 1)).rows[0];
          if (r) opened = { kind: "refund", row: r };
        }
      }
    }

    const waitingIds = [
      ...(cons?.rows ?? []).filter((r) => r.status === "WAITING" && r.approvalId).map((r) => r.approvalId!),
      ...(refs?.rows ?? []).filter((r) => r.status === "WAITING" && r.approvalId).map((r) => r.approvalId!),
      ...(schol?.[1].rows ?? []).filter((r) => r.status === "WAITING" && r.approvalId).map((r) => r.approvalId!),
      ...(opened?.row.status === "WAITING" && opened.row.approvalId ? [opened.row.approvalId] : []),
    ];
    const decide = await decisions(tx, ctx, [...new Set(waitingIds)]);

    // New concession or refund: the student first, then the form.
    let pick = null;
    let chosen = null;
    const payments: { value: string; label: string; max: string; maxRupees: string; mode: string }[] = [];
    if (doing === "new" || doing === "refund") {
      if (UUID.test(student) && (await canSeeStudent(tx, p.viewer, student))) {
        const card = await studentCard(tx, ctx, student);
        if (card) chosen = { id: student, name: card.name, classLabel: card.classSection ?? "" };
        if (chosen && doing === "refund") {
          const pays = await tx.payment.findMany({ where: { studentId: student, status: "POSTED", broughtIn: false, cancelApprovalId: null }, orderBy: { paidAt: "desc" }, take: 40 });
          const receipts = await tx.receipt.findMany({ where: { paymentId: { in: pays.map((x) => x.id) } }, select: { paymentId: true, number: true } });
          for (const pay of pays) {
            const max = await refundable(tx, pay.id);
            if (max <= ZERO) continue;
            const no = receipts.find((r) => r.paymentId === pay.id)?.number ?? "Payment";
            payments.push({ value: pay.id, label: `${no} · ${formatDate(pay.paymentDate)} · ${formatRupees(pay.amountPaise)} · ${modeLabel(pay.mode)}`, max: formatRupees(max), maxRupees: (Number(max) / 100).toString(), mode: pay.mode });
          }
        }
      }
      if (!chosen) pick = sq ? await findStudents(tx, p.viewer, sq, p.today, 12) : [];
    }
    const accounts = mark ? await tx.bankAccount.findMany({ where: { archivedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true, accountLast4: true } }) : [];
    const scholarshipNames = doing === "new" ? (await tx.concession.groupBy({ by: ["scholarshipType"], where: { type: "SCHOLARSHIP", scholarshipType: { not: null } } })).map((r) => r.scholarshipType!) : [];
    return { cons, refs, schol, rules, ruleUse, heads, counts, opened, decide, pick, chosen, payments, accounts, scholarshipNames };
  });

  const [applied, waitingC, waitingR, refunded, toPay, scholStudents, scholCount, conCount, refCount] = data.counts;
  const keep = { tab: tab === "concessions" ? null : tab, q: q || null, st: st || null, ...per.keep };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const close = here();
  const tabHref = (t: TabKey) => qs(HREF, { tab: t === "concessions" ? null : t, ...per.keep });
  const limit = formatRupees(p.settings.concessionLimitPaise);
  const headOptions = data.heads.map((h) => ({ value: h.id, label: h.name }));
  const headName = new Map(data.heads.map((h) => [h.id, h.name]));
  const filtered = Boolean(q || st || per.range);

  const decideCell = (r: { status: string; approvalId: string | null; id: string }, kind: "concession" | "refund") => {
    if (r.status !== "WAITING") return null;
    const d = r.approvalId ? data.decide.get(r.approvalId) : undefined;
    if (canEdit && d?.can) {
      return (
        <div className="relative z-10 flex gap-1.5">
          <ApproveButton kind={kind} recordId={r.id} />
          <Link href={here({ decline: r.id })} scroll={false} className={buttonClass("ghost", "sm")}>Decline</Link>
        </div>
      );
    }
    return <span className="text-[12.5px] text-ink3">Waiting for {d?.waitingFor ?? "approval"}</span>;
  };

  const conColumns = (rows: ConcessionRow[]) => ({
    rows,
    rowKey: (c: ConcessionRow) => c.id,
    rowHref: (c: ConcessionRow) => here({ open: c.id }),
    minWidth: 960,
    columns: [
      { key: "name", label: "Student", render: (c: ConcessionRow) => <><p className="font-semibold leading-tight">{c.name}</p><p className="text-[12.5px] text-ink3">{[c.classLabel, formatDate(c.createdAt, p.tz)].filter(Boolean).join(" · ")}</p></> },
      { key: "type", label: "Type", nowrap: true, render: (c: ConcessionRow) => c.scholarshipType ?? c.typeLabel },
      { key: "amt", label: "Amount or %", align: "right" as const, render: (c: ConcessionRow) => <><b className="font-semibold">{c.value}</b>{c.value.endsWith("%") && c.amountPaise > ZERO && <span className="block text-[12px] text-ink3">about {formatRupees(c.amountPaise)}</span>}</> },
      { key: "heads", label: "Fee heads", render: (c: ConcessionRow) => <span className="text-[13px] text-ink2">{c.heads}</span> },
      { key: "reason", label: "Reason", render: (c: ConcessionRow) => <span className="text-[13px] text-ink2 block max-w-[220px]">{c.reason}{c.note && <span className="block text-ink3">{c.note}</span>}</span> },
      { key: "by", label: "Asked by", nowrap: true, render: (c: ConcessionRow) => <span className="text-[13px]">{c.askedBy}</span> },
      { key: "appr", label: "Approved by", render: (c: ConcessionRow) => <span className="text-[13px] text-ink2">{c.decidedBy ?? "—"}</span> },
      { key: "status", label: "Status", render: (c: ConcessionRow) => <div className="flex flex-col items-start gap-1.5"><Pill tone={status(c.status)[1]}>{status(c.status)[0]}</Pill>{decideCell(c, "concession")}</div> },
    ],
    phone: (c: ConcessionRow) => ({
      title: c.name, sub: `${c.scholarshipType ?? c.typeLabel} · ${c.value} · ${c.heads}`, icon: BadgePercent, iconTone: status(c.status)[2],
      pills: <><Pill tone={status(c.status)[1]} className="!h-[22px] !text-[11.5px]">{status(c.status)[0]}</Pill>{c.status === "WAITING" && decideCell(c, "concession")}</>,
    }),
  });

  const opened = data.opened;
  const chosen = data.chosen;

  return (
    <div>
      <FeeHead pageName="Concessions & Refunds" href={HREF} sub="Discounts, scholarships and refunds, each with a reason and who approved it"
        viewActions={tab !== "bulk" ? <ExportButton href={qs(`${HREF}/export`, { ...keep, tab })} /> : null}
        actions={<>
          <ButtonLink href={here({ do: "refund" })} scroll={false} variant="secondary" icon={Undo2}>New refund</ButtonLink>
          <ButtonLink href={here({ do: "new" })} scroll={false} variant="primary" icon={BadgePercent}>New concession</ButtonLink>
        </>} />
      <Stack>
        <Stats items={[
          { label: "Concessions this year", value: formatRupees(applied._sum.appliedPaise ?? ZERO), sub: `${applied._count._all} ${applied._count._all === 1 ? "concession" : "concessions"} applied`, icon: BadgePercent },
          { label: "Waiting for approval", value: String(waitingC + waitingR), sub: `${waitingC} ${waitingC === 1 ? "concession" : "concessions"} · ${waitingR} ${waitingR === 1 ? "refund" : "refunds"}`, tone: waitingC + waitingR ? "warn" : "ok", icon: Hourglass, href: qs(HREF, { tab: waitingC || !waitingR ? null : "refunds", st: "WAITING" }) },
          { label: "Refunds this year", value: formatRupees(refunded._sum.amountPaise ?? ZERO), sub: `${refunded._count._all} paid back${toPay ? ` · ${toPay} approved, to pay` : ""}`, icon: Undo2, href: tabHref("refunds") },
          { label: "Scholarship students", value: String(scholStudents.length), sub: "This year, applied", icon: Award, href: tabHref("scholarships") },
        ]} />
        <Banner tone="info" icon={ShieldCheck} title="Limits from Forms & Approvals:">
          concessions above {limit} and every refund go to Approvals. Smaller concessions apply at once. Nobody approves their own request.
        </Banner>

        <Card className="overflow-hidden">
          <LinkTabs className="px-3" label="Concessions and refunds" tabs={[
            { href: tabHref("concessions"), label: "Concessions", count: conCount, on: tab === "concessions" },
            { href: tabHref("bulk"), label: "Bulk discounts", count: data.rules.length, on: tab === "bulk" },
            { href: tabHref("scholarships"), label: "Scholarships", count: scholCount, on: tab === "scholarships" },
            { href: tabHref("refunds"), label: "Refunds", count: refCount, on: tab === "refunds" },
          ]} />

          {(tab === "concessions" || tab === "refunds") && (
            <Toolbar className="md:flex-wrap">
              <UrlSearch id="con-q" placeholder={isRefunds ? "Student or receipt no." : "Student or type"} label={isRefunds ? "Search refunds" : "Search concessions"} />
              <div className="flex flex-wrap gap-2.5 min-w-0">
                <UrlSegmented param="st" fallback="" label="Status" className="overflow-x-auto no-scrollbar" options={isRefunds
                  ? [{ value: "", label: "All" }, { value: "WAITING", label: "Waiting" }, { value: "APPROVED", label: "To pay" }, { value: "REFUNDED", label: "Refunded" }, { value: "REJECTED", label: "Rejected" }]
                  : [{ value: "", label: "All" }, { value: "WAITING", label: "Waiting" }, { value: "APPLIED", label: "Applied" }, { value: "REJECTED", label: "Rejected" }]} />
                <PeriodFilter {...p.dates} allLabel="Any date" />
              </div>
            </Toolbar>
          )}

          {tab === "concessions" && data.cons && (
            <DataList {...conColumns(data.cons.rows)} caption="Concessions"
              footer={`Showing ${data.cons.rows.length} of ${data.cons.total}${per.range ? ` · asked ${per.words}` : ""}`}
              empty={data.cons.total === 0 && !filtered
                ? <Empty icon={BadgePercent} title="No concessions yet" body="Discounts, sibling and staff-child concessions and late fee waivers show here with who asked and who approved." action={canEdit ? <ButtonLink href={here({ do: "new" })} scroll={false} variant="secondary" icon={Plus}>New concession</ButtonLink> : undefined} />
                : <Empty icon={SearchX} title="No concessions match" body="Try another search, status or date." action={<Link href={tabHref("concessions")} className={buttonClass("secondary")}>Clear filters</Link>} />} />
          )}

          {tab === "bulk" && (
            <div>
              {data.rules.length === 0 ? (
                <Empty icon={Gift} title="No bulk discount rules" body="Example: pay 3 months together, get 5% off. Collect Fee applies a rule by itself when a payment qualifies." />
              ) : (
                <ul className="divide-y divide-line/70">
                  {data.rules.map((r) => {
                    const use = data.ruleUse.find((u) => u.bulkRuleId === r.id);
                    const on = r.feeHeadIds.length ? r.feeHeadIds.map((h) => headName.get(h) ?? "Fee head").join(", ") : "All fee heads";
                    return (
                      <li key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                        <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><Gift size={18} aria-hidden="true" /></span>
                        <div className="min-w-0 flex-1">
                          {canEdit ? <Link href={here({ rule: r.id })} scroll={false} className="font-semibold text-[14.5px] leading-snug hover:underline">{r.name}</Link> : <p className="font-semibold text-[14.5px] leading-snug">{r.name}</p>}
                          <p className="text-[12.5px] text-ink3">{r.minInstallments}+ installments together · {percentWord(r.percentBp)} off · {on} · {use ? `used ${use._count._all} ${use._count._all === 1 ? "time" : "times"}, ${formatRupees(use._sum.appliedPaise ?? ZERO)}` : "not used yet"}</p>
                        </div>
                        {canEdit ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="hidden md:inline-flex"><ArchiveRule ruleId={r.id} name={r.name} /></span>
                            <RuleSwitch ruleId={r.id} on={r.isActive} label={r.name} />
                          </div>
                        ) : <Pill tone={r.isActive ? "ok" : "neutral"}>{r.isActive ? "On" : "Off"}</Pill>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {canEdit && <div className="px-5 py-4 border-t border-line"><ButtonLink href={here({ rule: "new" })} scroll={false} variant="secondary" icon={Plus}>Add a rule</ButtonLink></div>}
            </div>
          )}

          {tab === "scholarships" && data.schol && (
            <div className="grid xl:grid-cols-2 gap-px bg-line/70">
              <div className="bg-surface">
                <p className="eyebrow text-ink3 px-5 pt-4 pb-1">Scholarship types</p>
                {data.schol[0].length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3">No scholarships applied this year. Give one with New concession and type Scholarship.</p> : (
                  <ul className="px-5 pb-4">
                    {data.schol[0].map((s) => (
                      <li key={s.name} className="flex items-start gap-3 py-2.5 border-t border-line/70 first:border-0">
                        <span className="w-9 h-9 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><Award size={17} aria-hidden="true" /></span>
                        <span className="flex-1 min-w-0"><b className="font-semibold text-[14.5px] block">{s.name}</b><span className="text-[12.5px] text-ink3">{p.year?.name ?? "This year"}</span></span>
                        <span className="text-right text-[13px] tnum shrink-0"><b className="font-semibold block">{s.students} {s.students === 1 ? "student" : "students"}</b><span className="text-ink3">{formatRupees(s.total)}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="bg-surface">
                <p className="eyebrow text-ink3 px-5 pt-4 pb-1">Applications</p>
                {data.schol[1].rows.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3">No scholarship applications{per.range ? ` ${per.words}` : ""}.</p> : (
                  <ul className="px-5 pb-4">
                    {data.schol[1].rows.map((a) => (
                      <li key={a.id} className="py-2.5 border-t border-line/70 first:border-0">
                        <div className="flex items-start gap-3">
                          <Avatar name={a.name} size={36} />
                          <Link href={here({ open: a.id })} scroll={false} className="flex-1 min-w-0">
                            <b className="font-semibold text-[14.5px] block">{a.name} {a.classLabel && <span className="text-ink3 font-normal">· {a.classLabel}</span>}</b>
                            <span className="text-[12.5px] text-ink3">{a.scholarshipType ?? "Scholarship"} · asks {a.value}{a.value.endsWith("%") && a.amountPaise > ZERO ? ` (about ${formatRupees(a.amountPaise)})` : ""}</span>
                            {a.documentFileId && <span className="text-[12.5px] text-ink3 flex items-center gap-1 mt-0.5"><Paperclip size={13} aria-hidden="true" />Document attached</span>}
                          </Link>
                          <div className="flex flex-col items-end gap-1.5 shrink-0"><Pill tone={status(a.status)[1]}>{status(a.status)[0]}</Pill>{decideCell(a, "concession")}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="px-5 pb-4"><PeriodFilter {...p.dates} allLabel="Any date" /></div>
              </div>
            </div>
          )}

          {tab === "refunds" && data.refs && (
            <DataList rows={data.refs.rows} rowKey={(r) => r.id} rowHref={(r) => here({ open: r.id })} minWidth={900} caption="Refunds"
              footer={`${data.refs.rows.length} of ${data.refs.total} refunds · never more than was paid`}
              empty={data.refs.total === 0 && !filtered
                ? <Empty icon={Undo2} title="No refunds" body="A refund comes from one payment and goes to Approvals. Once approved, mark it refunded with the date and reference." action={canEdit ? <ButtonLink href={here({ do: "refund" })} scroll={false} variant="secondary" icon={Undo2}>New refund</ButtonLink> : undefined} />
                : <Empty icon={SearchX} title="No refunds match" body="Try another search, status or date." action={<Link href={tabHref("refunds")} className={buttonClass("secondary")}>Clear filters</Link>} />}
              columns={[
                { key: "name", label: "Student", render: (r) => <><p className="font-semibold leading-tight">{r.name}</p><p className="text-[12.5px] text-ink3">{[r.classLabel, formatDate(r.createdAt, p.tz)].filter(Boolean).join(" · ")}</p></> },
                { key: "rcpt", label: "Payment", render: (r) => <><p className="font-mono text-[12.5px]">{r.receipt}</p><p className="text-[12px] text-ink3">{formatRupees(r.paidPaise)} paid</p></> },
                { key: "amt", label: "Refund", align: "right", render: (r) => <b className="font-semibold">{formatRupees(r.amountPaise)}</b> },
                { key: "reason", label: "Reason", render: (r) => <span className="text-[13px] text-ink2 block max-w-[240px]">{r.reason}{r.note && <span className="block text-ink3">{r.note}</span>}</span> },
                { key: "mode", label: "Mode", render: (r) => <span className="text-[13px]">{modeLabel(r.mode)}{r.reference && <span className="block text-[12px] text-ink3 font-mono">{r.reference}</span>}</span> },
                { key: "status", label: "Status", render: (r) => (
                  <div className="flex flex-col items-start gap-1.5">
                    <Pill tone={status(r.status === "APPROVED" ? "WAITING" : r.status)[1]}>{r.status === "APPROVED" ? "Approved, to pay" : status(r.status)[0]}</Pill>
                    {decideCell(r, "refund")}
                    {r.status === "APPROVED" && canEdit && <Link href={here({ mark: r.id })} scroll={false} className={`${buttonClass("secondary", "sm")} relative z-10`}>Mark refunded</Link>}
                  </div>
                ) },
              ]}
              phone={(r) => ({
                title: r.name, sub: `${formatRupees(r.amountPaise)} of ${formatRupees(r.paidPaise)} · ${r.receipt}`, icon: Undo2, iconTone: status(r.status)[2],
                pills: <>
                  <Pill tone={status(r.status === "APPROVED" ? "WAITING" : r.status)[1]} className="!h-[22px] !text-[11.5px]">{r.status === "APPROVED" ? "Approved, to pay" : status(r.status)[0]}</Pill>
                  {r.status === "WAITING" && decideCell(r, "refund")}
                </>,
              })} />
          )}
        </Card>
      </Stack>

      {/* One concession or refund, opened from a row or from Approvals. */}
      {open && opened && (
        <UrlSheet title={opened.row.name} closeHref={close} sub={opened.kind === "concession" ? `${opened.row.scholarshipType ?? opened.row.typeLabel} · ${opened.row.value}` : `Refund of ${formatRupees(opened.row.amountPaise)} from ${opened.row.receipt}`}>
          <div className="flex flex-col gap-4">
            {opened.kind === "concession" ? (
              <DL rows={[
                ["Status", <Pill key="s" tone={status(opened.row.status)[1]}>{status(opened.row.status)[0]}</Pill>],
                ["Class", opened.row.classLabel || "—"],
                ["Amount or %", opened.row.value],
                [opened.row.status === "APPLIED" || opened.row.status === "TAKEN_OFF" ? "Applied" : "About", formatRupees(opened.row.amountPaise)],
                ["Fee heads", opened.row.heads],
                ["Period", opened.row.period.from || opened.row.period.to ? `${opened.row.period.from ? formatDate(opened.row.period.from) : "Start of year"} to ${opened.row.period.to ? formatDate(opened.row.period.to) : "end of year"}` : "Whole year"],
                ["Asked by", `${opened.row.askedBy} · ${formatDate(opened.row.createdAt, p.tz)}`],
                ["Approved by", opened.row.decidedBy ?? "—"],
              ]} />
            ) : (
              <DL rows={[
                ["Status", <Pill key="s" tone={status(opened.row.status === "APPROVED" ? "WAITING" : opened.row.status)[1]}>{opened.row.status === "APPROVED" ? "Approved, to pay" : status(opened.row.status)[0]}</Pill>],
                ["Class", opened.row.classLabel || "—"],
                ["Payment", `${opened.row.receipt} · ${formatRupees(opened.row.paidPaise)} paid`],
                ["Refund", formatRupees(opened.row.amountPaise)],
                ["Mode", modeLabel(opened.row.mode)],
                ["Refunded on", opened.row.refundedOn ? `${formatDate(opened.row.refundedOn)}${opened.row.reference ? ` · ${opened.row.reference}` : ""}` : "—"],
                ["Asked by", `${opened.row.askedBy} · ${formatDate(opened.row.createdAt, p.tz)}`],
              ]} />
            )}
            <div>
              <p className="eyebrow text-ink3 mb-1">Reason</p>
              <p className="text-[14px]">{opened.row.reason}</p>
              {opened.row.note && <p className="text-[13px] text-ink3 mt-1">{opened.row.note}</p>}
            </div>
            {opened.kind === "concession" && opened.row.documentFileId && (
              <a href={fileLink(opened.row.documentFileId, ctx.schoolId)} target="_blank" rel="noreferrer" className={`${buttonClass("secondary")} self-start`}><Paperclip size={16} aria-hidden="true" />Open the document</a>
            )}
            <div className="flex flex-wrap gap-2 items-start">
              {decideCell(opened.row, opened.kind)}
              {canEdit && opened.kind === "concession" && opened.row.status === "APPLIED" && !opened.row.automatic && (
                <ButtonLink href={here({ revoke: opened.row.id })} scroll={false} variant="danger-outline">Take it off</ButtonLink>
              )}
              {canEdit && opened.kind === "refund" && opened.row.status === "APPROVED" && <ButtonLink href={here({ mark: opened.row.id })} scroll={false} variant="primary" icon={ReceiptIndianRupee}>Mark refunded</ButtonLink>}
              <ButtonLink href={`${BASE}/ledger/${opened.row.studentId}`} variant="ghost" icon={BookOpen}>Ledger</ButtonLink>
            </div>
          </div>
        </UrlSheet>
      )}
      {open && !opened && (
        <UrlSheet title="Not found" closeHref={close}>
          <Empty icon={SearchX} title="This record was not found" body="It may belong to another school, or the link is wrong." />
        </UrlSheet>
      )}

      {/* Choose the student for a new concession or refund. */}
      {(doing === "new" || doing === "refund") && !chosen && (
        <UrlSheet title={doing === "new" ? "New concession" : "New refund"} sub="First, find the student" closeHref={close}>
          <div className="flex flex-col gap-3">
            <UrlSearch param="sq" id="con-sq" placeholder="Name, admission no. or phone" label="Find a student" autoFocus />
            {!sq ? <p className="text-[13.5px] text-ink3 px-1">Search by name, admission number or the parent’s mobile number.</p>
              : (data.pick ?? []).length === 0 ? <Empty icon={SearchX} title={`No student called “${sq}”`} body="Try the admission number or the parent’s mobile number." /> : (
                <ul className="-mx-2">
                  {(data.pick ?? []).map((s) => (
                    <li key={s.id}>
                      <Link href={here({ do: doing, student: s.id })} scroll={false} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken text-left">
                        <Avatar name={s.name} size={40} src={s.photoFileId ? fileLink(s.photoFileId, ctx.schoolId) : null} />
                        <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{s.name}</span><span className="block text-[12.5px] text-ink3 truncate">{s.classSection} · <span className="font-mono">{s.admissionNo}</span></span></span>
                        {s.due > ZERO && <span className="text-[13px] font-semibold tnum text-ink2">{formatRupees(s.due)} due</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </UrlSheet>
      )}
      {doing === "new" && chosen && (
        <ConcessionSheet closeHref={close} student={chosen} heads={headOptions} scholarships={data.scholarshipNames} limit={limit} startType={tab === "scholarships" ? "SCHOLARSHIP" : "DISCOUNT"} />
      )}
      {doing === "refund" && chosen && (
        <RefundSheet closeHref={close} student={chosen} payments={data.payments} modes={REFUND_MODES.map((m) => ({ value: m.value, label: m.label }))} />
      )}

      {decline && opened && opened.row.status === "WAITING" && (
        <DeclineSheet closeHref={close} kind={opened.kind} recordId={opened.row.id}
          words={opened.kind === "concession" ? `${opened.row.scholarshipType ?? opened.row.typeLabel} of ${opened.row.value} for ${opened.row.name}. ${opened.row.askedBy} sees your reason.` : `Refund of ${formatRupees(opened.row.amountPaise)} to ${opened.row.name}. ${opened.row.askedBy} sees your reason.`} />
      )}
      {revoke && opened?.kind === "concession" && opened.row.status === "APPLIED" && (
        <RevokeSheet closeHref={close} concessionId={opened.row.id} words={`${opened.row.typeLabel} of ${formatRupees(opened.row.amountPaise)} for ${opened.row.name}`} />
      )}
      {mark && opened?.kind === "refund" && opened.row.status === "APPROVED" && (
        <MarkRefundedSheet closeHref={close} refundId={opened.row.id} today={p.today.toISOString().slice(0, 10)} needsReference={opened.row.mode !== "CASH"}
          words={`${formatRupees(opened.row.amountPaise)} to ${opened.row.name} by ${modeLabel(opened.row.mode).toLowerCase()}. The Day Book records it as money out on this date.`}
          accounts={data.accounts.map((a) => ({ value: a.id, label: `${a.name}${a.accountLast4 ? ` ····${a.accountLast4}` : ""}` }))} />
      )}
      {canEdit && tab === "bulk" && (ruleId === "new" || UUID.test(ruleId)) && (() => {
        const r = data.rules.find((x) => x.id === ruleId) ?? null;
        if (ruleId !== "new" && !r) return null;
        return <RuleSheet closeHref={close} heads={headOptions} rule={r ? { id: r.id, name: r.name, minInstallments: r.minInstallments, percent: String(r.percentBp / 100), feeHeadIds: r.feeHeadIds, isActive: r.isActive } : null} />;
      })()}
    </div>
  );
}

