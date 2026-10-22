"use server";

import type { FormState } from "@/lib/forms";
import { plural, wordList } from "@/lib/academic/common";
import { formatDateTime } from "@/lib/format";
import { ExamRuleError } from "@/lib/exams/common";
import { cancelScheduled, publishResults, unpublishResults } from "@/lib/exams/results";
import { assertInScope, assertYearInScope, seesSection, type ExamScope } from "@/lib/exams/scope";
import type { Tx } from "@/lib/db";
import { act, actSimple, str } from "../_lib/server";

/** "2026-10-12T09:00" typed in the school's time zone, as a moment. */
function zonedToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (shown - guess));
}

const KEY = /^(exam:[0-9a-f-]{36}|final:[0-9a-f-]{36})$/i;

/** The exam (or the final result of a year) is one of the person's campus when they are limited to one campus. */
async function checkKey(tx: Tx, scope: ExamScope, key: string) {
  if (key.startsWith("final:")) assertYearInScope(scope, key.slice(6), "academic year");
  else await assertInScope(tx, scope, "exam", key.slice(5));
}

export async function publishAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return act("approve", async ({ tx, current, scope }) => {
    const key = str(fd, "key");
    if (!KEY.test(key)) throw new ExamRuleError("Choose the exam first.");
    await checkKey(tx, scope, key);
    const sectionIds = fd.getAll("sectionIds").map(String).filter((s) => seesSection(scope, s));
    const when = str(fd, "when") === "later" ? zonedToUtc(str(fd, "publishOn"), current.school.timeZone) : new Date();
    if (!when) throw new ExamRuleError("Choose the date and time to publish.", "publishOn");
    const r = await publishResults(tx, current.ctx, scope, { key, sectionIds, publishOn: when, messageParents: fd.get("messageParents") === "on" });
    if (r.scheduled) return { flash: { message: `Results of ${wordList(r.sections)} will publish by themselves on ${formatDateTime(r.publishOn, current.school.timeZone)}.` } };
    return { flash: { message: `Results published for ${wordList(r.sections)}: ${plural(r.students, "student")}. Report cards are ready${r.parents ? ` and ${plural(r.parents, "parent")} ${r.parents === 1 ? "was" : "were"} messaged` : ""}.` } };
  }, { formData: fd, needs: "publish", timeout: 120_000 });
}

export async function unpublishAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return act("approve", async ({ tx, current, scope }) => {
    const key = str(fd, "key");
    if (!KEY.test(key)) throw new ExamRuleError("Choose the exam first.");
    await checkKey(tx, scope, key);
    const n = await unpublishResults(tx, current.ctx, scope, { key, sectionIds: fd.getAll("sectionIds").map(String).filter((s) => seesSection(scope, s)), reason: str(fd, "reason") });
    return { flash: { message: `${plural(n, "result")} taken back to draft. Report cards are off Parent Link until published again. Parents were not messaged.` } };
  }, { formData: fd, needs: "publish" });
}

export async function cancelScheduledAction(id: string) {
  return actSimple("approve", async ({ tx, current, scope }) => {
    // Another campus's publish date is unknown to a person limited to one campus.
    const pub = /^[0-9a-f-]{36}$/i.test(id) ? await tx.resultPublication.findFirst({ where: { id }, select: { academicYearId: true } }) : null;
    if (pub && scope.yearIds && !scope.yearIds.includes(pub.academicYearId)) throw new ExamRuleError("This publish date was already used or cancelled. Reload the page.");
    await cancelScheduled(tx, current.ctx, scope, id);
    return { flash: { message: "The publish date was cancelled. The results stay in draft." } };
  }, { needs: "publish" });
}
