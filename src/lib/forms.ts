// Server-side form checks with plain-words errors (00-global.md P3, P7).
import { z } from "zod";

export type FormState<T = unknown> = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** What the person typed, so nothing is lost when a check fails (P7). */
  values?: Record<string, string>;
  data?: T;
} | null;

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string" && !k.startsWith("$")) values[k] = v;
  return values;
}

/** Parses a form with a zod schema. Messages in the schema must be plain words. */
export function parseForm<S extends z.ZodTypeAny>(schema: S, formData: FormData):
  | { ok: true; data: z.infer<S> }
  | { ok: false; state: NonNullable<FormState> } {
  const values = formValues(formData);
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  const count = Object.keys(errors).length;
  return { ok: false, state: { ok: false, message: count === 1 ? Object.values(errors)[0] : `Please fix ${count} things before saving.`, errors, values } };
}

// Common fields, with messages in school words.
export const text = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is needed.`).max(max, `${label} can be at most ${max} characters.`);
/** An optional field may be missing from the form altogether (a box shown only sometimes): read it as empty. */
const blank = () => z.string().optional().transform((v) => v ?? "");
export const optionalText = (label: string, max = 500) =>
  blank().pipe(z.string().trim().max(max, `${label} can be at most ${max} characters.`)).transform((v) => (v === "" ? null : v));
export const indianMobile = (label = "Phone number") =>
  z.string().trim().transform((v) => v.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "")).refine((v) => v.length === 10, {
    message: `${label} must have 10 digits.`,
  }).refine((v) => /^[6-9]/.test(v), { message: `${label} must start with 6, 7, 8 or 9.` });
export const optionalIndianMobile = (label = "Phone number") =>
  blank().pipe(z.string().trim()).transform((v) => v.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "")).refine((v) => v === "" || v.length === 10, {
    message: `${label} must have 10 digits.`,
  }).transform((v) => (v === "" ? null : v));
export const optionalEmail = (label = "Email") =>
  blank().pipe(z.string().trim()).refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: `${label} does not look right. It should be like name@example.com.` }).transform((v) => (v === "" ? null : v.toLowerCase()));
export const dateField = (label: string) =>
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, `Choose the ${label.toLowerCase()}.`).transform((v) => new Date(`${v}T00:00:00Z`)).refine((d) => !Number.isNaN(d.getTime()), { message: `${label} is not a real date.` });
export const optionalDate = (label: string) =>
  blank().pipe(z.string().trim()).refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: `${label} is not a real date.` }).transform((v) => (v === "" ? null : new Date(`${v}T00:00:00Z`)));
export const checkbox = () => z.string().optional().transform((v) => v === "on" || v === "true" || v === "1");
/** Rupees typed by a person, stored as paise. */
export const rupees = (label: string, { min = 0 } = {}) =>
  z.string().trim().transform((v) => v.replace(/[₹,\s]/g, "")).refine((v) => /^\d+(\.\d{1,2})?$/.test(v), { message: `${label} must be an amount like 1500 or 1500.50.` })
    .transform((v) => BigInt(Math.round(Number(v) * 100))).refine((p) => p >= BigInt(min * 100), { message: `${label} must be at least ₹${min}.` });
export const wholeNumber = (label: string, { min = 0, max = 1_000_000 } = {}) =>
  z.string().trim().refine((v) => /^\d+$/.test(v), { message: `${label} must be a whole number.` }).transform(Number)
    .refine((n) => n >= min && n <= max, { message: `${label} must be between ${min} and ${max}.` });
