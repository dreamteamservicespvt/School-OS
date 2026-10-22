// One salary slip on screen (mod-salary.jsx SlipSheet), from the frozen payroll line.
import { formatRupees } from "@/lib/format";
import { rupeesInWords } from "@/lib/documents/words";
import { slipLines, type SlipAdjustment } from "@/lib/salary/slips";
import { dayNum, dayShort, monthName } from "@/lib/salary/words";
import type { PayrollLine } from "@prisma/client";
import { Words } from "@/lib/i18n/client";

export type SlipPerson = { fullName: string; staffCode: string; designation: string; department: string; pan: string; uan: string; bank: string };

export function SlipView({ school, place, month, paidOn, line, person, showEmployer, adjustments = [] }: { school: string; place: string; month: Date; paidOn: Date | null; line: PayrollLine; person: SlipPerson; showEmployer: boolean; adjustments?: SlipAdjustment[] }) {
  const all = slipLines(line, adjustments);
  const earn = all.filter((l) => l.kind === "earning");
  const ded = all.filter((l) => l.kind === "deduction");
  const sum = (ls: typeof all) => ls.reduce((s, l) => s + l.amountPaise, BigInt(0));
  const L = ({ k, v }: { k: string; v: bigint }) => <li className="flex justify-between gap-3 py-1.5"><span className="text-ink2">{k}</span><span className="tnum">{formatRupees(v)}</span></li>;
  return (
    <div className="rounded-2xl border border-line overflow-hidden text-[14px]">
      <div className="flex items-start justify-between gap-3 px-4 py-3 bg-sunken/60 flex-wrap">
        <div><p className="font-display font-semibold text-[16px]">{school}</p><p className="text-[12.5px] text-ink3">{place}</p></div>
        <div className="text-right text-[12.5px]"><p className="font-semibold">{monthName(month)}</p><p className="text-ink3">{paidOn ? `Paid ${dayShort(paidOn)} ${paidOn.getUTCFullYear()}` : "Approved, not paid yet"}</p></div>
      </div>
      <div className="px-4 pt-3">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2.5 text-[13px]">
          {([["Name", person.fullName], ["Staff ID", person.staffCode], ["Designation", person.designation], ["Department", person.department || "—"], ["Days paid", `${dayNum(Number(line.paidDays))} of ${line.daysInMonth}`], ["PAN", person.pan || "—"], ["UAN", person.uan || "—"], ["Bank", person.bank || "—"]] as const).map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-[11.5px] text-ink3 font-semibold">{k}</dt><dd className="truncate">{v}</dd></div>
          ))}
        </dl>
      </div>
      <div className="grid md:grid-cols-2 gap-x-6 px-4 py-3">
        <div>
          <p className="eyebrow text-ink3 mt-2 mb-1"><Words k="Earnings" /></p>
          <ul className="divide-y divide-line/70">{earn.map((l, i) => <L key={`${i}-${l.label}`} k={l.label} v={l.amountPaise} />)}
            <li className="flex justify-between py-1.5 font-semibold"><span><Words k="Total earnings" /></span><span className="tnum">{formatRupees(sum(earn))}</span></li></ul>
        </div>
        <div>
          <p className="eyebrow text-ink3 mt-2 mb-1"><Words k="Deductions" /></p>
          <ul className="divide-y divide-line/70">{ded.map((l, i) => <L key={`${i}-${l.label}`} k={l.label} v={l.amountPaise} />)}
            <li className="flex justify-between py-1.5 font-semibold"><span><Words k="Total deductions" /></span><span className="tnum">{formatRupees(sum(ded))}</span></li></ul>
        </div>
      </div>
      <div className="mx-4 mb-4 rounded-xl bg-brand/8 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div><p className="font-semibold"><Words k="Net pay" /></p><p className="text-[12.5px] text-ink2">{rupeesInWords(line.netPaise)}</p></div>
        <p className="font-display text-[24px] font-semibold tnum">{formatRupees(line.netPaise)}</p>
      </div>
      <p className="px-4 pb-3 text-[12px] text-ink3">{showEmployer ? `School’s share, not taken from your pay: PF ${formatRupees(line.erPfPaise)}${line.esiApplies ? `, ESI ${formatRupees(line.erEsiPaise)}` : ""}. ` : ""}<Words k="Made by the computer from the approved salary; no signature needed." /></p>
    </div>
  );
}
