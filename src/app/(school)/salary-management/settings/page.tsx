import Link from "next/link";
import { Archive, ArrowUpRight, ChevronRight, FileDown, FileSpreadsheet, Landmark, Layers, LayoutList, Pencil, Plus, ReceiptText, Scale, SlidersHorizontal, Workflow } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatRupees } from "@/lib/format";
import { can } from "@/lib/permissions";
import { components as loadComponents, lastFrozenMonth, SLIP_OPTIONS, statutoryFor, templates as loadTemplates } from "@/lib/salary/settings";
import { salarySettings } from "@/lib/salary/settings";
import { addMonths, firstOfMonth, monthKey, monthName, monthShort } from "@/lib/salary/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Col, DL, SettingRow } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";
import { SalaryHead } from "../_components/salary-head";
import { ConfirmSheet } from "../_components/forms";
import { BASE, one, qs, salaryGuard, type SearchParams } from "../_lib/page";
import { archiveComponentAction } from "./actions";
import { ComponentSheet, DuesTrackingSheet, PreferencesSheet, RatesSheet, SlabsSheet, SlipSwitch, StatutorySwitch } from "./sheets";
import { Words } from "@/lib/i18n/client";

export const metadata = { title: "Salary Settings" };

const HREF = `${BASE}/settings`;
const UUID = /^[0-9a-f-]{36}$/i;
const pct = (bp: number) => `${bp / 100}%`;
const rupees = (p: bigint) => String(Number(p) / 100);
const DIV = BigInt(100);

/** Salary Settings (10 §6). Rate changes apply from a month and never change approved salaries. */
export default async function SalarySettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await salaryGuard("settings");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const doing = p.change ? one(sp.do) : "";
  const data = await withSchool(ctx, async (tx) => {
    const settings = await salarySettings(tx, ctx);
    const comps = await loadComponents(tx, ctx);
    const temps = await loadTemplates(tx, ctx);
    const frozen = await lastFrozenMonth(tx);
    const now = firstOfMonth(p.today);
    const openFrom = frozen && addMonths(frozen, 1) > now ? addMonths(frozen, 1) : now;
    const current = await statutoryFor(tx, ctx, now);
    const next = await tx.statutorySetting.findFirst({ where: { archivedAt: null, validFrom: { gt: now } }, orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }] });
    const shown = next ?? current;
    const slabs = await tx.professionalTaxSlab.findMany({ where: { state: shown.ptState, archivedAt: null }, orderBy: { fromPaise: "asc" } });
    const first = await tx.payrollRun.findFirst({ orderBy: { month: "asc" }, select: { month: true } });
    return { settings, comps, temps, frozen, openFrom, current, next, shown, slabs, first: first?.month ?? null };
  });
  const s = data.shown;
  // Rules made on first use start long ago; show them from the first salary month.
  const fromShown = data.first && s.validFrom < data.first ? data.first : s.validFrom;
  const settingsEdit = can(p.current.permissions, "settings", "edit");
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, extra);
  const compName = new Map(data.comps.map((c) => [c.id, c]));
  const basic = data.comps.find((c) => c.systemKey === "basic");
  const months = [0, 1, 2, 3, 4].map((n) => addMonths(data.openFrom, n)).map((m) => ({ value: monthKey(m), label: monthName(m) }));
  const how = (c: (typeof data.comps)[number]) => (c.calc === "PERCENT" ? `${pct(c.percentBp ?? 0)} of basic` : c.calc === "ATTENDANCE" ? "From attendance" : "Fixed amount");
  const up = (v: bigint) => ((v + DIV - BigInt(1)) / DIV) * DIV;
  const slabWord = (from: bigint, to: bigint | null, i: number) => (to === null ? `Above ${formatRupees(i > 0 ? data.slabs[i - 1].toPaise ?? from : from)}` : i === 0 ? `Up to ${formatRupees(to)}` : `${formatRupees(up(from))} to ${formatRupees(to)}`);
  const archiving = doing === "archive" && UUID.test(one(sp.id)) ? compName.get(one(sp.id)) : null;
  const prefs = data.settings;
  const payDayWord = prefs.payDay === "last-working" ? "Last working day" : `${prefs.payDay} of next month`;
  // PF, ESI, Professional Tax and TDS to pay: the months a school can track from, its first salary month to next month.
  const thisMonth = firstOfMonth(p.today);
  const trackStart = data.first && data.first < thisMonth ? data.first : thisMonth;
  const trackMonths: { value: string; label: string }[] = [];
  for (let m = addMonths(thisMonth, 1); m >= trackStart && trackMonths.length < 36; m = addMonths(m, -1)) trackMonths.push({ value: monthKey(m), label: monthName(m) });
  const duesFrom = prefs.statutoryDuesFrom;
  const duesWord = !duesFrom ? "Off" : !data.first || duesFrom <= data.first ? "From the first salary month" : `From ${monthName(duesFrom)} salary`;

  return (
    <div>
      <SalaryHead pageName="Salary Settings" href={HREF} sub="Salary parts, PF, ESI and Professional Tax, approval steps and slip options. Rate changes apply from a month you choose and never change approved salaries." />
      <div className="grid xl:grid-cols-2 gap-5 lg:gap-6 items-start">
        <Col className="[&>*]:min-w-0">
          <Card>
            <CardHeader title="Salary components" description="Earnings and deductions used in structures" icon={Layers} action={p.change ? <ButtonLink href={here({ do: "component" })} scroll={false} size="sm" variant="soft" icon={Plus}><Words k="Add" /></ButtonLink> : null} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {data.comps.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]">{c.name}</p><p className="text-[12.5px] text-ink3">{how(c)}</p></div>
                  {c.taxable && c.kind === "EARNING" && <Pill className="!h-5 !text-[11px] hidden sm:inline-flex"><Words k="Taxable" /></Pill>}
                  <Pill tone={c.kind === "EARNING" ? "ok" : "warn"}>{c.kind === "EARNING" ? "Earning" : "Deduction"}</Pill>
                  {p.change && !c.systemKey && <Link href={here({ do: "archive", id: c.id })} scroll={false} aria-label={`Archive ${c.name}`} className="grid size-8 place-items-center rounded-lg text-ink3 hover:bg-sunken"><Archive size={16} aria-hidden="true" /></Link>}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Designation templates" description="Starting point for a new structure" icon={LayoutList} />
            <ul className="px-2 pb-2">
              {data.temps.map((t) => {
                const fixed = t.lines.reduce((a, l) => a + l.amountPaise, BigInt(0));
                const b = basic ? t.lines.find((l) => l.componentId === basic.id)?.amountPaise ?? BigInt(0) : BigInt(0);
                const pctParts = data.comps.filter((c) => c.calc === "PERCENT" && c.kind === "EARNING");
                const gross = fixed + pctParts.reduce((a, c) => a + (b * BigInt(c.percentBp ?? 0)) / BigInt(10000), BigInt(0));
                const word = (c: { name: string; systemKey: string | null }) => (c.systemKey === "basic" ? "Basic" : c.name.split(" ")[0].toLowerCase());
                const initials = (n: string) => n.split(" ").map((w) => w[0]?.toUpperCase()).join("");
                const fixedParts = t.lines.filter((l) => l.amountPaise > BigInt(0)).map((l) => compName.get(l.componentId)).filter((c): c is NonNullable<typeof c> => Boolean(c));
                const parts = [...fixedParts.filter((c) => c.systemKey === "basic").map(word), ...pctParts.map((c) => `${initials(c.name)} ${pct(c.percentBp ?? 0)}`), ...fixedParts.filter((c) => c.systemKey !== "basic").map(word)];
                return (
                  <li key={t.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                    <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-sunken text-ink2"><FileSpreadsheet size={19} aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{t.name}</p><p className="text-[12.5px] text-ink3 truncate">{parts.join(", ")}</p></div>
                    <span className="tnum font-semibold text-[14px]">{formatRupees(gross)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Payroll preferences" icon={SlidersHorizontal} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              {([
                ["Pay day", "Salary is due on this day", payDayWord],
                ["Days in a month for loss of pay", "Calendar days or a fixed 30", prefs.lopDays === "thirty" ? "A fixed 30" : "Calendar days"],
                ["Late marks", "From Staff Attendance", prefs.lateMarksPerHalfDay ? `${prefs.lateMarksPerHalfDay} late = ½ day` : "Off"],
                ["Overtime", "Paid extra periods or hours", prefs.overtimeOn ? `${formatRupees(prefs.overtimeHourPaise)} an hour` : "Off"],
                ["TDS reminder above", "Flags staff with no TDS whose yearly pay is above this", formatRupees(prefs.tdsReminderAbovePaise)],
              ] as const).map(([t, sub, v]) => <SettingRow key={t} title={t} sub={sub}><span className="flex items-center gap-2"><span className="text-[14px] font-semibold text-ink2">{v}</span>{p.change && <ButtonLink href={here({ do: "prefs" })} scroll={false} size="sm" variant="ghost"><Words k="Change" /></ButtonLink>}</span></SettingRow>)}
            </div>
          </Card>
        </Col>
        <Col className="[&>*]:min-w-0">
          <Card>
            <CardHeader title="PF and ESI" description={data.next ? `New rules from ${monthName(data.next.validFrom)}. Approved salaries keep theirs.` : "Worked out from these rates. Change them when the government does."} icon={Landmark} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              <SettingRow title="Provident Fund (PF)" sub={`${pct(s.pfEmployeeBp)} employee + ${pct(s.pfEmployerBp)} employer on basic pay, up to a ${formatRupees(s.pfCeilingPaise)} wage ceiling`}>{p.change ? <StatutorySwitch field="pfOn" on={s.pfOn} label="PF" /> : <Pill tone={s.pfOn ? "ok" : "neutral"}>{s.pfOn ? "On" : "Off"}</Pill>}</SettingRow>
              <SettingRow title="Employees’ State Insurance (ESI)" sub={`${pct(s.esiEmployeeBp)} employee + ${pct(s.esiEmployerBp)} employer, for wages up to ${formatRupees(s.esiLimitPaise)} a month`}>{p.change ? <StatutorySwitch field="esiOn" on={s.esiOn} label="ESI" /> : <Pill tone={s.esiOn ? "ok" : "neutral"}>{s.esiOn ? "On" : "Off"}</Pill>}</SettingRow>
              <div className="px-5 py-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
                {([["PF employee", pct(s.pfEmployeeBp)], ["PF employer", pct(s.pfEmployerBp)], ["PF wage ceiling", formatRupees(s.pfCeilingPaise)], ["PF wages", "Basic pay"], ["ESI employee", pct(s.esiEmployeeBp)], ["ESI employer", pct(s.esiEmployerBp)], ["ESI wage limit", formatRupees(s.esiLimitPaise)], ["From", `${monthShort(fromShown)} ${fromShown.getUTCFullYear()}`]] as const).map(([k, v]) => <div key={k}><p className="text-[11.5px] text-ink3 font-semibold">{k}</p><p className="font-semibold tnum">{v}</p></div>)}
              </div>
              {p.change && <div className="px-5 py-3"><ButtonLink href={here({ do: "rates" })} scroll={false} size="sm" variant="secondary" icon={Pencil}><Words k="Change rates" /></ButtonLink></div>}
            </div>
          </Card>
          <Card>
            <CardHeader title={`Professional Tax · ${s.ptState}`} description="Taken each month from the salary slab" icon={Scale} action={p.change ? <StatutorySwitch field="ptOn" on={s.ptOn} label="Professional Tax" /> : null} />
            {s.ptOn ? (
              <>
                <table className="w-full text-[14px]">
                  <thead><tr className="text-[12px] text-ink3 text-left border-y border-line"><th className="px-5 py-2.5 font-semibold"><Words k="Salary in the month" /></th><th className="px-5 py-2.5 font-semibold text-right"><Words k="Tax a month" /></th></tr></thead>
                  <tbody className="tnum">
                    {data.slabs.map((r, i) => <tr key={r.id} className="border-b border-line/70 last:border-0"><td className="px-5 py-2.5">{slabWord(r.fromPaise, r.toPaise, i)}</td><td className="px-5 py-2.5 text-right font-semibold">{r.taxPaise === BigInt(0) ? "Nil" : formatRupees(r.taxPaise)}</td></tr>)}
                  </tbody>
                </table>
                {p.change && <div className="px-5 py-3 border-t border-line/70"><ButtonLink href={here({ do: "slabs" })} scroll={false} size="sm" variant="ghost" icon={Pencil}><Words k="Change the table" /></ButtonLink></div>}
              </>
            ) : <p className="px-5 pb-5 text-[14px] text-ink3"><Words k="Off. No Professional Tax is taken from salaries." /></p>}
          </Card>
          <Card>
            <CardHeader title="TDS and statements" icon={FileDown} />
            <DL rows={[["TDS", "Typed in by the Accountant as a monthly amount on each structure. Not worked out by School OS."], ["PF statement", "EPFO ECR text file, each month"], ["ESI statement", "ESIC monthly contribution Excel file"]]} className="!grid-cols-1" />
          </Card>
          <Card>
            <CardHeader title="Paid to the government" description="PF, ESI, Professional Tax and TDS taken from salary stay to pay until recorded paid" icon={Landmark}
              action={p.change ? <ButtonLink href={here({ do: "dues" })} scroll={false} size="sm" variant="ghost"><Words k="Change" /></ButtonLink> : null} />
            <DL rows={[["Track what is to pay", duesWord], ["Where", "Each paid month in Generate Salary, and Pending expenses in Finance Reports"]]} className="!grid-cols-1" />
          </Card>
          <Card>
            <CardHeader title="Approval steps" description="Stored in Settings, Forms & Approvals" icon={Workflow} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap"><Pill tone="brand"><Words k="Accountant prepares" /></Pill><ChevronRight size={16} className="text-ink3" aria-hidden="true" /><Pill tone="brand"><Words k="Principal approves" /></Pill><ChevronRight size={16} className="text-ink3" aria-hidden="true" /><Pill tone="brand"><Words k="Accountant marks paid" /></Pill></div>
              <p className="text-[13px] text-ink3"><Words k="Advances and loans: Principal approves. Nobody approves a run they sent; it goes to the School Admin instead." /></p>
              {settingsEdit && <Link href="/settings/forms-approvals" className={cx(buttonClass("secondary", "sm"), "self-start")}><ArrowUpRight size={15} aria-hidden="true" /><Words k={"Change in Forms & Approvals"} /></Link>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Salary slip options" description="The slip design is in Settings, Document Designs" icon={ReceiptText} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              {SLIP_OPTIONS.map((o) => (
                <SettingRow key={o.key} title={o.title} sub={"sub" in o ? o.sub : undefined}>
                  {p.change ? <SlipSwitch optionKey={o.key} on={Boolean(prefs[o.key])} label={o.title} /> : <Pill tone={prefs[o.key] ? "ok" : "neutral"}>{prefs[o.key] ? "On" : "Off"}</Pill>}
                </SettingRow>
              ))}
            </div>
            {settingsEdit && (
              <div className="px-5 py-4 border-t border-line/70">
                <Link href="/settings/document-designs/salary-slip" className={cx(buttonClass("secondary", "sm"), "self-start")}><ArrowUpRight size={15} aria-hidden="true" /><Words k="Change the slip design" /></Link>
              </div>
            )}
          </Card>
        </Col>
      </div>

      {doing === "component" && <ComponentSheet closeHref={here()} />}
      {archiving && (
        <ConfirmSheet closeHref={here()} title={`Archive ${archiving.name}?`} label="Archive component" action={archiveComponentAction} hidden={{ componentId: archiving.id }} danger>
          <p className="text-[14px] text-ink2"><Words k="New structures cannot use it. Structures and salaries that already have it keep it, and it stays in the audit log." /></p>
        </ConfirmSheet>
      )}
      {doing === "rates" && <RatesSheet closeHref={here()} months={months} now={{ pfEmployeeBp: s.pfEmployeeBp, pfEmployerBp: s.pfEmployerBp, pfCeiling: rupees(s.pfCeilingPaise), esiEmployeeBp: s.esiEmployeeBp, esiEmployerBp: s.esiEmployerBp, esiLimit: rupees(s.esiLimitPaise) }} />}
      {doing === "dues" && <DuesTrackingSheet closeHref={here()} on={Boolean(duesFrom)} months={trackMonths}
        start={duesFrom && trackMonths.some((m) => m.value === monthKey(duesFrom)) ? monthKey(duesFrom) : duesFrom ? trackMonths[trackMonths.length - 1]?.value ?? monthKey(thisMonth) : monthKey(thisMonth)} />}
      {doing === "prefs" && <PreferencesSheet closeHref={here()} now={{ payDay: prefs.payDay, lopDays: prefs.lopDays, lateMarks: String(prefs.lateMarksPerHalfDay), overtimeOn: prefs.overtimeOn, overtimeHour: prefs.overtimeHourPaise ? rupees(prefs.overtimeHourPaise) : "", tdsReminder: rupees(prefs.tdsReminderAbovePaise) }} />}
      {doing === "slabs" && <SlabsSheet closeHref={here()} state={s.ptState} rows={data.slabs.map((r) => ({ from: rupees(r.fromPaise), to: r.toPaise === null ? "" : rupees(r.toPaise), tax: rupees(r.taxPaise) }))} />}
    </div>
  );
}
