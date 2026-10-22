// A ready-made question's title in the screen's language (00-global.md §2, Ask). English stays
// exactly questionTitle(); other languages use whole sentences from the catalogue with the class,
// time and amount filled in, so the word order is right in each language.
import type { T } from "../i18n/t";
import { cleanParams, classWords, isQuestionKey, isWhen, questionTitle, QUESTIONS, type AskParams, type AskWhen, type QuestionKey } from "./questions";

const WHEN_KEYS = {
  today: "today",
  yesterday: "yesterday",
  thisweek: "this week",
  lastweek: "last week",
  thismonth: "this month",
  lastmonth: "last month",
} as const satisfies Record<AskWhen, string>;

export function questionTitleIn(t: T, key: QuestionKey, raw: AskParams = {}): string {
  if (t.lang === "en") return questionTitle(key, raw);
  const p = cleanParams(key, raw);
  const day = p.when ?? QUESTIONS[key].whens?.[0] ?? "today";
  const when = t(WHEN_KEYS[day]);
  // "Class 5 A" is translated as a class; "UKG B" stays as the school writes it.
  const named = p.cls ? classWords(p.cls) : "";
  const cls = named.startsWith("Class ") ? t("Class {n}", { n: named.slice(6) }) : named;
  const amount = p.amount ? `₹${p.amount.toLocaleString("en-IN")}` : "";
  switch (key) {
    case "absent-today":
      if (day === "yesterday") return cls ? t("Who was absent yesterday in {class}?", { class: cls }) : t("Who was absent yesterday?");
      return cls ? t("Who is absent today in {class}?", { class: cls }) : t("Who is absent today?");
    case "absent-streak":
      return cls ? t("Who has been absent several days in a row in {class}?", { class: cls }) : t("Who has been absent several days in a row?");
    case "below-attendance":
      return cls ? t("Who is below the attendance line in {class}?", { class: cls }) : t("Who is below the attendance line?");
    case "not-marked":
      return t("Which classes have not taken attendance today?");
    case "late-staff":
      return t("Which staff came late {when}?", { when });
    case "staff-absent":
      return t("Which staff are absent {when}?", { when });
    case "staff-on-leave":
      return t("Which staff are on leave {when}?", { when });
    case "fees-collected":
      return cls ? t("How much fee was collected {when} in {class}?", { when, class: cls }) : t("How much fee was collected {when}?", { when });
    case "fees-overdue":
      if (amount) return cls ? t("Who owes {amount} or more in {class}?", { amount, class: cls }) : t("Who owes {amount} or more?", { amount });
      return cls ? t("Who has fees overdue in {class}?", { class: cls }) : t("Who has fees overdue?");
    case "below-pass":
      return cls ? t("Who is below the pass mark in {class}?", { class: cls }) : t("Which classes have marks below the pass mark?");
    case "birthdays":
      return day === "today" ? t("Whose birthday is today?") : t("Whose birthday is coming up this week?");
  }
}

/** The title of a question link (/ask?q=…&cls=…) in the screen's language; `fallback` for any other link. */
export function linkTitleIn(t: T, href: string, fallback: string): string {
  const u = new URLSearchParams(href.split("?")[1] ?? "");
  const q = u.get("q");
  if (!href.startsWith("/ask") || !isQuestionKey(q)) return t.any(fallback);
  const when = u.get("when");
  const amount = Number(u.get("amount"));
  return questionTitleIn(t, q, { cls: u.get("cls"), when: isWhen(when) ? when : null, amount: Number.isFinite(amount) && amount > 0 ? amount : null });
}
