// Data minimisation for the AI service (00-global.md §2.1 rule 7). Callers
// already pass only what a task needs; this is the second wall, run on every
// request before it leaves School OS:
// - a field named like a restricted or highly restricted one (Aadhaar, bank
//   details, salary, counselling notes) stops the request: it is never sent;
// - numbers that look like Aadhaar, bank account numbers and IFSC codes are
//   hidden in any text;
// - phone numbers and email addresses are hidden too, unless the feature
//   declares that it needs that kind of field.
// No database here, so it can be tested on its own.

/** Kinds of personal detail a feature may declare it needs. Restricted fields can never be declared. */
export type DeclarableField = "phone" | "email";

/** Field names that are never sent, whatever the feature (restricted and highly restricted). */
const NEVER: { test: RegExp; what: string }[] = [
  { test: /aadh?aa?r|^uid(_?no|_?number)?$/i, what: "Aadhaar" },
  // APAAR ID and PEN are restricted on the Student record (04-data-model.md).
  { test: /apaar|^(student_)?pen(_?no|_?number|_?id)?$/i, what: "APAAR and PEN numbers" },
  { test: /bank|ifsc|account_?(no|num)|acc_?no|upi_?id/i, what: "bank details" },
  { test: /salary|ctc|gross|net_?pay|basic_?pay|wage|payslip|deduction/i, what: "salary" },
  { test: /counsel/i, what: "counselling notes" },
  { test: /private_?notes?/i, what: "private notes" },
  // Not a school record at all, but never to leave either.
  { test: /password|passcode|secret|api_?key|(^|_)otp(_|$)|(^|_)(auth|access|refresh)_?token/i, what: "passwords and keys" },
];

const AADHAAR = /(?<!\d)\d{4}[ -]?\d{4}[ -]?\d{4}(?!\d)/g;
const IFSC = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;
const PHONE = /(?<![\d+])(?:\+?91[ -]?|0)?[6-9]\d{4}[ -]?\d{5}(?!\d)/g;
const LONG_DIGITS = /(?<!\d)\d{9,18}(?!\d)/g;
const EMAIL = /[^\s@"'<>()]+@[^\s@"'<>()]+\.[A-Za-z]{2,}/g;

export type Minimised = { value: unknown; masked: number; refused: string[] };

/** Hides restricted numbers, and phones and emails unless allowed, in one piece of text. */
export function maskText(text: string, allow: ReadonlySet<DeclarableField> = new Set()): { text: string; masked: number } {
  let masked = 0;
  const hide = (label: string) => () => { masked++; return `[${label} hidden]`; };
  let t = text.replace(AADHAAR, hide("number")).replace(IFSC, hide("bank code"));
  if (!allow.has("phone")) t = t.replace(PHONE, hide("phone"));
  t = t.replace(LONG_DIGITS, (m) => (allow.has("phone") && /^(91|0)?[6-9]\d{9}$/.test(m) ? m : hide("number")()));
  if (!allow.has("email")) t = t.replace(EMAIL, hide("email"));
  return { text: t, masked };
}

const keyName = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();

/** The request with restricted data hidden, and the restricted field names that stop it. */
export function minimise(input: unknown, allow: ReadonlySet<DeclarableField> = new Set()): Minimised {
  let masked = 0;
  const refused = new Set<string>();
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > 12) return null;
    if (typeof v === "string") {
      const m = maskText(v, allow);
      masked += m.masked;
      return m.text;
    }
    if (typeof v === "number" || typeof v === "boolean" || v === null || v === undefined) {
      // A long number on its own (an Aadhaar or account number kept as a number) is hidden as well.
      if (typeof v === "number" && Number.isInteger(v) && Math.abs(v) >= 100_000_000) { masked++; return "[number hidden]"; }
      return v ?? null;
    }
    if (typeof v === "bigint") return walk(v.toString(), depth);
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        const name = keyName(k);
        const never = NEVER.find((n) => n.test.test(name));
        if (never) { refused.add(never.what); continue; }
        out[k] = walk(x, depth + 1);
      }
      return out;
    }
    return null;
  };
  const value = walk(input, 0);
  return { value, masked, refused: [...refused] };
}
