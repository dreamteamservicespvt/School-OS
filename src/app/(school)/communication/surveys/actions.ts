"use server";

// Surveys: write, send, remind, close and archive. Office work: school-wide Communication reach only,
// and only when the school has switched Surveys on. Checked here, on the server.
import { revalidatePath } from "next/cache";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { commOfficeAction, OfficeOnly } from "@/lib/communication/access";
import { COMM_FEATURES } from "@/lib/communication/features";
import { archiveSurvey, audienceCount, audienceOptions, closeSurvey, QUESTION_KINDS, remindSurvey, saveSurvey, sendSurvey, SurveyProblem, MAX_OPTIONS, MAX_QUESTIONS, type QuestionKind, type SurveyInput } from "@/lib/communication/surveys";

const uuid = /^[0-9a-f-]{36}$/;
const PATH = "/communication/surveys";
export type SurveyResult = { ok: true; id: string } | { ok: false; message: string };

async function access(action: "create" | "edit" | "archive" = "create") {
  const a = await commOfficeAction(action);
  if (!a.current.features.has(COMM_FEATURES.surveys)) throw new SurveyProblem("Surveys are switched off for this school. Switch them on in Message Settings.");
  return a;
}
const refusal = (e: unknown) => {
  if (e instanceof SurveyProblem || e instanceof OfficeOnly) return e.message;
  throw e;
};

function clean(raw: unknown): SurveyInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const qs = Array.isArray(r.questions) ? r.questions.slice(0, MAX_QUESTIONS + 1) : [];
  return {
    title: String(r.title ?? "").slice(0, 200),
    audience: String(r.audience ?? ""),
    anonymous: Boolean(r.anonymous),
    closesOn: r.closesOn ? String(r.closesOn) : null,
    questions: qs.map((q) => {
      const x = (q ?? {}) as Record<string, unknown>;
      const kind = String(x.kind ?? "");
      return {
        kind: (QUESTION_KINDS.some((k) => k.key === kind) ? kind : "text") as QuestionKind,
        text: String(x.text ?? "").slice(0, 400),
        options: Array.isArray(x.options) ? x.options.slice(0, MAX_OPTIONS + 4).map((o) => String(o ?? "").slice(0, 80)) : [],
        required: x.required !== false,
      };
    }),
  };
}

/** Saves a draft and, when asked, sends it straight away. */
export async function saveSurveyAction(id: string | null, raw: unknown, send: boolean): Promise<SurveyResult> {
  if (id && !uuid.test(id)) return { ok: false, message: "This survey was not found." };
  const input = clean(raw);
  if (!input) return { ok: false, message: "Fill in the survey." };
  try {
    const a = await access(id ? "edit" : "create");
    const { ctx } = a.current;
    const tz = a.current.school.timeZone;
    const today = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date())}T00:00:00Z`);
    const out = await withSchool(ctx, async (tx) => {
      const labels = new Map((await audienceOptions(tx, ctx)).map((o) => [o.value, o.label]));
      const survey = await saveSurvey(tx, ctx, id, input, labels, today);
      const sent = send ? await sendSurvey(tx, ctx, survey.id, tz) : null;
      return { survey, sent };
    });
    revalidatePath(PATH);
    await flash(out.sent
      ? { message: `Survey sent to ${out.sent.invited.toLocaleString("en-IN")} ${out.sent.invited === 1 ? "person" : "people"}. Each gets their own link.`, tone: "success", link: { href: `${PATH}/${out.survey.id}`, label: "See answers" } }
      : { message: "Survey saved as a draft.", tone: "success", link: { href: `${PATH}/${out.survey.id}`, label: "Open it" } });
    return { ok: true, id: out.survey.id };
  } catch (e) {
    return { ok: false, message: refusal(e) };
  }
}

/** How many people a group reaches (for the Send button's words). */
export async function audienceCountAction(value: string): Promise<number | null> {
  try {
    const a = await access();
    return await withSchool(a.current.ctx, (tx) => audienceCount(tx, a.current.ctx, value));
  } catch {
    return null;
  }
}

async function one(id: string, action: "create" | "edit" | "archive", fn: (a: Awaited<ReturnType<typeof access>>) => Promise<string>): Promise<string | void> {
  if (!uuid.test(id)) return "This survey was not found.";
  try {
    const a = await access(action);
    const message = await fn(a);
    await flash({ message, tone: "success" });
  } catch (e) {
    return refusal(e);
  }
  revalidatePath(PATH);
}

export async function sendSurveyAction(id: string) {
  return one(id, "create", async (a) => {
    const r = await withSchool(a.current.ctx, (tx) => sendSurvey(tx, a.current.ctx, id, a.current.school.timeZone));
    return `Survey sent to ${r.invited.toLocaleString("en-IN")} ${r.invited === 1 ? "person" : "people"}.`;
  });
}

export async function remindSurveyAction(id: string) {
  return one(id, "create", async (a) => {
    const n = await withSchool(a.current.ctx, (tx) => remindSurvey(tx, a.current.ctx, id, a.current.school.timeZone));
    return `Reminder sent to ${n.toLocaleString("en-IN")} who have not answered.`;
  });
}

export async function closeSurveyAction(id: string) {
  return one(id, "edit", async (a) => {
    await withSchool(a.current.ctx, (tx) => closeSurvey(tx, a.current.ctx, id));
    return "Survey closed. No more answers are taken.";
  });
}

export async function archiveSurveyAction(id: string) {
  return one(id, "archive", async (a) => {
    await withSchool(a.current.ctx, (tx) => archiveSurvey(tx, a.current.ctx, id));
    return "Survey archived.";
  });
}
