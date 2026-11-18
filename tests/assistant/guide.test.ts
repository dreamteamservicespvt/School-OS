// The Assistant's built-in how-to guide (owner, 17 Nov 2026: "Explain me about the software how to use
// it in Telugu" got only a stock greeting, and "How do I take attendance?" a vague AI line). The guide
// needs no AI service: it is found by the words, it follows the person's role and the school's switched-on
// modules, its steps name the real screen labels (taken from the same catalogue the screens use), and it
// talks English, everyday Telugu with English school words, or everyday Hindi. No database here.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EN } from "@/lib/i18n/catalogues/en";
import { combineRoles } from "@/lib/permissions";
import { READY_ROLES } from "@/lib/roles";
import type { ModuleKey } from "@/lib/modules";
import { GUIDE_LABELS, GUIDE_MAX, GUIDE_PAGES, GUIDE_TASKS, guideIntent, guideReply, howToChip, taskAllowed, type GuideWho } from "@/lib/assistant/guide";
import { ASSISTANT_LANGS } from "@/lib/assistant/language";

const ROOT = path.resolve(import.meta.dirname, "../..");
const english = new Set<string>(EN);

function who(...keys: string[]): GuideWho {
  const roles = keys.map((k) => READY_ROLES.find((r) => r.key === k)!);
  return {
    permissions: combineRoles(roles.map((r) => r.permissions)),
    roles: roles.map((r) => ({ key: r.key, name: r.name })),
    modulesOn: new Set<ModuleKey>(), features: new Set<string>(), user: { id: "u-1", displayName: "Test Person" },
  } as unknown as GuideWho;
}
const principal = who("principal");
const classTeacher = who("class-teacher");
const accountant = who("accountant");
const receptionist = who("receptionist");
const OWNER = "Explain me about the software how to use it in Telugu";
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const TELUGU = /[ఀ-౿]/;
const DEVANAGARI = /[ऀ-ॿ]/;

describe("which words ask for the guide", () => {
  it.each([
    OWNER, "Explain the software", "How do I use this app?", "how to use school os", "What can I do here?", "How does this work?", "guide me",
    "help me use this", "tell me about this software",
    "software gurinchi telugu lo cheppandi", "ఈ సాఫ్ట్‌వేర్ ఎలా వాడాలి?", "ఈ app ఎలా use చేయాలి?", "School OS గురించి చెప్పండి",
    "software ke baare mein batao", "इस सॉफ़्टवेयर को कैसे इस्तेमाल करें?", "school os kaise use karein",
  ])("“%s” is the software in short", (text) => {
    expect(guideIntent(text)).toEqual({ kind: "overview" });
  });

  it.each([
    ["How do I take attendance?", "take-attendance"], ["how can i mark attendance for my class", "take-attendance"], ["attendance ela teesukovali", "take-attendance"],
    ["హాజరు ఎలా తీసుకోవాలి?", "take-attendance"], ["attendance कैसे लगाएं?", "take-attendance"], ["How do I take attendance in this app?", "take-attendance"],
    ["How do I collect a fee?", "collect-fee"], ["fees kaise jama karein", "collect-fee"], ["ఫీజు ఎలా వసూలు చేయాలి?", "collect-fee"],
    ["How do I see who owes fees?", "fees-owed"], ["how to see the defaulters", "fees-owed"], ["fees baaki wale kaise dekhein", "fees-owed"],
    ["How do I send a notice to parents?", "send-notice"], ["how to send a whatsapp message to parents", "send-notice"], ["parents ki message ela pampali", "send-notice"],
    ["How do I enter marks?", "enter-marks"], ["marks ela enter cheyali", "enter-marks"], ["मार्क्स कैसे भरें?", "enter-marks"],
    ["How do I make report cards?", "report-cards"], ["report cards ఎలా తయారు చేయాలి?", "report-cards"],
    ["How do I add a student?", "add-student"], ["how to add a new student", "add-student"], ["नया student कैसे जोड़ें?", "add-student"],
    ["How do I add an enquiry?", "add-enquiry"], ["how to add an admission enquiry", "add-enquiry"], ["ఎంక్వైరీ ఎలా add చేయాలి?", "add-enquiry"],
    ["How do I apply for leave?", "apply-leave"], ["leave ela apply cheyali", "apply-leave"], ["छुट्टी के लिए कैसे apply करें?", "apply-leave"],
    ["How do I approve requests?", "approve"], ["how to approve leave", "approve"], ["अप्रूवल कैसे दें?", "approve"],
  ] as const)("“%s” is how to %s", (text, task) => {
    expect(guideIntent(text)).toEqual({ kind: "task", task });
  });

  it.each([
    "explain the fee structure of Class 5", "how many absent today",
    "Aarav Sharma హాజరు ఎలా ఉంది?", "Aarav attendance ela undi?", "How is Aarav's attendance?", "Aarav की हाज़िरी कैसी है?", "Who is absent today?", "who has fees overdue?", "ee roju absent evaru?",
    "fees entha vachindi", "aaj kaun absent hai", "కిందటి వారం ఎంత fee వచ్చింది?", "how much fee was collected today", "show me the defaulters of class 5",
    "hi", "thank you", "explain why attendance is low in 5 A", "Which staff are on leave today?", "how many students failed in maths",
    "నిన్న absent ఎవరు?", "किसकी fees बाकी है?",
  ])("“%s” is a question about the school's records, never the guide", (text) => {
    expect(guideIntent(text)).toBeNull();
  });

  it("every “how do I …?” suggestion is understood again as the same task, in every language", () => {
    for (const task of GUIDE_TASKS) for (const lang of ASSISTANT_LANGS) {
      expect(guideIntent(howToChip(task, lang)), `${lang}: ${howToChip(task, lang)}`).toEqual({ kind: "task", task });
    }
  });
});

describe("the software in short, for the person's role", () => {
  it("the owner's sentence, in Telugu: an intro, at least 4 module lines with links, and an invitation; every line Telugu", () => {
    const g = guideReply(principal, { kind: "overview" }, "te");
    const ls = lines(g.reply);
    expect(ls.length).toBeGreaterThanOrEqual(6);
    expect(ls.length).toBeLessThanOrEqual(10);
    for (const l of ls) expect(l, l).toMatch(TELUGU);
    // One line per module, each with its own link, at most 8.
    expect(g.sources.length).toBeGreaterThanOrEqual(4);
    expect(g.sources.length).toBeLessThanOrEqual(8);
    expect(g.sources.every((s) => s.href.startsWith("/"))).toBe(true);
    expect(g.reply).toContain("Attendance:");
    // The invitation names a task the person may do, and that sentence is understood again.
    expect(ls.at(-1)).toMatch(/ఎలా/);
    expect(g.chips.length).toBeGreaterThan(0);
    for (const c of g.chips) expect(guideIntent(c)?.kind).toBe("task");
  });

  it("a class teacher never sees Salary or Finance; Attendance comes first", () => {
    const g = guideReply(classTeacher, { kind: "overview" }, "en");
    expect(g.reply).not.toMatch(/Salary|Finance/);
    expect(g.sources.map((s) => s.href)).not.toContain("/salary-management");
    expect(lines(g.reply)[1]).toMatch(/^Attendance:/);
  });

  it("the Accountant starts with Fees; the receptionist with Front Office and never Fees", () => {
    expect(lines(guideReply(accountant, { kind: "overview" }, "en").reply)[1]).toMatch(/^Fees:/);
    const r = guideReply(receptionist, { kind: "overview" }, "en");
    expect(lines(r.reply)[1]).toMatch(/^Front Office:/);
    expect(r.reply).not.toMatch(/^Fees:/m);
  });

  it("an optional module the school has not switched on is not offered", () => {
    expect(guideReply(principal, { kind: "overview" }, "en").reply).not.toMatch(/^Transport:/m);
  });

  it("Hindi lines are Hindi", () => {
    for (const l of lines(guideReply(principal, { kind: "overview" }, "hi").reply)) expect(l, l).toMatch(DEVANAGARI);
  });
});

describe("the steps of one task", () => {
  it("“How do I take attendance?” for a class teacher: numbered steps with the real screen words, and the link", () => {
    const g = guideReply(classTeacher, { kind: "task", task: "take-attendance" }, "en");
    expect(g.may).toBe(true);
    const steps = lines(g.reply).filter((l) => /^\d\. /.test(l));
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.length).toBeLessThanOrEqual(5);
    expect(g.reply).toContain("Take Attendance");
    expect(g.reply).toContain("Save attendance");
    expect(g.reply).toContain("All present");
    expect(g.sources.map((s) => s.href)).toEqual(["/attendance-management"]);
  });

  it("in everyday Telugu: Telugu sentences with the English school words, screen names as on the screen", () => {
    const g = guideReply(classTeacher, { kind: "task", task: "take-attendance" }, "te");
    for (const l of lines(g.reply)) expect(l, l).toMatch(TELUGU);
    expect(g.reply).toContain("Take Attendance");
    expect(g.reply).toMatch(/class|students|absent/);
    // A person whose screens are in Telugu reads the Telugu screen words.
    const onTelugu = guideReply(classTeacher, { kind: "task", task: "take-attendance" }, "te", "te");
    expect(onTelugu.reply).toContain("హాజరు తీసుకోండి");
    expect(onTelugu.reply).not.toContain("Take Attendance");
  });

  it("a role that may not do it is told who can, in one line, with no steps", () => {
    const g = guideReply(principal, { kind: "task", task: "take-attendance" }, "en");
    expect(g.may).toBe(false);
    expect(lines(g.reply)).toHaveLength(1);
    expect(g.reply).toMatch(/Class teachers/);
    expect(g.reply).not.toMatch(/^\d\. /m);
    expect(guideReply(receptionist, { kind: "task", task: "collect-fee" }, "te").reply).toMatch(/Accountant/);
    expect(taskAllowed(classTeacher, "collect-fee")).toBe(false);
    expect(taskAllowed(accountant, "collect-fee")).toBe(true);
    expect(taskAllowed(receptionist, "add-enquiry")).toBe(true);
    expect(taskAllowed(classTeacher, "enter-marks")).toBe(true);
    expect(taskAllowed(principal, "approve")).toBe(true);
  });

  it("every reply fits what the voice may read and what a turn keeps, for every role, task and language", () => {
    for (const role of READY_ROLES) for (const lang of ASSISTANT_LANGS) {
      for (const intent of [{ kind: "overview" as const }, ...GUIDE_TASKS.map((task) => ({ kind: "task" as const, task }))]) {
        const g = guideReply(who(role.key), intent, lang);
        expect(g.reply.length, `${role.key} ${lang} ${JSON.stringify(intent)}`).toBeLessThanOrEqual(GUIDE_MAX);
        if (intent.kind === "task" && g.may) {
          const n = lines(g.reply).filter((l) => /^\d\. /.test(l)).length;
          expect(n, `${role.key} ${intent.task}`).toBeGreaterThanOrEqual(3);
          expect(n, `${role.key} ${intent.task}`).toBeLessThanOrEqual(5);
        }
        if (lang !== "en") for (const l of lines(g.reply)) expect(l, `${role.key} ${lang}: ${l}`).toMatch(lang === "te" ? TELUGU : DEVANAGARI);
      }
    }
  });
});

describe("the screen words cannot drift", () => {
  it("every label the steps name is a screen word in the catalogue and is still on its screen", () => {
    expect(GUIDE_LABELS.length).toBeGreaterThan(20);
    for (const l of GUIDE_LABELS) {
      expect(english.has(l.text), `"${l.text}" is not in the English catalogue`).toBe(true);
      const file = path.join(ROOT, l.file);
      expect(existsSync(file), `${l.file} is gone`).toBe(true);
      expect(readFileSync(file, "utf8"), `${l.file} no longer shows "${l.match}"`).toContain(l.match);
    }
  });

  it("every page the guide links to exists", () => {
    for (const p of GUIDE_PAGES) {
      const route = p.split("?")[0];
      expect(existsSync(path.join(ROOT, "src/app/(school)", route, "page.tsx")), route).toBe(true);
    }
  });
});
