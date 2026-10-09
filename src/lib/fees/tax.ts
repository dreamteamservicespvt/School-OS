// GST on taxable fee heads (D8c). Fee amounts include GST (inferred), so the
// tax part of an amount is amount × rate / (100% + rate). No database here.

export const GST_STATES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
  "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland",
  "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

/** "Telangana (36)" from a GSTIN, or null. */
export function placeOfSupply(gstin: string | null | undefined) {
  if (!gstin || gstin.length < 2) return null;
  const code = gstin.slice(0, 2);
  const name = GST_STATES[code];
  return name ? `${name} (${code})` : null;
}

/** The GST included in an amount at a rate (basis points), rounded to the paisa. */
export function taxIncluded(amountPaise: bigint, rateBp: number): bigint {
  if (rateBp <= 0) return BigInt(0);
  const num = amountPaise * BigInt(rateBp);
  const den = BigInt(10000 + rateBp);
  return (num * BigInt(2) + den) / (den * BigInt(2));
}

export type TaxLine = { feeHeadId: string; name: string; sacCode: string | null; rateBp: number; amountPaise: bigint; taxPaise: bigint };

/** Tax invoice lines: one per taxable head paid, with the tax part. */
export function taxLines(paid: { feeHeadId: string; name: string; sacCode: string | null; rateBp: number; amountPaise: bigint }[]): TaxLine[] {
  const byHead = new Map<string, TaxLine>();
  for (const p of paid) {
    const cur = byHead.get(p.feeHeadId);
    if (cur) cur.amountPaise += p.amountPaise;
    else byHead.set(p.feeHeadId, { ...p, taxPaise: BigInt(0) });
  }
  return [...byHead.values()].map((l) => ({ ...l, taxPaise: taxIncluded(l.amountPaise, l.rateBp) }));
}

/** A GSTIN looks right: 15 characters, state code, PAN, entity, Z, check. */
export function looksLikeGstin(v: string) {
  return /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v);
}
