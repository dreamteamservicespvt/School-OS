// Translation of typed messages into each parent's language (gap list G40;
// 11-communication.md, Send Message, Translation). The AI service is a
// stand-in here: nothing leaves the machine.
// - One request per language the chosen parents really need, with only the
//   typed words: never a parent's name or phone number.
// - Blanks such as {student_name} survive; a translation that loses or
//   changes one is refused, by the AI check and again at sending.
// - The sender's edited version is what parents get, labelled "Translated
//   from English", and Message History keeps each version.
// - With AI or the switch off, everyone gets the text as typed.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    requireCurrent,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/lib/flash", () => ({ flash: async () => undefined }));

import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { useAiProvider as setAiProvider, type AiProvider, type AiRequest } from "@/lib/ai";
import { saveAssistant, setFeature } from "@/lib/settings/switches";
import { planMessage, recordSend, type SendInput } from "@/lib/messaging/send";
import { readTranslations, translatedLabel, translationKey, translationProblem, TR_FIELDS } from "@/lib/messaging/translation";
import { checkOrSend, translateForParents } from "@/app/(school)/communication/actions";
import { addDlt, makeCommSchool } from "./fixture";

type School = Awaited<ReturnType<typeof makeCommSchool>>;
let s: School;
let hindiFather: { id: string; name: string; phone: string };
let teluguFather: { id: string; name: string; phone: string };

const USAGE = { inputTokens: 300, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 };
const TE = "ప్రియమైన తల్లిదండ్రులారా, {student_name} రేపు పాఠశాల 12 గంటలకు మూసివేయబడుతుంది.";
const HI = "प्रिय अभिभावक, {student_name} के लिए कल स्कूल 12 बजे बंद होगा।";
const TEXT = "Dear parent, school closes at 12 tomorrow for {student_name}.";

/** A stand-in AI service that translates by the language asked, and keeps every request. */
function fake(answer: (into: string) => { text: string; title: string } = (into) => ({ text: into === "Telugu" ? TE : HI, title: "" })) {
  const sent: AiRequest[] = [];
  const provider: AiProvider = { name: "fake", ask: async (req) => { sent.push(req); return { outcome: "ok", data: answer(JSON.parse(req.text).into), usage: USAGE, model: "claude-opus-5-5" }; } };
  setAiProvider(provider);
  return sent;
}

const currentFor = async (userId: string): Promise<Current> => {
  const access = await accessIn(userId, s.school.id);
  return { ...access!, ctx: { schoolId: s.school.id, userId }, user: { id: userId, displayName: "Principal Person" }, menu: [], schools: [], session: null } as unknown as Current;
};

/** The Send Message form for the parents of Class 5 by WhatsApp, with a typed message. */
function form(extra: Record<string, string> = {}, text = TEXT) {
  const fd = new FormData();
  fd.append("kinds", "parents");
  fd.append("classIds", s.cls.id);
  fd.append("channels", "whatsapp");
  fd.set("text", text);
  fd.set("when", "now");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

async function aiOn(on = true) {
  await withSchool(s.ctx, async (tx) => {
    await saveAssistant(tx, s.ctx, { on, roles: ["principal"] });
    if (on) await setFeature(tx, s.ctx, "ai-translation", true);
  });
}

beforeAll(async () => {
  s = await makeCommSchool();
  // A Hindi father and a second Telugu parent in Class 5: two languages, three parents.
  ({ hindiFather, teluguFather } = await withSchool(s.ctx, async (tx) => {
    const add = async (name: string, language: string, phone: string) => {
      const g = await tx.guardian.create({ data: { schoolId: s.school.id, name, relationship: "Father", phone, language } });
      const st = await tx.student.create({ data: { schoolId: s.school.id, campusId: s.school.campus.id, admissionNo: `TR${phone.slice(-5)}`, firstName: name.split(" ")[0], fullName: `${name.split(" ")[0]} Junior` } });
      await tx.enrolment.create({ data: { schoolId: s.school.id, studentId: st.id, academicYearId: s.year.id, classId: s.cls.id, sectionId: s.a.id } });
      await tx.studentGuardian.create({ data: { schoolId: s.school.id, studentId: st.id, guardianId: g.id, relationship: "Father", isPrimary: true } });
      return g;
    };
    return { hindiFather: await add("Ramesh Sharma", "hi", "9123400011"), teluguFather: await add("Venkat Rao", "te", "9123400022") };
  }));
  who.current = await currentFor(s.principal.id);
}, 120_000);

afterEach(() => setAiProvider(null));

describe("the blanks of a translation", () => {
  it("accept a translation that keeps every blank, and refuse one that loses, changes or adds one", () => {
    expect(translationProblem({ text: TEXT }, { text: TE }, "te")).toBeNull();
    expect(translationProblem({ text: TEXT }, { text: "ప్రియమైన తల్లిదండ్రులారా, రేపు పాఠశాల మూసివేయబడుతుంది." }, "te")).toMatch(/Telugu version lost \{student_name\}/);
    expect(translationProblem({ text: TEXT }, { text: "प्रिय अभिभावक, {छात्र_नाम} के लिए कल स्कूल बंद होगा।" }, "hi")).toMatch(/Hindi version lost \{student_name\}/);
    expect(translationProblem({ text: TEXT }, { text: `${HI} {date}` }, "hi")).toMatch(/\{date\} that the English does not/);
    expect(translationProblem({ text: "Hi", title: "Holiday" }, { text: "नमस्ते", title: "" }, "hi")).toMatch(/no title/);
  });

  it("are checked again when the form is sent, and a change to the English after translating is refused", () => {
    const key = translationKey(TEXT, null);
    const ok = new FormData();
    ok.set(TR_FIELDS.on, "on"); ok.set(TR_FIELDS.from, key); ok.set(TR_FIELDS.text("te"), TE);
    expect(readTranslations(ok, { text: TEXT, title: null })).toEqual({ ok: true, translations: { te: { text: TE, title: null, edited: false } } });
    ok.set(TR_FIELDS.text("hi"), "प्रिय अभिभावक");
    expect(readTranslations(ok, { text: TEXT, title: null })).toMatchObject({ ok: false, problem: expect.stringMatching(/Hindi version lost/) });
    const stale = new FormData();
    stale.set(TR_FIELDS.on, "on"); stale.set(TR_FIELDS.from, key); stale.set(TR_FIELDS.text("te"), TE);
    expect(readTranslations(stale, { text: `${TEXT} Bring umbrellas.`, title: null })).toMatchObject({ ok: false, problem: expect.stringMatching(/changed after it was translated/) });
  });
});

describe("Translate for parents", () => {
  it("is refused while the AI assistant or the translation switch is off, and asks the AI service nothing", async () => {
    await aiOn(false);
    const sent = fake();
    const r = await translateForParents(form());
    expect(r.ok).toBe(false);
    expect(r.message).toBe("The AI assistant is off for this school.");
    expect(sent).toHaveLength(0);
  });

  it("asks once per language the parents need, with only the typed words, and logs each request", async () => {
    await aiOn(true);
    who.current = await currentFor(s.principal.id);
    const before = await withSchool(s.ctx, (tx) => tx.aiCall.count({ where: { feature: "ai-translation" } }));
    const sent = fake();
    const r = await translateForParents(form());
    expect(r.ok).toBe(true);
    // Telugu (two parents) and Hindi (one): two requests, not three.
    expect(sent.map((q) => JSON.parse(q.text).into).sort()).toEqual(["Hindi", "Telugu"]);
    expect(r.versions!.map((v) => [v.language, v.messages, v.text]).sort()).toEqual([["hi", 1, HI], ["te", 2, TE]]);
    expect(r.from).toBe(translationKey(TEXT, null));
    // No parent's name or phone number, and nothing but the words, the title and the language.
    const all = JSON.stringify(sent);
    for (const g of [hindiFather, teluguFather, s.teluguMother, s.father]) {
      expect(all).not.toContain(g.name);
      expect(all).not.toContain(g.phone);
    }
    expect(Object.keys(JSON.parse(sent[0].text)).sort()).toEqual(["into", "text", "title"]);
    const after = await withSchool(s.ctx, (tx) => tx.aiCall.findMany({ where: { feature: "ai-translation" }, orderBy: { createdAt: "asc" } }));
    expect(after.length - before).toBe(2);
    expect(after.slice(-2).every((c) => c.sent && c.outcome === "ok" && c.userLoginId === s.principal.id)).toBe(true);
  });

  it("refuses an AI translation that drops or changes a blank, and never offers it", async () => {
    fake((into) => (into === "Telugu" ? { text: "ప్రియమైన తల్లిదండ్రులారా, రేపు పాఠశాల మూసివేయబడుతుంది.", title: "" } : { text: HI, title: "" }));
    const r = await translateForParents(form());
    const te = r.versions!.find((v) => v.language === "te")!;
    expect(te.text).toBe("");
    expect(te.problem).toMatch(/changed a blank in the Telugu version/);
    expect(r.versions!.find((v) => v.language === "hi")!.text).toBe(HI);
  });
});

describe("sending the confirmed translations", () => {
  it("gives each parent their language's version with the blanks filled and the label, and English to the rest", async () => {
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { kinds: ["parents"], classIds: [s.cls.id] }, channels: ["whatsapp"], text: TEXT, translations: { te: { text: TE, title: null }, hi: { text: HI, title: null } } }));
    expect(plan.problems).toEqual([]);
    const row = (id: string) => plan.rows.find((r) => r.candidate.id === id)!;
    expect(row(s.teluguMother.id).text).toBe(`${TE.replace("{student_name}", "Priya Reddy")}\n\n${translatedLabel("te")}`);
    expect(row(s.teluguMother.id).text).toContain("Translated from English");
    expect(row(hindiFather.id).text).toContain("Ramesh Junior");
    expect(row(hindiFather.id).language).toBe("hi");
    expect(row(s.father.id).text).toBe("Dear parent, school closes at 12 tomorrow for Ravi Kumar and Sita Kumar.");
    expect(plan.languages!.sort((a, b) => a.language.localeCompare(b.language))).toEqual([{ language: "hi", messages: 1, translated: 1 }, { language: "te", messages: 2, translated: 2 }]);
  });

  it("refuses to send a version whose blank was lost, even if the form says it was confirmed", async () => {
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { kinds: ["parents"], classIds: [s.cls.id] }, channels: ["whatsapp"], text: TEXT, translations: { te: { text: "రేపు పాఠశాల మూసివేయబడుతుంది.", title: null } } }));
    expect(plan.problems[0]).toMatch(/Telugu version lost \{student_name\}/);
  });

  it("never translates an SMS: it goes as typed, inside the school's own SMS template", async () => {
    await addDlt(s.ctx, "general");
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardianIds: [s.teluguMother.id] }, channels: ["sms"], text: TEXT, translations: { te: { text: TE, title: null } } }));
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].channel).toBe("sms");
    expect(plan.rows[0].translated).toBeUndefined();
    expect(plan.rows[0].text).not.toContain("ప్రియమైన");
    expect(plan.rows[0].text).not.toContain("Translated from English");
    expect(plan.languages).toEqual([]);
  });

  it("sends the sender's edited version, keeps every version for Message History and marks the send as prepared by AI", async () => {
    const edited = `${TE} గొడుగులు తీసుకురండి.`;
    const sent = await withSchool(s.ctx, async (tx) => {
      const input: SendInput = { to: { kinds: ["parents"], classIds: [s.cls.id] }, channels: ["whatsapp"], text: TEXT, translations: { te: { text: edited, title: null, edited: true }, hi: { text: HI, title: null } } };
      return recordSend(tx, s.ctx, input, await planMessage(tx, s.ctx, input));
    });
    const m = await withSchool(s.ctx, (tx) => tx.message.findUniqueOrThrow({ where: { id: sent.messageId }, include: { recipients: true } }));
    expect(m.translations).toEqual([{ language: "te", text: edited, title: null, edited: true }, { language: "hi", text: HI, title: null, edited: false }]);
    expect(m.body).toBe(TEXT);
    const padma = m.recipients.find((r) => r.guardianId === s.teluguMother.id)!;
    expect(padma.text).toContain("గొడుగులు తీసుకురండి.");
    expect(padma.text).toContain("Translated from English");
    expect(padma.language).toBe("te");
    expect(m.recipients.find((r) => r.guardianId === s.father.id)!.text).not.toContain("Translated");
    const audit = await withSchool(s.ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "Message", recordId: m.id } }));
    expect(audit.actorNote).toBe("prepared by AI, confirmed by Principal Person");
    expect(audit.after).toMatchObject({ translatedInto: ["te", "hi"] });
  });

  it("with the translation switch off, a form carrying translations still sends everyone the typed text", async () => {
    fake();
    await withSchool(s.ctx, (tx) => setFeature(tx, s.ctx, "ai-translation", false));
    who.current = await currentFor(s.principal.id);
    const fd = form({ [TR_FIELDS.on]: "on", [TR_FIELDS.from]: translationKey(TEXT, null), [TR_FIELDS.text("te")]: TE, intent: "check" });
    const r = await checkOrSend(null, fd);
    expect(r?.ok).toBe(true);
    const padma = r!.preview!.samples.find((x) => x.name === s.teluguMother.name)!;
    expect(padma.text).toBe("Dear parent, school closes at 12 tomorrow for Priya Reddy.");
    expect(padma.translated).toBeUndefined();
    // Switched on again, the same form uses the Telugu version.
    await withSchool(s.ctx, (tx) => setFeature(tx, s.ctx, "ai-translation", true));
    who.current = await currentFor(s.principal.id);
    const on = await checkOrSend(null, form({ [TR_FIELDS.on]: "on", [TR_FIELDS.from]: translationKey(TEXT, null), [TR_FIELDS.text("te")]: TE, intent: "check" }));
    expect(on!.preview!.samples.find((x) => x.name === s.teluguMother.name)!.translated).toBe("Telugu");
  });
});
