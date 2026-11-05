"use client";

// The reference box of a payment sheet. For UPI it takes digits only, at most 12: a UPI
// transaction number (UTR) is always 12 digits (src/lib/payment-ref.ts; the server checks
// the same). Other modes keep the sheet's own label and placeholder.

import { SText } from "./sheet-fields";
import { UTR_LENGTH, isUpi, upiTyping } from "@/lib/payment-ref";

type Props = Omit<React.ComponentProps<typeof SText>, "name"> & { name?: string; mode: string };

export function PaymentRefField({ mode, name = "reference", label, placeholder, maxLength, className, ...rest }: Props) {
  if (!isUpi(mode)) return <SText name={name} label={label} placeholder={placeholder} maxLength={maxLength} className={className} {...rest} />;
  return (
    <SText key="upi" name={name} {...rest} label="UPI transaction number (UTR)" placeholder="12 digits, like 428391027714"
      inputMode="numeric" autoComplete="off" maxLength={UTR_LENGTH} pattern="[0-9]{12}" className={className ? `${className} font-mono` : "font-mono"}
      onInput={(e) => { const el = e.currentTarget; const clean = upiTyping(el.value); if (clean !== el.value) el.value = clean; }} />
  );
}

/**
 * For a reference box next to a plain "Paid by" select (name="mode"): while UPI is chosen,
 * only digits stay, at most 12. Use as onInput.
 */
export function upiOnly(e: React.FormEvent<HTMLInputElement>) {
  const el = e.currentTarget;
  const mode = (el.form?.elements.namedItem("mode") as HTMLSelectElement | HTMLInputElement | null)?.value;
  if (!isUpi(mode)) return;
  const clean = upiTyping(el.value);
  if (clean !== el.value) el.value = clean;
}
