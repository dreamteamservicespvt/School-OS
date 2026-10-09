// Amounts in words the Indian way (lakh, crore), for receipts and salary slips.

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? belowHundred(r) : ""].filter(Boolean).join(" ");
}

/** 1234567 -> "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven". */
export function numberInWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  n = Math.floor(n);
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  if (crore) parts.push(`${numberInWords(crore)} Crore`);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  n %= 1000;
  if (n) parts.push(belowThousand(n));
  return parts.join(" ");
}

/** 1850050 paise -> "Rupees Eighteen Thousand Five Hundred and Fifty Paise Only". */
export function rupeesInWords(paise: bigint | number): string {
  const p = Number(paise);
  const rupees = Math.floor(p / 100);
  const rest = Math.round(p % 100);
  return `Rupees ${numberInWords(rupees)}${rest ? ` and ${belowHundred(rest)} Paise` : ""} Only`;
}
