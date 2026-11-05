// Payment references typed by staff (owner's testing, 2026-11-04): a UPI transaction
// number (UTR) is always 12 digits, so a UPI reference takes digits only and exactly 12
// of them, on the screen and again on the server. Other references keep their own
// shapes: a cheque number is 6 digits; NEFT (16), RTGS (22) and card slips carry letters
// too, so those stay letters and digits.

export const UTR_LENGTH = 12;
export const UTR_RE = /^\d{12}$/;

/** What may stay in a UPI box while typing: digits only, at most 12. */
export function upiTyping(text: string): string {
  return text.replace(/\D/g, "").slice(0, UTR_LENGTH);
}

/** The UPI words, when the mode's value is any spelling of UPI ("UPI", "upi"). */
export function isUpi(mode: string | null | undefined): boolean {
  return (mode ?? "").trim().toUpperCase() === "UPI";
}

export const UTR_PROBLEM = "The UPI transaction number (UTR) has 12 digits, numbers only.";

/**
 * The problem with a typed reference for a payment mode, or null when it is fine.
 * An empty reference is not judged here: each screen says on its own whether it is needed.
 */
export function paymentRefProblem(mode: string | null | undefined, reference: string | null | undefined): string | null {
  const r = (reference ?? "").replace(/\s+/g, "");
  if (!r) return null;
  if (isUpi(mode)) return UTR_RE.test(r) ? null : UTR_PROBLEM;
  return null;
}
