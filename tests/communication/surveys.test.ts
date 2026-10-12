// Surveys (11-communication.md; an optional page): each person gets their own link, only its
// hash is stored, each person answers once, anonymous answers keep no person, closed surveys take
// no answers, and only the office can make and send surveys.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let token: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "sos_session" && token ? { name, value: token } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { createSession } from "@/lib/auth/sessions";
import { withSchool } from "@/lib/db";
import { audienceOptions, closeSurvey, findInvite, saveSurvey, sendSurvey, submitAnswers, surveyResults, SurveyProblem, type SurveyInput } from "@/lib/communication/surveys";
import { hashToken, surveyTokenFor, withHiddenLinks, withRealLinks } from "@/lib/parent-link/token";
import { makeCommSchool } from "./fixture";

type School = Awaited<ReturnType<typeof makeCommSchool>>;
let s: School;
const TZ = "Asia/Kolkata";
const today = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

async function signIn(userId: string) {
  token = (await createSession(userId, s.school.id, { userAgent: "test" })).token;
}

const input = (over: Partial<SurveyInput> = {}): SurveyInput => ({
  title: "Parent satisfaction",
  audience: "parents",
  anonymous: true,
  closesOn: null,
  questions: [
    { kind: "rating", text: "How happy are you?", options: [], required: true },
    { kind: "choice", text: "How do you hear from us?", options: ["WhatsApp", "Phone call"], required: true },
    { kind: "text", text: "One thing to do better", options: [], required: false },
  ],
  ...over,
});

async function makeSent(over: Partial<SurveyInput> = {}) {
  return withSchool(s.ctx, async (tx) => {
    const labels = new Map((await audienceOptions(tx, s.ctx)).map((o) => [o.value, o.label]));
    const survey = await saveSurvey(tx, s.ctx, null, input(over), labels, today());
    const sent = await sendSurvey(tx, s.ctx, survey.id, TZ);
    const invites = await tx.surveyInvite.findMany({ where: { surveyId: survey.id } });
    const questions = await tx.surveyQuestion.findMany({ where: { surveyId: survey.id }, orderBy: { sortOrder: "asc" } });
    return { survey, sent, invites, questions };
  });
}

beforeAll(async () => {
  s = await makeCommSchool();
  await withSchool(s.ctx, (tx) => tx.schoolFeature.create({ data: { schoolId: s.school.id, featureKey: "surveys", isOn: true } }));
});
beforeEach(async () => {
  await signIn(s.principal.id);
});

describe("sending a survey", () => {
  it("invites each parent not opted out, stores only the link's hash, and keeps the link out of message texts", async () => {
    const { survey, sent, invites } = await makeSent();
    expect(sent.invited).toBe(invites.length);
    expect(invites.length).toBeGreaterThan(0);
    expect(invites.some((i) => i.personId === s.optFather.id)).toBe(false);
    for (const i of invites) expect(i.tokenHash).toBe(hashToken(surveyTokenFor(i.id)));
    const texts = await withSchool(s.ctx, (tx) => tx.messageRecipient.findMany({ where: { message: { sourceType: "Survey", sourceId: survey.id } }, select: { text: true } }));
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(t.text).not.toContain("/s/");
      expect(withHiddenLinks(t.text)).toContain("[personal survey link]");
      expect(withRealLinks(t.text)).toMatch(new RegExp(`/s/${s.school.id}/[A-Za-z0-9_-]{30,}`));
    }
  });

  it("refuses a survey with no question or a choice with one option", async () => {
    await withSchool(s.ctx, async (tx) => {
      const labels = new Map([["parents", "All parents"]]);
      await expect(saveSurvey(tx, s.ctx, null, input({ questions: [] }), labels, today())).rejects.toBeInstanceOf(SurveyProblem);
      await expect(saveSurvey(tx, s.ctx, null, input({ questions: [{ kind: "choice", text: "Pick one", options: ["Only"], required: true }] }), labels, today())).rejects.toThrow(/two choices/);
    });
  });
});

describe("answering", () => {
  it("takes one answer per person, and an anonymous answer keeps no person", async () => {
    const { survey, invites, questions } = await makeSent();
    const [rating, choice] = questions;
    const t = surveyTokenFor(invites[0].id);
    await withSchool({ schoolId: s.school.id, userId: null }, async (tx) => {
      const ctx = { schoolId: s.school.id, userId: null };
      await expect(submitAnswers(tx, ctx, t, { [rating.id]: "4" }, TZ)).rejects.toThrow(/Please answer/);
      await expect(submitAnswers(tx, ctx, t, { [rating.id]: "9", [choice.id]: "WhatsApp" }, TZ)).rejects.toThrow(/1 to 5/);
      await submitAnswers(tx, ctx, t, { [rating.id]: "4", [choice.id]: "WhatsApp" }, TZ);
      await expect(submitAnswers(tx, ctx, t, { [rating.id]: "5", [choice.id]: "WhatsApp" }, TZ)).rejects.toThrow(/already answered/);
      await expect(submitAnswers(tx, ctx, "x".repeat(43), { [rating.id]: "5" }, TZ)).rejects.toThrow(/does not work/);
    });
    await withSchool(s.ctx, async (tx) => {
      const responses = await tx.surveyResponse.findMany({ where: { surveyId: survey.id } });
      expect(responses).toHaveLength(1);
      expect(responses[0].personId).toBeNull();
      const r = await surveyResults(tx, s.ctx, survey.id);
      const q = r.results[0];
      expect(q.kind === "rating" && q.counts[3]).toBe(1);
    });
  });

  it("keeps the person on a named survey, and refuses answers after closing", async () => {
    const { survey, invites, questions } = await makeSent({ anonymous: false, title: "Sports day" });
    const ctx = { schoolId: s.school.id, userId: null };
    const ans = { [questions[0].id]: "5", [questions[1].id]: "Phone call" };
    await withSchool(ctx, (tx) => submitAnswers(tx, ctx, surveyTokenFor(invites[0].id), ans, TZ));
    await withSchool(s.ctx, (tx) => closeSurvey(tx, s.ctx, survey.id));
    await expect(withSchool(ctx, (tx) => submitAnswers(tx, ctx, surveyTokenFor(invites[1].id), ans, TZ))).rejects.toThrow(/closed/);
    const r = await withSchool(s.ctx, (tx) => tx.surveyResponse.findFirstOrThrow({ where: { surveyId: survey.id } }));
    expect(r.personId).toBe(invites[0].personId);
  });

  it("a link from one school does not open in another", async () => {
    const { invites } = await makeSent({ title: "Walls" });
    const other = await makeCommSchool();
    const ctx = { schoolId: other.school.id, userId: null };
    expect(await withSchool(ctx, (tx) => findInvite(tx, ctx, surveyTokenFor(invites[0].id)))).toBeNull();
  });
});

describe("a class teacher", () => {
  it("cannot open survey pages or make, send or close surveys", async () => {
    const { survey } = await makeSent({ title: "Teacher test" });
    await signIn(s.teacher.id);
    const Page = (await import("@/app/(school)/communication/surveys/page")).default;
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT \/no-access/);
    const a = await import("@/app/(school)/communication/surveys/actions");
    const r = await a.saveSurveyAction(null, input(), false);
    expect(r.ok).toBe(false);
    expect(await a.closeSurveyAction(survey.id)).toMatch(/Only the Principal and School Admin/);
    expect(await a.remindSurveyAction(survey.id)).toMatch(/Only the Principal and School Admin/);
    const still = await withSchool(s.ctx, (tx) => tx.survey.findUniqueOrThrow({ where: { id: survey.id } }));
    expect(still.status).toBe("OPEN");
  });
});
