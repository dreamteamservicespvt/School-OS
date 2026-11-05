// Plain-words messages for a form's boxes (00-global.md P3, P7), shared by
// src/components/ui/form-problems.tsx. When Save or Next is pressed with boxes
// missing or wrong, every bad box is marked at once with its own message (in
// place of the browser's single "Please fill out this field." bubble), and a
// box's message goes as soon as it holds a good value (testing issues 10, 20, 25).

/** What the browser says is wrong with a box (the parts of ValidityState used here). */
export type Validity = {
  valueMissing?: boolean; typeMismatch?: boolean; patternMismatch?: boolean; tooLong?: boolean; tooShort?: boolean;
  rangeUnderflow?: boolean; rangeOverflow?: boolean; stepMismatch?: boolean; badInput?: boolean; customError?: boolean;
};

/** The box itself: its kind and limits, its label, and the browser's own message for a custom error. */
export type BoxInfo = {
  label: string;
  /** "select", "checkbox", "radio", "file", "email", "number", "date", "text" ... */
  kind: string;
  min?: string; max?: string; minLength?: number; maxLength?: number; step?: string;
  /** The box's title, which says the expected form when a pattern is set ("12 digits"). */
  title?: string;
  /** The browser's message; for a custom error it is the screen's own words. */
  validationMessage?: string;
};

/** The label without its required star, colon or extra spaces. */
export function cleanLabel(label: string): string {
  return label.replace(/\*/g, "").replace(/\s+/g, " ").replace(/[:\s]+$/, "").trim();
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
function shown(v: string | undefined) {
  if (!v) return "";
  const m = ISO_DAY.exec(v);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
}

/** The message for one bad box, in plain words: what is wrong and what to do. */
export function problemMessage(v: Validity, box: BoxInfo): string {
  const label = cleanLabel(box.label) || "This box";
  const kind = box.kind.toLowerCase();
  if (v.customError && box.validationMessage) return box.validationMessage;
  if (v.valueMissing) {
    if (kind === "select" || kind === "select-one" || kind === "select-multiple" || kind === "radio") return `Choose ${lowerFirst(label)}.`;
    if (kind === "checkbox") return `Tick ${lowerFirst(label)} to go on.`;
    if (kind === "file") return `Add ${lowerFirst(label)}.`;
    return `${label} is needed.`;
  }
  if (v.badInput) return kind === "number" ? `${label}: type a number.` : `${label} is not complete. Check what is typed.`;
  if (v.typeMismatch) {
    if (kind === "email") return `${label}: type a full email address, like name@example.com.`;
    if (kind === "url") return `${label}: type a full web address, starting https://.`;
    return `${label} is not in the right form.`;
  }
  if (v.patternMismatch) return box.title ? `${label}: ${box.title.replace(/\.$/, "")}.` : `${label} is not in the right form.`;
  if (v.tooShort) return `${label} needs at least ${box.minLength} characters.`;
  if (v.tooLong) return `${label} can have at most ${box.maxLength} characters.`;
  if (v.rangeUnderflow) return kind.startsWith("date") || kind === "time" ? `${label} cannot be before ${shown(box.min)}.` : `${label} must be ${box.min} or more.`;
  if (v.rangeOverflow) return kind.startsWith("date") || kind === "time" ? `${label} cannot be after ${shown(box.max)}.` : `${label} must be ${box.max} or less.`;
  if (v.stepMismatch) return !box.step || box.step === "1" ? `${label}: type a whole number.` : `${label}: use steps of ${box.step}.`;
  return box.validationMessage || `${label} is not right. Check it.`;
}

function lowerFirst(s: string) {
  // "Class" -> "a class" reads oddly; keep the label as written but lower its first letter unless it is a name (all capitals, "ID").
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

/**
 * Which message a box shows: the one found on this page when Save or Next was
 * pressed comes first; the server's message for it stays until the person
 * changes that box to a good value. `changed` holds, for each box changed since,
 * the message it had then: a different message given later shows again.
 */
export function shownProblem(name: string, given: string | undefined, found: Record<string, string>, changed: ReadonlyMap<string, string>): string | undefined {
  if (found[name]) return found[name];
  if (!given) return undefined;
  return changed.get(name) === given ? undefined : given;
}

/** The first of `names` in the page's order (`order` is every box name, top to bottom). */
export function firstInOrder(order: readonly string[], names: Iterable<string>): string | null {
  const want = new Set(names);
  return order.find((n) => want.has(n)) ?? null;
}
