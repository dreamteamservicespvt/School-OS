// Collect Fee's quick amounts (adopt item 7): Full, Half and Quarter of what
// is ticked (after a discount or waiver), and the live "₹X stays due" line.
// Money is whole paise. Half and Quarter round down to whole rupees, so the
// counter never asks for coins and a quick amount is never more than the dues.

export type QuickAmount = { key: "full" | "half" | "quarter"; label: string; paise: number };

const downToRupee = (paise: number) => {
  const whole = Math.floor(paise / 100) * 100;
  return whole > 0 ? whole : Math.floor(paise);
};

/** Full, Half and Quarter of the dues ticked; the same amount twice is offered once; nothing for no dues. */
export function quickAmounts(owedPaise: number): QuickAmount[] {
  const owed = Math.max(0, Math.floor(owedPaise));
  if (!owed) return [];
  const out: QuickAmount[] = [{ key: "full", label: "Full", paise: owed }];
  const half = downToRupee(owed / 2);
  const quarter = downToRupee(owed / 4);
  if (half > 0 && half < owed) out.push({ key: "half", label: "Half", paise: half });
  if (quarter > 0 && quarter < half) out.push({ key: "quarter", label: "Quarter", paise: quarter });
  return out;
}

/** What stays due after this amount: never below zero (more than the dues is advance, said elsewhere). */
export function staysDue(owedPaise: number, amountPaise: number): number {
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) return Math.max(0, owedPaise);
  return Math.max(0, owedPaise - amountPaise);
}
