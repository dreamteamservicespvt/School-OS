// Rewording remark suggestions with the AI assistant (gap G30), through the
// one gateway aiTask(): it checks the school's AI switch, the teacher
// assistant's own switch, the person's role, hides private details, keeps the
// daily limit and logs every call. Never called inside a school transaction.
// When the AI cannot help (off, not connected, failed), the rule suggestions
// are shown as they are, with a short line saying why.
import "server-only";

import type { SchoolContext } from "../db";
import { aiTask } from "../ai";
import type { RemarkDraft } from "./remark-drafts";
import { readRemarkAnswer, remarkAnswer, remarkQuestion, REMARK_SYSTEM } from "./remark-words";

/** Students per request, so a big class stays within one answer's length. */
const PER_REQUEST = 30;

export async function rewordRemarks(ctx: SchoolContext, drafts: RemarkDraft[], firstNames: ReadonlyMap<string, string>): Promise<{ drafts: RemarkDraft[]; message: string }> {
  const asked = drafts.filter((d) => d.options.length);
  if (!asked.length) return { drafts, message: "" };
  const reworded = new Map<string, RemarkDraft["options"]>();
  let failed = "";
  for (let i = 0; i < asked.length; i += PER_REQUEST) {
    const q = remarkQuestion(asked.slice(i, i + PER_REQUEST), firstNames);
    const r = await aiTask(ctx, {
      feature: "ai-teacher-assistant", purpose: "Reword report card remarks", system: REMARK_SYSTEM,
      input: q.question, schema: remarkAnswer, effort: "low", maxTokens: 8000,
    });
    if (!r.ok) { failed = r.words; break; }
    for (const [id, options] of readRemarkAnswer(q, r.data, firstNames)) reworded.set(id, options);
  }
  const out = drafts.map((d) => {
    const extra = (reworded.get(d.studentId) ?? []).filter((o) => !d.options.some((x) => x.text === o.text));
    return extra.length ? { ...d, options: [...d.options, ...extra] } : d;
  });
  const message = failed
    ? `${failed} The suggestions below are from the rules only.`
    : reworded.size ? "" : "The AI assistant had no rewording to add. The suggestions below are from the rules.";
  return { drafts: out, message };
}
