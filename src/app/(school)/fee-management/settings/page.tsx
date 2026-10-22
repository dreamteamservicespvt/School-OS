import Link from "next/link";
import { Award, BellRing, Check, Globe, Hourglass, KeyRound, Landmark, Percent, ReceiptIndianRupee, ShieldCheck, Timer, ToggleRight, Wallet, type LucideIcon } from "lucide-react";
import { withSchool } from "@/lib/db";
import { defaultSteps, requestLabel, type RuleStep } from "@/lib/approvals";
import { formatRupees } from "@/lib/format";
import { financialYearOf } from "@/lib/finance/years";
import { nextReceiptPreview, REMINDER_DAY_CHOICES } from "@/lib/fees/settings-save";
import { reminderSettingsPreview } from "@/lib/fees/reminder-preview";
import { ageingLabel, COUNTER_PERMISSIONS, FEE_FEATURES, PAYMENT_MODES, percentWord } from "@/lib/fees/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Col, SimpleTable } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";
import { FeeHead } from "../_components/fee-head";
import type { ReminderSettingsPreview } from "@/lib/fees/reminder-preview";
import { BASE, feeManagerPage, one, type SearchParams } from "../_lib/page";
import { schoolRoles } from "@/lib/school-roles";
import {
  AgeingSheet, CounterSheet, FeatureSwitch, HeadAccountsSheet, LateFeeSheet, NumberingSheet, PaymentsSheet, ReceiptsSheet, RemindersSheet, RoutingSheet, ScholarshipTypesSheet,
} from "./sheets";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Fee Settings") };
}

const HREF = `${BASE}/settings`;
const rupees = (p: bigint | null) => (p === null ? "" : (Number(p) / 100).toString());
const DAY_WORDS = (d: number) => (d === 0 ? "On the due date" : d < 0 ? `${-d} ${d === -1 ? "day" : "days"} before` : `${d} ${d === 1 ? "day" : "days"} after`);
const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp with SMS backup", sms: "SMS", email: "Email" };

type Row = { title: React.ReactNode; sub?: React.ReactNode; value?: React.ReactNode; on?: boolean };

/** A settings card (mod-fees.jsx SettingsCard): rows of what is set, and Change for the people who may. */
function SetCard({ title, sub, icon, edit, rows, children, action }: { title: string; sub?: React.ReactNode; icon: LucideIcon; edit?: string; rows?: Row[]; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={sub} icon={icon}
        action={action ?? (edit ? <Link href={`${HREF}?edit=${edit}`} scroll={false} className={cx(buttonClass("ghost", "sm"), "shrink-0")}><Words k="Change" /></Link> : undefined)} />
      {rows && (
        <ul className="px-5 pb-3 flex flex-col text-[14px]">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2.5 border-t border-line/70 first:border-0">
              <span className="min-w-0"><span className="font-medium block">{r.title}</span>{r.sub && <span className="block text-[12.5px] text-ink3">{r.sub}</span>}</span>
              {r.on !== undefined ? <Pill tone={r.on ? "ok" : "neutral"}>{r.on ? "On" : "Off"}</Pill> : <span className="text-[13.5px] text-ink2 text-right shrink-0">{r.value}</span>}
            </li>
          ))}
        </ul>
      )}
      {children}
    </Card>
  );
}

/** "What a parent gets": one real family's automatic reminder today, exactly as it goes, with links shown as words. */
function ReminderPreview({ r, remindersOn }: { r: ReminderSettingsPreview; remindersOn: boolean }) {
  const left = [
    r.today.left.promise && `${r.today.left.promise} with a promise to pay`,
    r.today.left.waiting && `${r.today.left.waiting} with a payment waiting for verification`,
    r.today.left.belowMin && `${r.today.left.belowMin} owing less than the smallest amount`,
    r.today.left.done && `${r.today.left.done} already reminded today`,
  ].filter(Boolean);
  const families = (n: number) => `${n} ${n === 1 ? "family" : "families"}`;
  return (
    <section aria-labelledby="reminder-preview" className="rounded-xl border border-line p-4 flex flex-col gap-3">
      <h3 id="reminder-preview" className="font-semibold text-[14px]"><Words k="What a parent gets" /></h3>
      {r.stops.map((x) => <p key={x} className="text-[13.5px] text-warn-text">{x}</p>)}
      {r.sample ? (
        <>
          <p className="text-[12.5px] text-ink3"><Words k="To" /> {r.sample.parent}{r.sample.students.length ? `, about ${r.sample.students.join(" and ")}` : ""} · {r.sample.channel}{r.sample.dueWords ? ` · ${r.sample.dueWords}` : ""}</p>
          <p className="whitespace-pre-wrap break-words rounded-xl bg-sunken px-3.5 py-3 text-[14px] leading-relaxed">{r.sample.text}</p>
          <p className="text-[12.5px] text-ink3"><Words k="How to pay in this message:" /> {r.sample.way}<Words k=". Links show here as words; each parent gets their own." /></p>
        </>
      ) : <p className="text-[13.5px] text-ink3"><Words k="Nobody owes anything now, so there is no message to show." /></p>}
      {r.warnings.map((x) => <p key={x} className="text-[13.5px] text-bad">{x}</p>)}
      <p className="text-[12.5px] text-ink3">{r.online}</p>
      {remindersOn && (
        <p className="text-[12.5px] text-ink3">
          {r.today.quiet ? "Today the school is closed: today's reminders go on the next school day." : `Today: ${families(r.today.families)} get a reminder.`}
          {left.length ? ` Left out: ${left.join(", ")}.` : ""}
        </p>
      )}
      <p className="text-[12.5px] text-ink3"><Words k="Change the words in" /> <Link href="/communication/templates" className="text-brand font-semibold"><Words k="Message Templates" /></Link>.</p>
    </section>
  );
}

/** Fee Settings (06 §6, mod-fees.jsx FeeSettings): late fee, reminders, receipts, gateways and bank accounts. Every change is logged. */
export default async function FeeSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await feeManagerPage();
  const sp = await searchParams;
  const edit = one(sp.edit);
  const s = p.settings;
  const ctx = p.current.ctx;

  const data = await withSchool(ctx, async (tx) => {
    const fy = await financialYearOf(tx, ctx, p.today);
    const reminder = await reminderSettingsPreview(tx, ctx, p.today);
    const [next, heads, gateways, classes, accounts, roles, rules] = await Promise.all([
      nextReceiptPreview(tx, ctx, fy.name),
      tx.feeHead.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, taxable: true, gstRateBp: true, lateFeeApplies: true, bankAccountId: true, systemKey: true } }),
      tx.paymentGatewayAccount.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, displayName: true, provider: true, environment: true, isActive: true } }),
      tx.schoolClass.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
      tx.bankAccount.findMany({ where: { archivedAt: null, kind: "BANK" }, orderBy: [{ isMain: "desc" }, { name: "asc" }], select: { id: true, name: true, bankName: true, accountLast4: true, isMain: true } }),
      schoolRoles(tx, ctx, { where: { archivedAt: null, isEnabled: true, key: { not: null } }, orderBy: { name: "asc" }, select: { key: true, name: true } }),
      tx.approvalRule.findMany({ where: { requestType: { in: ["concession", "refund", "payment-cancellation", "scholarship", "payment-verification"] }, archivedAt: null } }),
    ]);
    return { fy, next, heads, gateways, classes, accounts, roles, rules, reminder };
  });

  const roleName = new Map(data.roles.map((r) => [r.key!, r.name]));
  const headName = new Map(data.heads.map((h) => [h.id, h.name]));
  const accName = new Map(data.accounts.map((a) => [a.id, `${a.name}${a.accountLast4 ? ` ····${a.accountLast4}` : ""}`]));
  const mainAccount = data.accounts.find((a) => a.isMain) ?? data.accounts[0];
  const features = p.features;
  const lateWords = !s.lateFeeOn ? "Off" : s.lateFeeType === "percent" ? `${percentWord(s.lateFeePercentBp)} of the installment` : s.lateFeeType === "per-day" ? `${formatRupees(s.lateFeePaise)} a day` : `${formatRupees(s.lateFeePaise)} once`;
  const lateHeads = s.lateFeeHeadIds.length ? s.lateFeeHeadIds.map((h) => headName.get(h) ?? "Fee head").join(", ") : "Every head that allows it";
  const taxable = data.heads.filter((h) => h.taxable);
  const approverOf = (type: string) => {
    const rule = data.rules.find((r) => r.requestType === type);
    const steps = (rule?.steps as RuleStep[] | undefined) ?? defaultSteps(type);
    return steps.map((st) => (st.approverRole ? roleName.get(st.approverRole) ?? st.approverRole : "A chosen person") + (st.upToPaise ? ` up to ${formatRupees(BigInt(st.upToPaise))}` : "")).join(", then ") || "Nobody set";
  };
  const counterWords = (key: string) => {
    const keys = s.counter[key as keyof typeof s.counter] ?? [];
    return keys.length ? keys.map((k) => roleName.get(k) ?? k).join(", ") : "Nobody";
  };
  const classOptions = data.classes.map((c) => ({ value: c.id, label: c.name }));
  const gwOptions = data.gateways.map((g) => ({ value: g.id, label: `${g.displayName}${g.isActive ? "" : " (off)"}` }));
  const close = HREF;
  const routedClasses = Object.keys(s.routing.byClass);

  return (
    <div>
      <FeeHead pageName="Fee Settings" href={HREF} sub="Late fee, reminders, receipts, gateways and bank accounts. Every change is logged." />
      <div className="grid xl:grid-cols-2 gap-5 lg:gap-6 items-start">
        <Col>
          <SetCard title="Late fee rules" sub="Added as its own row after the grace period" icon={Timer} edit="late" rows={[
            { title: "Late fee", value: lateWords },
            { title: "Grace period", value: `${s.graceDays} ${s.graceDays === 1 ? "day" : "days"}` },
            { title: "Most per installment", value: s.lateFeeMaxPaise !== null ? formatRupees(s.lateFeeMaxPaise) : "No limit" },
            { title: "Fee heads with late fee", value: lateHeads },
            { title: "Waive late fee at the counter", sub: `${counterWords("waive-late-fee")}, with a reason; above ${formatRupees(s.concessionLimitPaise)} goes to Approvals` },
          ]} />

          <SetCard title="Reminder schedule" sub="Sent by itself for each unpaid installment. Opted-out parents are skipped." icon={BellRing} edit="reminders">
            <div className="px-5 pb-4 flex flex-col gap-3">
              {!s.remindersOn && <p className="text-[13.5px] text-ink3"><Words k="Off. Reminders go only when someone sends them from Defaulters." /></p>}
              <div className="flex flex-wrap gap-2">
                {REMINDER_DAY_CHOICES.filter((d) => s.reminderDays.includes(d) || [-7, -3, -1, 0, 7, 21].includes(d)).map((d) => {
                  const on = s.remindersOn && s.reminderDays.includes(d);
                  return (
                    <span key={d} className={cx("h-9 px-3 rounded-xl border text-[13.5px] font-semibold inline-flex items-center", on ? "bg-brand/10 border-brand text-brand" : "border-line text-ink3")}>
                      {on && <Check size={14} className="mr-1" aria-hidden="true" />}{DAY_WORDS(d)}
                    </span>
                  );
                })}
              </div>
              <p className="text-[13px] text-ink3">{CHANNEL[s.reminderChannel] ?? s.reminderChannel} · {s.reminderMinPaise > BigInt(0) ? `only when ${formatRupees(s.reminderMinPaise)} or more is owed` : "any amount owed"} · {s.reminderQuietDays ? "not on days the school is closed" : "every day, holidays too"}</p>
              <ReminderPreview r={data.reminder} remindersOn={s.remindersOn} />
            </div>
          </SetCard>

          <SetCard title="Receipts" icon={ReceiptIndianRupee} edit="receipts" rows={[
            { title: "Receipt number", sub: "Prefix and running number", value: <span className="font-mono text-[13px]">{data.next} <Words k="next" /></span> },
            { title: "Start again each year", sub: "From 1 in each financial year", on: s.restartEachYear },
            { title: "Separate series for part payments", sub: s.partialSeries ? `Like ${s.partialPrefix.replaceAll("{YEAR}", data.fy.name)}00001` : "Part payments use the same series", on: s.partialSeries },
            { title: "Print office copy and parent copy", on: s.printCopies === "both" },
            { title: "Terms on the receipt", value: s.receiptTerms ? `${s.receiptTerms.split("\n").length} ${s.receiptTerms.split("\n").length === 1 ? "line" : "lines"}` : "None" },
          ]} />

          <SetCard title="Tax invoices (GST)" sub={p.school.gstin ? `GSTIN ${p.school.gstin} · from Settings, School Profile` : "No GSTIN yet · add it in Settings, School Profile"} icon={Percent} edit="numbers" rows={[
            { title: "Tax invoice prefix", value: <span className="font-mono text-[13px]">{s.taxInvoicePrefix}</span> },
            { title: "Fee amounts include GST", sub: "The tax invoice shows the tax part separately", on: true },
            { title: "GST rates", sub: "Set on each fee head in Fee Structure", value: `${taxable.length} taxable ${taxable.length === 1 ? "head" : "heads"}` },
            { title: "Fee invoice and certificate prefixes", value: <span className="font-mono text-[13px]">{s.invoicePrefix} · {s.certificatePrefix}</span> },
          ]} />

          <SetCard title="Dues ageing groups" sub="Used on Defaulters and the outstanding report" icon={Hourglass} edit="ageing">
            <div className="px-5 pb-5 flex flex-wrap gap-2 items-center text-[13.5px]">
              {s.ageing.map((g, i) => <span key={i} className="h-9 px-3 rounded-xl bg-sunken font-semibold tnum inline-flex items-center">{ageingLabel(g)}</span>)}
            </div>
          </SetCard>

          <SetCard title="Optional parts" sub="Switched on school by school. Records already made stay when a part is off." icon={ToggleRight}>
            <ul className="px-5 pb-3 flex flex-col text-[14px]">
              {FEE_FEATURES.map((f) => (
                <li key={f.key} className="flex items-center justify-between gap-3 py-2.5 border-t border-line/70 first:border-0">
                  <span className="min-w-0"><span className="font-medium block">{f.label}</span><span className="block text-[12.5px] text-ink3">{f.about}</span></span>
                  <FeatureSwitch featureKey={f.key} on={features.has(f.key)} label={f.label} />
                </li>
              ))}
            </ul>
          </SetCard>
        </Col>

        <Col>
          <Card className="overflow-hidden">
            <CardHeader title="Payment gateway for each class" description="Gateways are connected in Settings, Payment Gateways" icon={Globe}
              action={<Link href={`${HREF}?edit=gateway`} scroll={false} className={cx(buttonClass("ghost", "sm"), "shrink-0")}><Words k="Change" /></Link>} />
            {data.gateways.length === 0 ? (
              <p className="px-5 pb-5 text-[13.5px] text-ink3"><Words k="No gateway connected. Parents cannot pay online until Razorpay is connected in" /> <Link href="/settings/payment-gateways" className="text-brand font-semibold"><Words k="Settings, Payment Gateways" /></Link>.</p>
            ) : (
              <SimpleTable minWidth={420} caption="Payment gateway for each class"
                cols={[
                  { label: "Classes", render: (x: { label: string; gw: string | null }) => x.label },
                  { label: "Gateway", render: (x) => { const g = data.gateways.find((y) => y.id === x.gw) ?? data.gateways.find((y) => y.isActive && y.provider === "razorpay"); return g ? <span className="inline-flex items-center gap-2">{g.displayName}<Pill tone={g.isActive ? (g.environment === "live" ? "ok" : "warn") : "neutral"} className="!h-5 !text-[11px]">{!g.isActive ? "Off" : g.environment === "live" ? "Live" : "Test"}</Pill></span> : "None"; } },
                ]}
                rows={[
                  { label: routedClasses.length ? "Every other class" : "Every class", gw: s.routing.default },
                  ...routedClasses.map((c) => ({ label: data.classes.find((x) => x.id === c)?.name ?? "Class", gw: s.routing.byClass[c] })),
                ]} />
            )}
          </Card>

          <SetCard title="Payments" icon={Wallet} edit="payments" rows={[
            { title: "Concessions apply at once up to", value: formatRupees(s.concessionLimitPaise) },
            { title: "Allow advance payments", sub: "Paying more than the current dues", on: features.has("fee-advance") },
            { title: "Verify before posting", sub: features.has("fee-verification") && s.verifyModes.length ? `${s.verifyModes.map((m) => PAYMENT_MODES.find((x) => x.value === m)?.label ?? m).join(", ")} wait for the accountant` : "Payments post at once", on: features.has("fee-verification") && s.verifyModes.length > 0 },
            { title: "Cancelling an older payment needs approval", sub: "Payments from before today", on: s.cancelPastApproval },
            { title: "Payment date can be changed", sub: `Only by ${counterWords("change-payment-date")}, never before a closed day` },
          ]} />

          <SetCard title="Fees into different bank accounts" sub="Each fee head goes to its own account. Razorpay splits online payments." icon={Landmark}
            action={<div className="flex items-center gap-2 shrink-0">{features.has("fee-bank-accounts") && <Link href={`${HREF}?edit=accounts`} scroll={false} className={buttonClass("ghost", "sm")}><Words k="Change" /></Link>}<FeatureSwitch featureKey="fee-bank-accounts" on={features.has("fee-bank-accounts")} label="Fees into different bank accounts" /></div>}>
            {features.has("fee-bank-accounts") ? (
              <ul className="px-5 pb-4 flex flex-col text-[14px]">
                {data.accounts.map((a) => {
                  const mine = data.heads.filter((h) => (h.bankAccountId ?? mainAccount?.id) === a.id);
                  return (
                    <li key={a.id} className="flex items-start gap-3 py-2.5 border-t border-line/70 first:border-0">
                      <span className="w-9 h-9 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><Landmark size={17} aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1"><b className="font-semibold block">{a.name}</b><span className="text-[12.5px] text-ink3">{[a.bankName, a.accountLast4 && `····${a.accountLast4}`, a.isMain && "Main account"].filter(Boolean).join(" · ")}</span></span>
                      <span className="text-[12.5px] text-ink2 text-right max-w-[45%]">{mine.length ? mine.map((h) => h.name).join(", ") : "No fee heads"}</span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="px-5 pb-4 text-[13.5px] text-ink3"><Words k="All fees go to" /> {mainAccount ? accName.get(mainAccount.id) : "the main bank account"}.</p>}
          </SetCard>

          <SetCard title="Counter permissions" sub="Who may do each thing at the fee counter" icon={KeyRound} edit="counter">
            <ul className="px-5 pb-4 flex flex-col text-[14px]">
              {COUNTER_PERMISSIONS.map((c) => (
                <li key={c.key} className="flex items-start justify-between gap-3 py-2 border-t border-line/70 first:border-0"><span className="font-medium">{c.label}</span><span className="text-[12.5px] text-ink3 text-right">{counterWords(c.key)}</span></li>
              ))}
            </ul>
          </SetCard>

          <SetCard title="Approval limits" sub="Stored in Settings, Forms & Approvals" icon={ShieldCheck}
            action={<Link href="/settings/forms-approvals" className={cx(buttonClass("ghost", "sm"), "shrink-0")}><Words k="Open" /></Link>}>
            <ul className="px-5 pb-4 flex flex-col text-[14px]">
              {[
                [`Concession above ${formatRupees(s.concessionLimitPaise)}`, approverOf("concession")],
                ["Scholarship above the limit", approverOf("scholarship")],
                ["Any refund", approverOf("refund")],
                [s.cancelPastApproval ? "Cancel a payment older than today" : requestLabel("payment-cancellation"), approverOf("payment-cancellation")],
                ...(features.has("fee-verification") ? [[requestLabel("payment-verification"), approverOf("payment-verification")]] : []),
              ].map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-3 py-2 border-t border-line/70 first:border-0"><span>{k}</span><Pill tone="info">{v}</Pill></li>
              ))}
            </ul>
          </SetCard>

          {features.has("fee-scholarships") && (
            <SetCard title="Scholarships" icon={Award} edit="scholarships" rows={[
              { title: "Scholarship types", value: s.scholarshipTypes.length ? `${s.scholarshipTypes.length} ${s.scholarshipTypes.length === 1 ? "type" : "types"}` : "None yet" },
              ...s.scholarshipTypes.slice(0, 6).map((t) => ({ title: t, value: "" })),
            ]} />
          )}
        </Col>
      </div>

      {edit === "late" && (
        <LateFeeSheet closeHref={close} heads={data.heads.filter((h) => !h.systemKey && h.lateFeeApplies).map((h) => ({ value: h.id, label: h.name }))}
          s={{ on: s.lateFeeOn, type: s.lateFeeType, amount: rupees(s.lateFeePaise), percent: String(s.lateFeePercentBp / 100), grace: s.graceDays, max: rupees(s.lateFeeMaxPaise), headIds: s.lateFeeHeadIds }} />
      )}
      {edit === "reminders" && <RemindersSheet closeHref={close} choices={REMINDER_DAY_CHOICES} wordsHref="/communication/templates" s={{ on: s.remindersOn, days: s.reminderDays, channel: s.reminderChannel, min: s.reminderMinPaise > BigInt(0) ? rupees(s.reminderMinPaise) : "", quietDays: s.reminderQuietDays }} />}
      {edit === "receipts" && <ReceiptsSheet closeHref={close} s={{ prefix: s.receiptPrefix, digits: s.receiptDigits, restart: s.restartEachYear, partialSeries: s.partialSeries, partialPrefix: s.partialPrefix, printCopies: s.printCopies, terms: s.receiptTerms ?? "" }} />}
      {edit === "numbers" && <NumberingSheet closeHref={close} s={{ taxInvoicePrefix: s.taxInvoicePrefix, invoicePrefix: s.invoicePrefix, certificatePrefix: s.certificatePrefix }} />}
      {edit === "ageing" && <AgeingSheet closeHref={close} ends={s.ageing.filter((g) => g.to !== null).map((g) => g.to).join(", ")} />}
      {edit === "gateway" && <RoutingSheet closeHref={close} gateways={gwOptions} classes={classOptions} s={{ default: s.routing.default ?? "", byClass: s.routing.byClass }} />}
      {edit === "payments" && <PaymentsSheet closeHref={close} verifyOn={features.has("fee-verification")} modes={PAYMENT_MODES.filter((m) => m.value !== "GATEWAY").map((m) => ({ value: m.value, label: m.label }))} s={{ verifyModes: s.verifyModes, limit: rupees(s.concessionLimitPaise), cancelPast: s.cancelPastApproval }} />}
      {edit === "counter" && <CounterSheet closeHref={close} roles={data.roles.map((r) => ({ value: r.key!, label: r.name }))} perms={COUNTER_PERMISSIONS.map((c) => ({ key: c.key, label: c.label, roles: s.counter[c.key] ?? [] }))} />}
      {edit === "accounts" && features.has("fee-bank-accounts") && (
        <HeadAccountsSheet closeHref={close} accounts={data.accounts.map((a) => ({ value: a.id, label: accName.get(a.id)! }))} heads={data.heads.filter((h) => h.systemKey !== "old-dues").map((h) => ({ id: h.id, name: h.name, accountId: h.bankAccountId ?? "" }))} />
      )}
      {edit === "scholarships" && <ScholarshipTypesSheet closeHref={close} types={s.scholarshipTypes.join("\n")} />}
    </div>
  );
}
