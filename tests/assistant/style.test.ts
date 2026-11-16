// The assistant talks the way the person talks (owner, 16 Nov 2026; layman test
// docs/qa/assistant-language-test.md): everyday Telugu with English school words
// for people who talk like that, plain Telugu for people who write only Telugu,
// a friendly line for greetings, the lists Ask has no question for, and a voice
// that says dates and amounts like a person, in a tone that fits the reply.
// No database here.
import { describe, expect, it } from "vitest";
import { teluguStyle, detectLanguage } from "@/lib/assistant/language";
import { TE_MIX } from "@/lib/assistant/te-mix";
import { wordsIntent } from "@/lib/assistant/rules";
import { spokenText, toneFor } from "@/lib/assistant/speech";
import { WORD_KEYS, words } from "@/lib/assistant/words";

const blanks = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("how a Telugu speaker talks", () => {
  it.each([
    ["ఈరోజు absent ఎవరు?", "mixed"],
    ["ఈరోజు ఆబ్సెంట్ స్టూడెంట్స్ ఎవరు?", "mixed"],
    ["fees ఇంకా కట్టని వాళ్ళు ఎవరు?", "mixed"],
    ["ee roju absent evaru?", "mixed"],
    ["ఈ రోజు గైర్హాజరు ఎవరు?", "pure"],
    ["ఫీజు బాకీ ఉన్నవాళ్ళు ఎవరు?", "pure"],
  ] as const)("“%s” is %s", (text, style) => {
    expect(teluguStyle(text)).toBe(style);
  });

  it("Telugu typed in English letters is Telugu", () => {
    expect(detectLanguage("5th class lo fee pending unna students").lang).toBe("te");
    expect(detectLanguage("ivvala entha mandi students raledu").lang).toBe("te");
  });
});

describe("the everyday Telugu sentences", () => {
  it("each one keeps exactly the blanks of its English sentence and is Telugu", () => {
    for (const [en, te] of Object.entries(TE_MIX)) {
      expect(blanks(te), en).toEqual(blanks(en));
      expect(te.trim(), en).not.toBe("");
      if (en.split(" ").length > 2) expect(te, en).toMatch(/[ఀ-౿]/);
    }
  });

  it("keep the English school words people say", () => {
    expect(TE_MIX["Attendance for {date} has not been taken yet, so nobody can be counted absent."]).toContain("attendance");
    expect(TE_MIX["{n} students have {total} overdue. Fees not yet due are not counted."]).toContain("fees pending");
  });

  it("the assistant's own words have every language and the same blanks", () => {
    for (const k of WORD_KEYS) {
      const en = words("en", k), te = words("te", k), hi = words("hi", k);
      expect(te, k).not.toBe("");
      expect(hi, k).not.toBe("");
      expect(blanks(te), k).toEqual(blanks(en));
    }
  });
});

describe("what the assistant understands without the AI service", () => {
  it.each([
    ["hi", { kind: "talk", talk: "hello" }],
    ["నమస్తే sir", { kind: "talk", talk: "hello" }],
    ["good morning", { kind: "talk", talk: "hello" }],
    ["thank you", { kind: "talk", talk: "thanks" }],
    ["థాంక్యూ", { kind: "talk", talk: "thanks" }],
    ["6th class homework ఏమిచ్చారు ఈరోజు?", { kind: "tool", tool: "homework_not_submitted", cls: "6" }],
    ["pending homework this week", { kind: "tool", tool: "homework_not_submitted", days: 7 }],
    ["ఈ వారం holidays ఏమైనా ఉన్నాయా?", { kind: "tool", tool: "upcoming_calendar", days: 7 }],
    ["what are the holidays this month", { kind: "tool", tool: "upcoming_calendar", days: 30 }],
    ["pending approvals", { kind: "tool", tool: "approvals_waiting" }],
    ["నా approvals ఏమైనా pending ఉన్నాయా?", { kind: "tool", tool: "approvals_waiting" }],
    ["add an enquiry for Ravi, class 3", { kind: "enquiry" }],
    ["కొత్త ఎంక్వైరీ add చెయ్యి", { kind: "enquiry" }],
  ] as const)("“%s”", (text, want) => {
    expect(wordsIntent(text)).toMatchObject(want);
  });

  it("a greeting with a question in it is a question, not small talk", () => {
    expect(wordsIntent("hi, who is absent today and fees pending")).toBeNull();
    expect(wordsIntent("Ravi Kumar")).toBeNull();
  });
});

describe("how a reply is said aloud", () => {
  const today = new Date(2026, 10, 16);
  it("says today's and yesterday's dates as words, other dates as day and month", () => {
    expect(spokenText("Nobody is marked absent on 16-11-2026.", "en", today)).toBe("Nobody is marked absent today.");
    expect(spokenText("16-11-2026 న ఎవరూ absent లేరు.", "te", today)).toBe("ఈరోజు ఎవరూ absent లేరు.");
    expect(spokenText("Nobody came late on 15-11-2026.", "en", today)).toBe("Nobody came late yesterday.");
    expect(spokenText("Exam on 02-12-2026.", "en", today)).toBe("Exam on 2 December.");
    expect(spokenText("Exam on 02-12-2026.", "te", today)).toBe("Exam on 2 డిసెంబర్.");
  });

  it("does not read a date range in brackets, and says ₹ as rupees", () => {
    expect(spokenText("₹1,55,202 was collected this month (01-11-2026 to 16-11-2026), in 12 payments.", "en", today))
      .toBe("1,55,202 rupees was collected this month, in 12 payments.");
    expect(spokenText("ఈ నెల (01-11-2026 నుంచి 16-11-2026 వరకు) ₹102 fee collect అయ్యింది", "te", today)).toBe("ఈ నెల 102 రూపాయలు fee collect అయ్యింది");
  });

  it("sounds glad for good news and gentle for sorry", () => {
    expect(toneFor("happy", "en").pitch).toBeGreaterThan(toneFor("answer", "en").pitch);
    expect(toneFor("sorry", "en").pitch).toBeLessThan(toneFor("answer", "en").pitch);
    expect(toneFor("sorry", "en").rate).toBeLessThan(toneFor("answer", "en").rate);
    expect(toneFor("answer", "te").rate).toBeLessThan(toneFor("answer", "en").rate);
  });
});
