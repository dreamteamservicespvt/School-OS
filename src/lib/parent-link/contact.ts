// The school's numbers on the pages a parent opens (owner decision 17,
// 15-11-2026): the office phone to call, and the "WhatsApp number for
// parents" set in Settings, School Profile. With no WhatsApp number set, the
// office phone is used for WhatsApp when it is a mobile (a landline has no
// WhatsApp), exactly as before.

export const WHATSAPP_NUMBER_PROBLEM = "WhatsApp number must be a 10-digit mobile number starting with 6, 7, 8 or 9, like 9876543210.";

/** 10 digits of an Indian mobile (6-9 first), or null: "+91 98765-43210" → "9876543210". */
export function indianMobileDigits(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** The number parents reach the school on by WhatsApp: the School Profile's, else the office phone when it is a mobile. */
export function parentWhatsappNumber(school: { phone: string | null; parentWhatsapp?: string | null }): string | null {
  return indianMobileDigits(school.parentWhatsapp) ?? indianMobileDigits(school.phone);
}

/** A wa.me chat link for a number, or null when it is not a mobile. */
export function whatsappChatLink(phone: string | null | undefined): string | null {
  const d = indianMobileDigits(phone);
  return d ? `https://wa.me/91${d}` : null;
}
