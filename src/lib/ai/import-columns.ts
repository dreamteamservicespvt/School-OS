// Smart Import's question to the AI service (gap list G18): which file column
// holds each School OS field the rules could not match. The rules always go
// first (src/lib/move-in/match.ts, src/lib/students/smart-import.ts). What is
// sent is only each left-over column's heading and a description of what its
// values look like, worked out here ("10-digit mobile numbers starting 6 to
// 9", "dates written DD-MM-YYYY"). Never a value from the file.
// No database here, so it can be tested on its own.
import * as z from "zod/v4";
import { maskText } from "./minimise";

const PHONE = /^(\+?91[\s-]?)?0?[6-9]\d{4}[\s-]?\d{5}$/;
const CLASS_SECTION = /^(class\s*|std\.?\s*|grade\s*)?(\d{1,2}(st|nd|rd|th)?|[ivx]{1,4}|lkg|ukg|nursery|kg)\s*[-/ ]\s*[a-z]$/i;
const CLASS_ONLY = /^(class\s*|std\.?\s*|standard\s*|grade\s*)?(\d{1,2}(st|nd|rd|th)?|[ivx]{1,4}|lkg|ukg|nursery|pre-?kg|kg)$/i;

/** A code's pattern with letters as A and digits as 9 ("SS/2026/00123" → "AA/9999/99999"). */
const maskOf = (v: string) => v.replace(/[A-Za-z]/g, "A").replace(/\d/g, "9").slice(0, 24);

/** What the values of one column look like, in words. Never a value itself. */
export function shapeOf(values: string[]): string {
  const all = values.slice(0, 200).map((x) => (x ?? "").trim());
  const v = all.filter(Boolean);
  if (!v.length) return "empty";
  const share = (test: (x: string) => boolean) => v.filter(test).length / v.length;
  const most = (re: RegExp) => share((x) => re.test(x)) >= 0.7;
  let kind: string;
  if (most(PHONE)) kind = "10-digit mobile numbers starting 6 to 9";
  else if (most(/^\d{4}\s?\d{4}\s?\d{4}$/)) kind = "12-digit numbers";
  else if (most(/^\d{1,2}([-/.])\d{1,2}\1\d{4}$/)) {
    const sep = v.find((x) => /^\d{1,2}([-/.])\d{1,2}\1\d{4}$/.test(x))!.match(/[-/.]/)![0];
    const monthFirst = v.some((x) => Number(x.split(/[-/.]/)[1]) > 12) && !v.some((x) => Number(x.split(/[-/.]/)[0]) > 12);
    kind = monthFirst ? `dates written MM${sep}DD${sep}YYYY` : `dates written DD${sep}MM${sep}YYYY`;
  } else if (most(/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/)) kind = "dates written YYYY-MM-DD";
  else if (most(/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2}$/)) kind = "dates written DD-MM-YY";
  else if (most(/^\d{1,2}[\s-]+[a-z]{3,9}[\s,-]+\d{2,4}$/i) || most(/^[a-z]{3,9}\s+\d{1,2},?\s+\d{4}$/i)) kind = "dates with the month as a word";
  else if (most(/^\d{5}$/) && share((x) => +x > 30000 && +x < 60000) >= 0.7) kind = "spreadsheet date numbers";
  else if (most(/^(m|f|male|female|boy|girl|other)$/i)) kind = "gender values such as Male and Female";
  else if (most(/^(a|b|ab|o)\s?([+-]|\s?(pos|neg|positive|negative))$/i)) kind = "blood groups such as B+";
  else if (most(/^(yes|no|y|n|true|false)$/i)) kind = "Yes or No";
  else if (most(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i)) kind = "email addresses";
  else if (most(CLASS_SECTION)) kind = "class with section, such as 5-A or VII B";
  else if (most(CLASS_ONLY)) kind = "class names, such as 5, 5th, VII or UKG";
  else if (most(/^\d+(\.\d+)?$/)) {
    if (share((x) => x.includes(".")) >= 0.3) kind = "amounts with decimals";
    else {
      const lens = v.filter((x) => /^\d+$/.test(x)).map((x) => x.length);
      const lo = Math.min(...lens), hi = Math.max(...lens);
      kind = lo === hi ? `${lo}-digit numbers` : `numbers of ${lo} to ${hi} digits`;
    }
  } else if (most(/^[A-Za-z][A-Za-z.' ]*$/)) {
    const counts = v.map((x) => x.split(/\s+/).filter(Boolean).length);
    const lo = Math.min(...counts), hi = Math.max(...counts);
    const avg = v.reduce((n, x) => n + x.length, 0) / v.length;
    kind = hi <= 5 && avg <= 40 ? (lo === hi ? `words of letters, ${lo} ${lo === 1 ? "word" : "words"} each` : `words of letters, ${lo} to ${hi} words`) : "sentences of text";
  } else if (share((x) => x.length > 25 && /,/.test(x)) >= 0.5) kind = "addresses or long text";
  else {
    const masks = new Map<string, number>();
    for (const x of v) masks.set(maskOf(x), (masks.get(maskOf(x)) ?? 0) + 1);
    const [top, n] = [...masks.entries()].sort((a, b) => b[1] - a[1])[0];
    kind = n / v.length >= 0.6 && /[A9]/.test(top) && top.length <= 20 ? `codes shaped like ${top}` : "mixed text and numbers";
  }
  const distinct = new Set(v.map((x) => x.toLowerCase())).size;
  const extra: string[] = [];
  if (v.length >= 10 && distinct <= 6) extra.push(`only ${distinct} different values`);
  const empty = 1 - v.length / all.length;
  if (empty >= 0.2) extra.push(`${Math.round(empty * 100)}% empty`);
  return [kind, ...extra].join(", ");
}

/** A heading as it may be sent: tidied, short, and dropped when it looks like a value (a phone, a date, a long number). */
export function headingForAi(h: string): string {
  const t = (h ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!t) return "(no heading)";
  if (/\d{5,}/.test(t) || /@/.test(t) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(t) || PHONE.test(t)) return "(no heading)";
  return maskText(t).text;
}

export const COLUMN_MATCH_SYSTEM = [
  "You help an Indian school move its records into School OS from a spreadsheet.",
  "You get the School OS fields that are still unmatched, and the spreadsheet's left-over columns: each column's number, its heading and a description of what its values look like. You never see the values themselves.",
  "For each unmatched field, choose the column that holds it only when the heading or the description of its values clearly supports it. When you are not sure, leave the field out: a wrong match is worse than none.",
  "Use each column at most once and each field at most once. Never name a column or field that is not in the lists.",
  "Headings may be abbreviated (Adm No, F Name, DOB, Mob), in an Indian language written in English letters, or come from school software such as Fedena, Entab or Teachmint.",
  "For each match give a reason of at most 12 plain words, such as \"The heading means father's name\" or \"10-digit mobile numbers\".",
].join("\n");

export const columnAnswer = z.object({
  matches: z.array(z.object({ column: z.number().int(), field: z.string(), reason: z.string() })),
});
export type ColumnAnswer = z.infer<typeof columnAnswer>;

export type ColumnQuestion = {
  importing: string;
  fields: { field: string; label: string }[];
  columns: { column: number; heading: string; values: string }[];
};

/** Most left-over columns sent in one question. */
const MAX_COLUMNS = 60;

/**
 * The question for the columns the rules left: the unmatched School OS fields
 * and the unused file columns, or null when there is nothing to ask.
 */
export function columnQuestion(input: {
  importing: string;
  fields: { key: string; label: string }[];
  headers: string[];
  rows: string[][];
  /** School OS field keys already matched (by the rules, a remembered match or the person). */
  matched: ReadonlySet<string>;
  /** File columns already used. */
  used: ReadonlySet<number>;
}): ColumnQuestion | null {
  const fields = input.fields.filter((f) => !input.matched.has(f.key)).map((f) => ({ field: f.key, label: f.label.slice(0, 80) }));
  const columns = input.headers
    .map((h, i) => ({ column: i, heading: headingForAi(h), values: shapeOf(input.rows.map((r) => r[i] ?? "")) }))
    .filter((c) => !input.used.has(c.column) && c.values !== "empty")
    .slice(0, MAX_COLUMNS);
  if (!fields.length || !columns.length) return null;
  return { importing: input.importing.slice(0, 60), fields, columns };
}

export type AiColumnSuggestion = { key: string; label: string; index: number; header: string; why: string };

/** The answer kept to what was asked: real fields and columns, each once, with a short reason. */
export function readColumnAnswer(q: ColumnQuestion, answer: ColumnAnswer, headers: string[]): AiColumnSuggestion[] {
  const fields = new Map(q.fields.map((f) => [f.field, f.label]));
  const columns = new Set(q.columns.map((c) => c.column));
  const takenFields = new Set<string>();
  const takenColumns = new Set<number>();
  const out: AiColumnSuggestion[] = [];
  for (const m of answer.matches) {
    if (!fields.has(m.field) || !columns.has(m.column) || takenFields.has(m.field) || takenColumns.has(m.column)) continue;
    takenFields.add(m.field);
    takenColumns.add(m.column);
    const why = maskText(String(m.reason ?? "").replace(/\s+/g, " ").trim()).text.slice(0, 100) || "Suggested from the heading and the kind of values";
    out.push({ key: m.field, label: fields.get(m.field)!, index: m.column, header: headers[m.column] || `Column ${m.column + 1}`, why });
  }
  return out;
}
