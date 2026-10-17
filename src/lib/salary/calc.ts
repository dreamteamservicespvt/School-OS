// How one person's monthly pay is worked out (10 §2 Generate Salary, §6):
// earnings from the structure version, loss of pay from Staff Attendance and
// Staff Leave, adjustments with reasons, then PF and ESI from the rates and
// ceilings in Salary Settings, Professional Tax from the state slab, TDS as
// typed on the structure, and advance or loan recovery capped so net pay is
// never below zero. Pure functions over whole paise, so tests can check them.

export type StructureLine = {
  componentId?: string | null;
  name: string;
  kind: "EARNING" | "DEDUCTION";
  calc: "FIXED" | "PERCENT" | "ATTENDANCE";
  /** For PERCENT lines: hundredths of a percent of basic pay (2000 = 20%). */
  percentBp?: number | null;
  amountPaise: bigint;
  taxable?: boolean;
  systemKey?: string | null;
};

export type Statutory = {
  pfOn: boolean; pfEmployeeBp: number; pfEmployerBp: number; pfCeilingPaise: bigint;
  esiOn: boolean; esiEmployeeBp: number; esiEmployerBp: number; esiLimitPaise: bigint;
  ptOn: boolean;
};

export type PtSlab = { fromPaise: bigint; toPaise: bigint | null; taxPaise: bigint; specialMonth: number | null; specialPaise: bigint | null };

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
const BP = BigInt(10000);

/** Rounds paise to the nearest whole rupee (half up). */
export function toRupee(paise: bigint): bigint {
  const neg = paise < ZERO;
  const a = neg ? -paise : paise;
  const r = ((a + BigInt(50)) / HUNDRED) * HUNDRED;
  return neg ? -r : r;
}

/** Rounds paise up to the next whole rupee (ESI contributions are rounded up). */
export function ceilRupee(paise: bigint): bigint {
  if (paise <= ZERO) return ZERO;
  return ((paise + BigInt(99)) / HUNDRED) * HUNDRED;
}

export const pct = (paise: bigint, bp: number) => (paise * BigInt(bp)) / BP;

/** A share of an amount: amount × num ÷ den, rounded to the rupee. num and den are in half days (×2). */
function share(amount: bigint, num: number, den: number) {
  if (den <= 0) return ZERO;
  return toRupee((amount * BigInt(Math.round(num * 2))) / BigInt(Math.round(den * 2)));
}

/** The full-month amount of every line: PERCENT lines are a share of basic pay. */
export function resolveLines(lines: StructureLine[]) {
  const basic = lines.find((l) => l.systemKey === "basic")?.amountPaise ?? lines.find((l) => l.kind === "EARNING" && l.calc === "FIXED")?.amountPaise ?? ZERO;
  return lines
    .filter((l) => l.calc !== "ATTENDANCE")
    .map((l) => ({ ...l, amountPaise: l.calc === "PERCENT" ? toRupee(pct(basic, l.percentBp ?? 0)) : l.amountPaise }));
}

export function structureGross(lines: StructureLine[]) {
  return resolveLines(lines).filter((l) => l.kind === "EARNING").reduce((s, l) => s + l.amountPaise, ZERO);
}

/** Days of loss of pay from late marks: N late marks make half a day (0 = off). */
export const lateLop = (lateMarks: number, lateMarksPerHalfDay: number) => (lateMarksPerHalfDay > 0 ? Math.floor(lateMarks / lateMarksPerHalfDay) * 0.5 : 0);

/**
 * Loss of pay days: absent without leave, unpaid leave, leave beyond the
 * balance, half days, and late marks (N late = half a day). In half days.
 */
export function lopDays(input: { absentDays: number; unpaidLeaveDays: number; leaveLopDays?: number; halfDays: number; lateMarks: number; lateMarksPerHalfDay: number }) {
  const late = lateLop(input.lateMarks, input.lateMarksPerHalfDay);
  const total = input.absentDays + input.unpaidLeaveDays + (input.leaveLopDays ?? 0) + input.halfDays * 0.5 + late;
  return { total: Math.round(total * 2) / 2, late };
}

/** Professional Tax for a month's gross, from the state slab (a special month may have its own amount). */
export function professionalTax(slabs: PtSlab[], grossPaise: bigint, month: number) {
  const s = slabs.find((x) => grossPaise >= x.fromPaise && (x.toPaise === null || grossPaise <= x.toPaise));
  if (!s) return ZERO;
  return s.specialMonth === month && s.specialPaise !== null ? s.specialPaise : s.taxPaise;
}

export type PayInput = {
  lines: StructureLine[];
  pfApplies: boolean;
  esiApplies: boolean;
  tdsPaise: bigint;
  /** Days the month is counted in for loss of pay: its calendar days or 30. */
  daysInMonth: number;
  /** Calendar days before joining or after leaving, already in daysInMonth's terms. */
  notEmployedDays: number;
  lopDays: number;
  overtimePaise?: bigint;
  /** Bonus, arrears and one-time deductions. A correction of an earlier month carries the PF and ESI on it, worked out by that month's rules. */
  adjustments?: { type: string; amountPaise: bigint; carried?: Carried | null }[];
  /** Planned advance and loan recoveries, oldest first. */
  recoveries?: { advanceId: string; amountPaise: bigint }[];
  statutory: Statutory;
  ptSlabs: PtSlab[];
  /** The month (1 to 12), for a special Professional Tax month. */
  month: number;
};

/** PF and ESI on a correction of an earlier month, by that month's rules (less than 0 when pay is recovered). */
export type Carried = { pfWagePaise: bigint; pfPaise: bigint; erPfPaise: bigint; esiWagePaise: bigint; esiPaise: bigint; erEsiPaise: bigint };

export type PayResult = ReturnType<typeof workOutPay>;

/** One person's pay for the month, with every step kept so the screen can show how it was worked out. */
export function workOutPay(p: PayInput) {
  const lines = resolveLines(p.lines);
  const earningLines = lines.filter((l) => l.kind === "EARNING");
  const fixedDeductions = lines.filter((l) => l.kind === "DEDUCTION").map((l) => ({ name: l.name, amountPaise: l.amountPaise }));
  const fullGross = earningLines.reduce((s, l) => s + l.amountPaise, ZERO);
  const basicLine = earningLines.find((l) => l.systemKey === "basic") ?? earningLines.find((l) => l.calc === "FIXED");
  const basic = basicLine?.amountPaise ?? ZERO;

  const lop = Math.max(0, Math.min(p.lopDays, p.daysInMonth));
  const notEmployed = Math.max(0, Math.min(p.notEmployedDays, p.daysInMonth - lop));
  const paidDays = p.daysInMonth - lop - notEmployed;
  const earned = share(fullGross, paidDays, p.daysInMonth);
  const basicEarned = share(basic, paidDays, p.daysInMonth);
  const lopPaise = share(fullGross, lop, p.daysInMonth);

  const adj = p.adjustments ?? [];
  const add = adj.filter((a) => a.type !== "DEDUCTION").reduce((s, a) => s + a.amountPaise, ZERO);
  const cut = adj.filter((a) => a.type === "DEDUCTION").reduce((s, a) => s + a.amountPaise, ZERO);
  const overtime = p.overtimePaise ?? ZERO;
  const gross = earned + overtime + add;

  // Corrections of earlier months bring their own PF and ESI, worked out by that month's rules.
  const carried = adj.filter((a) => a.carried);
  const sumOf = (k: keyof Carried) => carried.reduce((s, a) => s + a.carried![k], ZERO);
  const carriedArrears = carried.filter((a) => a.type !== "DEDUCTION").reduce((s, a) => s + a.amountPaise, ZERO);
  const atLeast0 = (v: bigint) => (v < ZERO ? ZERO : v);

  const st = p.statutory;
  const pfOn = st.pfOn && p.pfApplies;
  const pfWageNow = pfOn ? (basicEarned < st.pfCeilingPaise ? basicEarned : st.pfCeilingPaise) : ZERO;
  const pfWage = atLeast0(pfWageNow + sumOf("pfWagePaise"));
  const pf = atLeast0((pfOn ? toRupee(pct(pfWageNow, st.pfEmployeeBp)) : ZERO) + sumOf("pfPaise"));
  const erPf = atLeast0((pfOn ? toRupee(pct(pfWageNow, st.pfEmployerBp)) : ZERO) + sumOf("erPfPaise"));
  // ESI applies to staff whose monthly wages (the structure's gross) are within the limit.
  const esiBase = gross - carriedArrears;
  const esiOn = st.esiOn && p.esiApplies && fullGross <= st.esiLimitPaise && esiBase > ZERO;
  const carriedEsi = sumOf("esiPaise") !== ZERO || sumOf("esiWagePaise") !== ZERO;
  const esiWage = atLeast0((esiOn ? esiBase : ZERO) + sumOf("esiWagePaise"));
  const esi = atLeast0((esiOn ? ceilRupee(pct(esiBase, st.esiEmployeeBp)) : ZERO) + sumOf("esiPaise"));
  const erEsi = atLeast0((esiOn ? ceilRupee(pct(esiBase, st.esiEmployerBp)) : ZERO) + sumOf("erEsiPaise"));
  const pt = st.ptOn ? professionalTax(p.ptSlabs, gross, p.month) : ZERO;
  const tds = p.tdsPaise > ZERO ? p.tdsPaise : ZERO;
  const other = fixedDeductions.reduce((s, d) => s + d.amountPaise, ZERO);

  // Recovery never takes net pay below zero; the rest waits for next month.
  let room = gross - (pf + esi + pt + tds + other + cut);
  if (room < ZERO) room = ZERO;
  const recoveries: { advanceId: string; amountPaise: bigint; planned: bigint }[] = [];
  for (const r of p.recoveries ?? []) {
    const take = r.amountPaise < room ? r.amountPaise : room;
    recoveries.push({ advanceId: r.advanceId, amountPaise: take, planned: r.amountPaise });
    room -= take;
  }
  const recovery = recoveries.reduce((s, r) => s + r.amountPaise, ZERO);
  const reduced = recoveries.some((r) => r.amountPaise < r.planned);

  const deductions = pf + esi + pt + tds + other + cut + recovery;
  return {
    earnings: earningLines.map((l) => ({ name: l.name, amountPaise: l.amountPaise, how: l.calc === "PERCENT" ? `${(l.percentBp ?? 0) / 100}% of basic` : "Fixed" })),
    fixedDeductions,
    fullGross, basic, basicEarned, paidDays, lop, notEmployed, lopPaise, earned, overtime, add, cut, gross,
    pfWage, pf, erPf, pfCapped: pfOn && basicEarned > st.pfCeilingPaise,
    esiApplies: esiOn || carriedEsi, esiWage, esi, erEsi,
    pt, tds, other, recoveries, recovery, recoveryReduced: reduced,
    deductions, net: gross - deductions,
  };
}

/** Days before joining and after leaving within the month. */
export function notEmployedDays(monthStart: Date, monthEnd: Date, joining: Date, leaving: Date | null) {
  const DAY = 86_400_000;
  let n = 0;
  if (joining > monthStart) n += Math.min(Math.round((joining.getTime() - monthStart.getTime()) / DAY), Math.round((monthEnd.getTime() - monthStart.getTime()) / DAY) + 1);
  if (leaving && leaving < monthEnd) n += Math.round((monthEnd.getTime() - leaving.getTime()) / DAY);
  return n;
}
