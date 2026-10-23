// The blanks a message may use ({student_name}, {class} …) and the checks on
// them (11-communication.md, Message Templates and §5 "A blank reaches a parent
// unfilled"). Plain functions with no database, so the Send Message form can
// check a typed message in the browser while the server checks it again.

/** The blanks a person can insert, with an example used in previews. */
export const VARIABLES: { key: string; label: string; sample: string }[] = [
  { key: "student_name", label: "Student name", sample: "Ravi Kumar" },
  { key: "class", label: "Class and section", sample: "Class 5 A" },
  { key: "admission_no", label: "Admission number", sample: "SPS/2024/00123" },
  { key: "guardian_name", label: "Parent name", sample: "Srinivas Kumar" },
  { key: "staff_name", label: "Staff name", sample: "Meena Iyer" },
  { key: "school_name", label: "School name", sample: "Sunrise Public School" },
  { key: "school_phone", label: "School phone", sample: "9876500001" },
  { key: "date", label: "Date", sample: "09-10-2026" },
  { key: "due_amount", label: "Due amount", sample: "₹12,500" },
  { key: "due_date", label: "Due date", sample: "15-10-2026" },
  { key: "receipt_number", label: "Receipt number", sample: "SPS/2026/00456" },
  { key: "paid_amount", label: "Paid amount", sample: "₹12,500" },
  { key: "payment_date", label: "Payment date", sample: "09-10-2026" },
  { key: "receipt_link", label: "Receipt link", sample: "https://app.schoolos.in/r/…" },
  { key: "exam_name", label: "Exam name", sample: "Half Yearly Exam" },
  { key: "title", label: "Notice title", sample: "Diwali holidays" },
  { key: "ticket_number", label: "Ticket number", sample: "Q-00012" },
  { key: "code", label: "One-time code", sample: "482913" },
  { key: "link", label: "Link", sample: "https://app.schoolos.in/p/…" },
  { key: "how_to_pay", label: "How to pay", sample: "Pay online on your Parent Link: https://app.schoolos.in/p/…" },
  { key: "message", label: "Message text", sample: "School will close at 12:30 PM today." },
];

export const VARIABLE_KEYS = new Set(VARIABLES.map((v) => v.key));

const BLANK = /\{([a-z_]+)\}/g;
export const STRAY = /\{+[^{}\n]{0,40}\}+/g;

/** The blanks used in a text, in the order they first appear (this order is used for WhatsApp's {{1}}, {{2}}...). */
export function variablesIn(text: string): string[] {
  const seen: string[] = [];
  for (const m of text.matchAll(BLANK)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

/**
 * Blanks WhatsApp carries as a button, not in the words: an approved template
 * may hold a link only in a URL button. Its words are the button's label.
 */
export const BUTTON_BLANKS: Record<string, string> = { receipt_link: "Open receipt" };

/**
 * What a WhatsApp template is sent to WhatsApp as (and later filled in the
 * same order): the text without the lines that hold a button blank, its blanks
 * (WhatsApp's {{1}}, {{2}}...) and the button, if any. WhatsApp refuses a text
 * that ends with a blank, so such a text gets a full stop.
 */
export function whatsappParts(body: string): { text: string; variables: string[]; button: { blank: string; label: string } | null } {
  const lines = body.split("\n");
  const blank = Object.keys(BUTTON_BLANKS).find((k) => body.includes(`{${k}}`)) ?? null;
  const kept = blank ? lines.filter((l) => !Object.keys(BUTTON_BLANKS).some((k) => l.includes(`{${k}}`))) : lines;
  let text = kept.join("\n").trimEnd();
  if (/\{[a-z_]+\}$/.test(text)) text += ".";
  return { text, variables: variablesIn(text), button: blank ? { blank, label: BUTTON_BLANKS[blank] } : null };
}

/** Blanks that are not on the list, so the person can fix a typing mistake. */
export function unknownVariables(text: string): string[] {
  return variablesIn(text).filter((v) => !VARIABLE_KEYS.has(v));
}

/** Braces in a text before it is filled that are not a blank: {Student Name}, {{diary}}, a "{" without its pair. */
export function strayBlanks(text: string): string[] {
  const found = [...new Set((text.match(STRAY) ?? []).filter((m) => !/^\{[a-z_]+\}$/.test(m)))];
  if (!found.length && /[{}]/.test(text.replace(STRAY, ""))) found.push(text.replace(STRAY, "").includes("{") ? "{" : "}");
  return found;
}

/** Who a typed message goes to, for the blanks it can fill. */
export type BlankAudience = "parents" | "students" | "staff";

/**
 * The blanks a typed message on Send Message can fill for each kind of person:
 * the school's own details, and the person and their child. Amounts, receipts
 * and links are filled only by the messages Fee Management and the other
 * modules send by themselves.
 */
const TYPED_BLANKS: Record<BlankAudience, string[]> = {
  parents: ["guardian_name", "student_name", "class", "admission_no", "school_name", "school_phone", "date"],
  students: ["student_name", "class", "admission_no", "school_name", "school_phone", "date"],
  staff: ["staff_name", "school_name", "school_phone", "date"],
};
const COMMON = ["school_name", "school_phone", "date"];

/** The blanks every chosen kind of person has; with nobody chosen yet, only the school's own. */
export function blanksFor(kinds: BlankAudience[]): string[] {
  const list = [...new Set(kinds)];
  if (!list.length) return COMMON;
  return TYPED_BLANKS[list[0]].filter((k) => list.every((x) => TYPED_BLANKS[x].includes(k)));
}

/** Words people often type for a blank that has another name here. Only suggested, never filled by themselves. */
const SAME_AS: Record<string, string> = {
  parent_name: "guardian_name", parent: "guardian_name", parents_name: "guardian_name", guardian: "guardian_name", father_name: "guardian_name", mother_name: "guardian_name", name_of_parent: "guardian_name",
  name: "student_name", student: "student_name", child_name: "student_name", child: "student_name", students_name: "student_name", ward_name: "student_name", first_name: "student_name", full_name: "student_name",
  class_name: "class", section: "class", class_section: "class", grade: "class", standard: "class",
  admission_number: "admission_no", admission: "admission_no", roll_no: "admission_no", adm_no: "admission_no",
  teacher_name: "staff_name", staff: "staff_name", employee_name: "staff_name", teacher: "staff_name",
  school: "school_name", schoolname: "school_name", phone: "school_phone", school_number: "school_phone", contact: "school_phone", mobile: "school_phone",
  today: "date", amount: "due_amount", fee: "due_amount", fees: "due_amount", due: "due_amount", last_date: "due_date",
};

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** The real blank someone most likely meant by an unknown one ({parent_name} → guardian_name), or null. */
export function suggestBlank(word: string, prefer: string[] = []): string | null {
  const w = word.toLowerCase().replace(/[^a-z_]/g, "");
  if (SAME_AS[w]) return SAME_AS[w];
  let best: { key: string; d: number } | null = null;
  for (const key of [...prefer, ...VARIABLE_KEYS]) {
    const d = distance(w, key);
    if (!best || d < best.d) best = { key, d };
  }
  return best && best.d <= Math.max(2, Math.floor(best.key.length / 3)) ? best.key : null;
}

const braces = (k: string) => `{${k}}`;
const joinWords = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * Why a typed message cannot go as written, in plain words, or null:
 * "{parent_name} is not a blank the school can use. Did you mean {guardian_name}?
 * Blanks you can use: {guardian_name}, {student_name} …".
 */
export function unknownBlankWords(unknown: string[], usable: string[]): string | null {
  if (!unknown.length) return null;
  const head = unknown.length === 1 ? `${braces(unknown[0])} is not a blank the school can use.` : `${joinWords(unknown.map(braces))} are not blanks the school can use.`;
  const hints = unknown.map((u) => [u, suggestBlank(u, usable)] as const).filter(([, s]) => s);
  const mean = hints.length === 0 ? "" : unknown.length === 1 ? ` Did you mean ${braces(hints[0][1]!)}?` : ` Did you mean ${joinWords(hints.map(([u, s]) => `${braces(s!)} for ${braces(u)}`))}?`;
  return `${head}${mean} Blanks you can use: ${usable.map(braces).join(", ")}.`;
}

/**
 * Blanks from the list that the chosen people do not have, so everyone would
 * be left out: "{staff_name} is filled only for staff, so parents would be
 * left out." Null when every blank fits.
 */
export function unfitBlankWords(text: string, kinds: BlankAudience[]): string | null {
  if (!kinds.length) return null;
  const usable = blanksFor(kinds);
  const unfit = variablesIn(text).filter((k) => VARIABLE_KEYS.has(k) && !usable.includes(k));
  if (!unfit.length) return null;
  const who = joinWords([...new Set(kinds)]);
  return `${joinWords(unfit.map(braces))} cannot be filled in a message typed here for ${who}, so ${unfit.length === 1 ? "anyone without it" : "anyone without them"} would be left out. Blanks you can use: ${usable.map(braces).join(", ")}.`;
}
