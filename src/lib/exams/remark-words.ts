// The AI assistant's part in report-card remark suggestions (gap G30): it may
// only reword the sentences the rules already wrote from the student's own
// records. Pure (no database, no network), so every check is tested directly;
// the request itself goes through aiTask() in ./remark-ai.ts.
//
// What is sent: per student a stand-in key ("S1"), and the rule sentences with
// the student's name replaced by {name}, each with its source (subject names,
// exam titles, percentages, days, homework counts, co-scholastic grades).
// Never the name, admission number, gender, caste, religion, income, health
// or anything else about the child (00-global.md §2.1 rule 7).
//
// What is kept from the answer: only remarks that cite the evidence they use,
// whose every number is in that evidence, that name nobody, and that hold no
// word about the child as fixed or about caste, religion, gender, income or
// health. Anything else is dropped; the rule suggestions stay.
import * as z from "zod/v4";
import { REMARK_MAX, type RemarkDraft, type RemarkLine, type RemarkOption } from "./remark-drafts";
import { remarkWordProblem } from "./remark-phrases";

export const REMARK_SYSTEM = [
  "You help a class teacher in an Indian school word report card remarks.",
  "For each student you get numbered pieces of evidence: a plain sentence and its source (marks, attendance, homework or co-scholastic grades from the school's records).",
  "Write up to 3 short, warm and specific remarks per student, each 1 to 3 sentences, in simple English a parent understands.",
  "Use only the evidence given. Do not add any number, subject, exam, fact or reason that is not in the evidence you cite.",
  "Write {name} wherever the student's name goes; never invent a name.",
  "Describe work and effort that can change, never the child as fixed (no 'lazy', 'weak student', 'gifted').",
  "Never mention caste, religion, gender, family, income or health.",
  "For each remark list in refs the evidence numbers (like E2) it is based on.",
].join("\n");

export type RemarkQuestion = { students: { key: string; evidence: { ref: string; sentence: string; source: string }[] }[] };

export const remarkAnswer = z.object({
  students: z.array(z.object({
    key: z.string(),
    remarks: z.array(z.object({ text: z.string(), refs: z.array(z.string()) })),
  })),
});
export type RemarkAnswer = z.infer<typeof remarkAnswer>;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hideName = (text: string, name: string) => (name.trim() ? text.replace(new RegExp(`\\b${escape(name.trim())}\\b`, "g"), "{name}") : text);

/** The request: stand-in keys and the evidence of each student that has a suggestion; and the way back to the students. */
export function remarkQuestion(drafts: RemarkDraft[], firstNames: ReadonlyMap<string, string>) {
  const keys = new Map<string, string>();
  const lines = new Map<string, Map<string, RemarkLine>>();
  const students: RemarkQuestion["students"] = [];
  for (const d of drafts) {
    if (!d.options.length) continue;
    const key = `S${students.length + 1}`;
    keys.set(key, d.studentId);
    const refs = new Map<string, RemarkLine>();
    const evidence = d.lines.map((l, i) => {
      refs.set(`E${i + 1}`, l);
      return { ref: `E${i + 1}`, sentence: hideName(l.text, firstNames.get(d.studentId) ?? ""), source: l.source };
    });
    lines.set(key, refs);
    students.push({ key, evidence });
  }
  return { question: { students } satisfies RemarkQuestion, keys, lines };
}

const NUMBER = /\d+(?:\.\d+)?/g;
const wordsOf = (s: string) => new Set(s.toLowerCase().match(/[a-z]+/g) ?? []);

/** Why one reworded remark cannot be shown, or null when it can. */
export function remarkProblem(text: string, cited: RemarkLine[]): string | null {
  if (!cited.length) return "cites no evidence";
  if (text.length < 10 || text.length > REMARK_MAX) return "too short or too long";
  if (/[{}]/.test(text.replace(/\{name\}/g, ""))) return "unknown blank";
  const evidence = cited.map((l) => `${l.text} ${l.source}`).join(" ");
  const numbers = new Set(evidence.match(NUMBER) ?? []);
  if ((text.match(NUMBER) ?? []).some((n) => !numbers.has(n))) return "a number not in the evidence";
  // A name or proper word the evidence does not have: the AI made it up.
  const known = wordsOf(evidence);
  // (Only inside a sentence: the first word of a sentence is capitalised anyway.)
  const capitals = text.replace(/\{name\}/g, "x").match(/(?<=[^.!?\s]\s+)[A-Z][a-z]+/g) ?? [];
  if (capitals.some((w) => !known.has(w.toLowerCase()))) return "a name not in the evidence";
  // Words from the evidence (such as "Health and Physical Education") are not the AI's own.
  const own = text.replace(/\{name\}/g, " ").replace(/[A-Za-z]+/g, (w) => (known.has(w.toLowerCase()) ? " " : w));
  return remarkWordProblem(own) ? "words not for a remark" : null;
}

/** The reworded remarks worth showing, per student, each with the evidence it cites. */
export function readRemarkAnswer(q: ReturnType<typeof remarkQuestion>, answer: RemarkAnswer, firstNames: ReadonlyMap<string, string>) {
  const out = new Map<string, RemarkOption[]>();
  for (const s of answer.students) {
    const studentId = q.keys.get(s.key);
    const refs = q.lines.get(s.key);
    if (!studentId || !refs) continue;
    const name = firstNames.get(studentId) ?? "";
    const kept: RemarkOption[] = [];
    for (const r of s.remarks.slice(0, 3)) {
      const cited = [...new Set(r.refs)].map((ref) => refs.get(ref)).filter((l): l is RemarkLine => Boolean(l));
      if (cited.length !== new Set(r.refs).size) continue;
      const text = r.text.replace(/\s+/g, " ").trim();
      if (remarkProblem(text, cited)) continue;
      const filled = text.replace(/\{name\}/g, name || "The student");
      if (filled.length > REMARK_MAX || kept.some((k) => k.text === filled)) continue;
      // Sources in the order the rules wrote them.
      const order = [...refs.values()];
      cited.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      kept.push({ id: `ai-${kept.length + 1}`, label: "Reworded", text: filled, lines: cited, byAi: true });
    }
    if (kept.length) out.set(studentId, kept);
  }
  return out;
}
