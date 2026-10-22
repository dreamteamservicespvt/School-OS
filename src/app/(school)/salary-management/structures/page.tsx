import Link from "next/link";
import { Copy, FileSpreadsheet, FileText, FileWarning, Plus, SearchX, TrendingUp, Upload, Wallet } from "lucide-react";
import { withSchool } from "@/lib/db";
import { decryptField, maskLast4 } from "@/lib/crypto";
import { formatDate, formatRupees, formatRupeesShort } from "@/lib/format";
import { workOutPay } from "@/lib/salary/calc";
import { asStatutory, components, ptSlabs, statutoryFor, templates as loadTemplates, lastFrozenMonth } from "@/lib/salary/settings";
import { fromStored } from "@/lib/salary/structures";
import { staffOnCampus } from "@/lib/salary/campus";
import { addMonths, firstOfMonth, monthName } from "@/lib/salary/words";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Chips } from "@/components/ui/chips";
import { Banner, DataList, DL, Empty, Stack, Stats, Timeline, Toolbar } from "@/components/money/kit";
import { UrlSearch } from "@/components/money/url-filters";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { SalaryHead } from "../_components/salary-head";
import { WorkRow } from "../_components/bits";
import { AllTick, BulkBar, RowTick } from "../_components/bulk";
import { BASE, one, qs, salaryGuard, salaryPeriod, type SearchParams } from "../_lib/page";
import { ReviseBulkSheet, StructureSheet, type Comp } from "./sheets";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Salary Structures") };
}

const HREF = `${BASE}/structures`;
const UUID = /^[0-9a-f-]{36}$/i;
const ZERO = BigInt(0);
const rupees = (p: bigint) => Number(p) / 100;

/** Salary Structures (10 §2, mod-salary.jsx Structures): each staff member’s earnings and deductions, with every version kept. */
export default async function StructuresPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await salaryGuard("structures");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const q = one(sp.q).trim().toLowerCase().slice(0, 80);
  const dept = UUID.test(one(sp.dept)) ? one(sp.dept) : "";
  const per = salaryPeriod(sp, p.dates, "finyear");
  const thisMonth = firstOfMonth(p.today);
  const doing = p.change ? one(sp.do) : "";
  const pick = (k: string) => (UUID.test(one(sp[k])) ? one(sp[k]) : "");

  const data = await withSchool(ctx, async (tx) => {
    // One campus: the structures of their campus's staff only.
    const onCampus = await staffOnCampus(tx, ctx, p.current);
    const [staff, depts, all, stat, comps, tpls, frozen] = await Promise.all([
      tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, ...(p.current.campusId ? { campusId: p.current.campusId } : {}) }, orderBy: { staffCode: "asc" }, select: { id: true, fullName: true, staffCode: true, designation: true, departmentId: true, joiningDate: true, bankAccountEnc: true, bankName: true, uan: true } }),
      tx.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.salaryStructure.findMany({ where: { archivedAt: null, ...onCampus }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] }),
      statutoryFor(tx, ctx, thisMonth),
      components(tx, ctx),
      loadTemplates(tx, ctx),
      lastFrozenMonth(tx),
    ]);
    const slabs = stat.ptOn ? await ptSlabs(tx, stat.ptState) : [];
    const people = await tx.userLogin.findMany({ where: { id: { in: [...new Set(all.map((s) => s.createdById).filter((x): x is string => Boolean(x)))] } }, select: { id: true, displayName: true } });
    return { staff, depts, all, stat, slabs, comps, tpls, frozen, people };
  });

  // The version that applies today (or the next one when none has started).
  const versions = new Map<string, typeof data.all>();
  for (const s of data.all) versions.set(s.staffId, [...(versions.get(s.staffId) ?? []), s]);
  const currentOf = (id: string) => {
    const vs = versions.get(id) ?? [];
    return vs.find((v) => v.effectiveFrom <= p.today) ?? vs[vs.length - 1] ?? null;
  };
  const figures = (st: NonNullable<ReturnType<typeof currentOf>>) => workOutPay({
    lines: fromStored(st.lines), pfApplies: st.pfApplies, esiApplies: st.esiApplies, tdsPaise: st.tdsPaise, daysInMonth: 30, notEmployedDays: 0, lopDays: 0,
    statutory: asStatutory(data.stat), ptSlabs: data.slabs, month: thisMonth.getUTCMonth() + 1,
  });
  const without = data.staff.filter((s) => !versions.has(s.id));
  const withS = data.staff.filter((s) => versions.has(s.id));
  const revised = data.all.filter((s) => s.version > 1 && (!per.from || s.effectiveFrom >= per.from) && (!per.to || s.effectiveFrom <= per.to));
  const revisedStaff = new Set(revised.map((s) => s.staffId)).size;
  const commonReason = revised.length ? Object.entries(revised.reduce((m, s) => ({ ...m, [s.reason ?? ""]: (m[s.reason ?? ""] ?? 0) + 1 }), {} as Record<string, number>)).sort((a, b) => b[1] - a[1])[0][0] : "";
  const monthly = withS.reduce((s, x) => s + (currentOf(x.id)?.grossPaise ?? ZERO), ZERO);
  const rows = data.staff.filter((s) => (!dept || s.departmentId === dept) && (!q || [s.fullName, s.staffCode, s.designation].some((x) => x.toLowerCase().includes(q))));
  const keep = { ...per.keep, q: q || null, dept: dept || null };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const earliest = data.frozen ? addMonths(data.frozen, 1) : null;
  const nextStart = earliest && earliest > addMonths(thisMonth, 1) ? earliest : addMonths(thisMonth, 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const comps: Comp[] = data.comps.filter((c) => c.calc !== "ATTENDANCE").map((c) => ({ id: c.id, name: c.name, kind: c.kind, calc: c.calc, percentBp: c.percentBp, systemKey: c.systemKey }));
  const amountsOf = (st: ReturnType<typeof currentOf>) => Object.fromEntries((st ? fromStored(st.lines) : []).filter((l) => l.calc === "FIXED" && l.componentId).map((l) => [l.componentId!, rupees(l.amountPaise)]));
  const tpls = data.tpls.map((t) => ({ id: t.id, name: t.name, amounts: Object.fromEntries(t.lines.map((l) => [l.componentId, rupees(l.amountPaise)])) }));
  const staffOptions = [...without, ...withS].map((s) => ({ value: s.id, label: `${s.fullName} · ${s.designation}${versions.has(s.id) ? "" : " · no structure"}` }));
  const name = (id: string | null) => data.people.find((x) => x.id === id)?.displayName ?? "—";

  const openId = pick("open");
  const open = openId ? data.staff.find((s) => s.id === openId) : null;
  const reviseId = pick("revise");
  const reviseStaff = reviseId ? data.staff.find((s) => s.id === reviseId) : null;
  const copyFrom = pick("copy");
  const addFor = pick("staff");
  const bulkIds = one(sp.ids).split(",").filter((x) => UUID.test(x));

  return (
    <div>
      <SalaryHead pageName="Salary Structures" href={HREF} sub="Each staff member’s earnings and deductions, with every past version kept"
        actions={<>
          {p.change && <ButtonLink href={`${HREF}/import`} variant="secondary" icon={Upload} className="hidden md:inline-flex"><Words k="Import" /></ButtonLink>}
          <ButtonLink href={here({ do: "add" })} scroll={false} variant="primary" icon={Plus}><Words k="Add structure" /></ButtonLink>
        </>} />
      <Stack>
        <Stats items={[
          { label: "Active structures", value: String(withS.length), sub: `of ${data.staff.length} staff`, icon: FileSpreadsheet },
          { label: "Without a structure", value: String(without.length), sub: without.length ? `${without[0].fullName}${without.length > 1 ? ` and ${without.length - 1} more` : ""} · joined ${formatDate(without[0].joiningDate)}` : "Everyone has one", tone: without.length ? "warn" : undefined, icon: FileWarning },
          { label: "Revised", value: String(revisedStaff), sub: revised.length ? `${per.label} · ${commonReason || "new versions"}` : per.label, icon: TrendingUp },
          { label: "Monthly gross", value: formatRupeesShort(monthly), sub: "before loss of pay", icon: Wallet },
        ]} />
        {without.length > 0 && (
          <Banner tone="warn" title={`${without.length === 1 ? without[0].fullName : `${without.length} staff`} ${without.length === 1 ? "has" : "have"} no salary structure.`}
            action={p.change ? <Link href={here({ do: "add", staff: without[0].id })} scroll={false} className={buttonClass("secondary", "sm")}><Words k="Add one" /></Link> : undefined}>
            <Words k="Left out of" /> {monthName(thisMonth)}<Words k="’s salary until one is added." />
          </Banner>
        )}
        <div>
          <Chips label="Departments" value={dept || "all"} options={[
            { value: "all", label: "All departments", href: qs(HREF, { ...keep, dept: null }) },
            ...data.depts.filter((d) => data.staff.some((s) => s.departmentId === d.id)).map((d) => ({ value: d.id, label: d.name, count: data.staff.filter((s) => s.departmentId === d.id).length, href: qs(HREF, { ...keep, dept: d.id }) })),
          ]} />
          <Card className="mt-3 overflow-hidden">
            <Toolbar>
              <UrlSearch id="str-search" placeholder="Staff name or designation" label="Search staff" />
              {p.can.export && <ExportButton href={qs(`${HREF}/export`, { q: q || null, dept: dept || null })} />}
            </Toolbar>
            {p.change && <BulkBar group="str" items={[{ label: "Revise by a percentage", icon: "revise", set: { do: "revise" } }]} />}
            <DataList rows={rows} rowKey={(s) => s.id} rowHref={(s) => (versions.has(s.id) ? here({ open: s.id }) : p.change ? here({ do: "add", staff: s.id }) : null)} minWidth={820} caption="Salary structures"
              footer={`Showing ${rows.length} of ${data.staff.length} · amounts a month`}
              empty={<Empty icon={SearchX} title="No staff match" body="Try a different name or department." action={<Link href={HREF} scroll={false} className={buttonClass("secondary")}><Words k="Show everyone" /></Link>} />}
              columns={[
                ...(p.change ? [{ key: "t", label: "", className: "w-10", render: (s: (typeof rows)[number]) => (versions.has(s.id) ? <RowTick group="str" id={s.id} label={`Tick ${s.fullName}`} /> : null) }] : []),
                { key: "n", label: "Staff member", render: (s) => <div className="flex items-center gap-3"><Avatar name={s.fullName} size={34} /><div><p className="font-semibold leading-tight">{s.fullName}</p><p className="text-[12px] text-ink3">{s.designation}</p></div></div> },
                { key: "g", label: "Gross", align: "right", render: (s) => { const c = currentOf(s.id); return c ? formatRupees(c.grossPaise) : "—"; } },
                { key: "d", label: "Deductions", align: "right", render: (s) => { const c = currentOf(s.id); return c ? formatRupees(figures(c).deductions) : "—"; } },
                { key: "net", label: "Net", align: "right", render: (s) => { const c = currentOf(s.id); return c ? <b className="font-semibold">{formatRupees(figures(c).net)}</b> : "—"; } },
                { key: "f", label: "From", nowrap: true, render: (s) => { const c = currentOf(s.id); return c ? formatDate(c.effectiveFrom) : <Pill tone="warn"><Words k="No structure" /></Pill>; } },
                { key: "v", label: "Version", render: (s) => { const c = currentOf(s.id); return c ? <Pill>v{c.version}</Pill> : null; } },
              ]}
              phone={(s) => { const c = currentOf(s.id); return { avatar: s.fullName, title: s.fullName, sub: c ? `${s.designation} · net ${formatRupees(figures(c).net)}` : "No salary structure", pills: c ? undefined : <Pill tone="warn" className="!h-[22px] !text-[11.5px]"><Words k="No structure" /></Pill> }; }} />
            {p.change && rows.some((s) => versions.has(s.id)) && <div className="hidden lg:flex items-center gap-2 px-5 py-2 border-t border-line text-[12.5px] text-ink3"><AllTick group="str" /><Words k="Tick everyone shown" /></div>}
          </Card>
        </div>
      </Stack>

      {open && (() => {
        const vs = versions.get(open.id) ?? [];
        const c = currentOf(open.id);
        if (!c) return null;
        const f = figures(c);
        const lines = fromStored(c.lines);
        return (
          <UrlSheet wide closeHref={here({ open: null })} title={`${open.fullName} · salary structure`} sub={`${open.designation} · v${c.version} from ${formatDate(c.effectiveFrom)} · amounts a month`}
            footer={p.change ? <div className="flex gap-2 justify-end flex-wrap">
              <ButtonLink href={here({ open: null, do: "add", copy: open.id })} scroll={false} variant="ghost" icon={Copy}><Words k="Copy to someone" /></ButtonLink>
              <ButtonLink href={here({ open: null, revise: open.id })} scroll={false} variant="primary" icon={TrendingUp}><Words k="Revise" /></ButtonLink>
            </div> : undefined}>
            <div className="flex flex-col gap-5">
              <div className="grid md:grid-cols-2 gap-5 text-[14px]">
                <div>
                  <p className="eyebrow text-ink3 mb-1"><Words k="Earnings" /></p>
                  <ul className="divide-y divide-line/70">
                    {f.earnings.map((e) => <WorkRow key={e.name} k={e.name} sub={e.how} v={formatRupees(e.amountPaise)} />)}
                    <WorkRow k="Gross" v={formatRupees(f.fullGross)} tone="font-semibold" />
                  </ul>
                </div>
                <div>
                  <p className="eyebrow text-ink3 mb-1"><Words k="Deductions" /></p>
                  <ul className="divide-y divide-line/70">
                    <WorkRow k="PF" sub={`Worked out from Salary Settings${open.uan ? ` · UAN ${maskLast4(open.uan)}` : ""}`} v={c.pfApplies ? formatRupees(f.pf) : "—"} />
                    <WorkRow k="ESI" sub={f.esiApplies ? "Wages within the ESI limit" : "Not applicable"} v={f.esi ? formatRupees(f.esi) : "—"} />
                    <WorkRow k="Professional Tax" sub={`${data.stat.ptState} slab`} v={formatRupees(f.pt)} />
                    <WorkRow k="TDS per month" sub="Typed in by the Accountant" v={formatRupees(f.tds)} />
                    {lines.filter((l) => l.kind === "DEDUCTION").map((l) => <WorkRow key={l.name} k={l.name} v={formatRupees(l.amountPaise)} />)}
                    <WorkRow k="Net" v={formatRupees(f.net)} tone="font-semibold" />
                  </ul>
                </div>
              </div>
              <DL rows={[
                ["Salary account", open.bankAccountEnc ? `${open.bankName ?? "Bank"} · A/c ${maskLast4(decryptField(open.bankAccountEnc))}` : "Not on file"],
                ["PF applies", c.pfApplies ? "Yes" : "No"], ["ESI applies", c.esiApplies ? (f.esiApplies ? "Yes" : "Yes, but wages are above the limit") : "No"],
                ["Changed by", `${name(c.createdById)} · ${formatDate(c.createdAt, p.tz)}`],
              ]} />
              <div>
                <p className="eyebrow text-ink3 mb-2"><Words k="Versions" /></p>
                <Timeline items={vs.map((v, i) => ({ icon: i === vs.length - 1 ? FileText : TrendingUp, tone: v.id === c.id ? "brand" as const : undefined, what: `v${v.version} · ${formatRupees(v.grossPaise)} gross${v.reason ? ` · ${v.reason}` : ""}`, when: `From ${formatDate(v.effectiveFrom)} · by ${name(v.createdById)}` }))} />
              </div>
            </div>
          </UrlSheet>
        );
      })()}

      {doing === "add" && (() => {
        const src = copyFrom ? currentOf(copyFrom) : null;
        const who = data.staff.find((s) => s.id === copyFrom);
        return (
          <StructureSheet closeHref={here({ do: null, staff: null, copy: null })} mode="add" title={src ? `Copy ${who?.fullName}’s structure` : "Add salary structure"}
            sub={src ? "Pick the staff member it is for. You can change any line." : "Start from the designation’s template, then change any line."}
            staff={staffOptions.filter((o) => o.value !== copyFrom)} staffId={addFor || (without[0]?.id ?? "")} comps={comps} templates={tpls}
            start={src ? { amounts: amountsOf(src), tds: 0, pf: src.pfApplies, esi: src.esiApplies } : { amounts: {}, tds: 0, pf: true, esi: true }}
            from={iso(earliest && earliest > thisMonth ? earliest : thisMonth)} esiLimit={rupees(data.stat.esiLimitPaise)} />
        );
      })()}
      {reviseStaff && p.change && (() => {
        const c = currentOf(reviseStaff.id);
        return (
          <StructureSheet closeHref={here({ revise: null })} mode="revise" title={`Revise ${reviseStaff.fullName}`} sub="Saved as a new version. Earlier slips keep the old amounts."
            staff={[]} staffId={reviseStaff.id} comps={comps} templates={[]} start={{ amounts: amountsOf(c), tds: c ? rupees(c.tdsPaise) : 0, pf: c?.pfApplies ?? true, esi: c?.esiApplies ?? true }}
            from={iso(nextStart)} esiLimit={rupees(data.stat.esiLimitPaise)} />
        );
      })()}
      {doing === "revise" && bulkIds.length > 0 && (
        <ReviseBulkSheet closeHref={here({ do: null, ids: null })} ids={bulkIds.join(",")} from={iso(nextStart)}
          rows={bulkIds.map((id) => ({ id, s: data.staff.find((x) => x.id === id), c: currentOf(id) })).filter((r) => r.s && r.c).map((r) => ({ name: r.s!.fullName, gross: rupees(r.c!.grossPaise) }))} />
      )}
    </div>
  );
}
