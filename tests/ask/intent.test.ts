// Search by intent for Ask (gap list G27): what a person types in the Search
// box ("absent today", "fees due class 5", "brithday", "late staff") opens
// the right ready-made question with its class, dates and amount filled in.
// Indian school words and small typos are understood; names, receipt
// numbers and other searches are left to Search. No database here.
import { describe, expect, it } from "vitest";
import { askHref, classKey, closestQuestions, looksLikeQuestion, matchIntent, questionTitle, readClass, QUESTION_KEYS, type QuestionKey } from "@/lib/ask/questions";
import { linkTitleIn, questionTitleIn } from "@/lib/ask/titles";
import { translator } from "@/lib/i18n/t";
import { hi } from "@/lib/i18n/catalogues/hi";
import { te } from "@/lib/i18n/catalogues/te";

const top = (text: string, allowed: readonly QuestionKey[] = QUESTION_KEYS) => matchIntent(text, allowed)[0] ?? null;

describe("words to the right ready-made question", () => {
  it.each([
    ["absent today", "absent-today", {}],
    ["who is absent in class 5", "absent-today", { cls: "5" }],
    ["absnt 5a", "absent-today", { cls: "5 A" }],
    ["absentees yesterday class V-B", "absent-today", { cls: "5 B", when: "yesterday" }],
    ["aaj kaun absent hai", "absent-today", {}],
    ["students absent 3 days running", "absent-streak", {}],
    ["continuously absent kids std 7", "absent-streak", { cls: "7" }],
    ["attendence below 75%", "below-attendance", {}],
    ["low attendance class 8", "below-attendance", { cls: "8" }],
    ["which classes have not taken attendance", "not-marked", {}],
    ["late staff", "late-staff", {}],
    ["teachers late yesterday", "late-staff", { when: "yesterday" }],
    ["teachers absent today", "staff-absent", {}],
    ["staff on leave", "staff-on-leave", {}],
    ["fees due class 5", "fees-overdue", { cls: "5" }],
    ["pending fees UKG B", "fees-overdue", { cls: "UKG B" }],
    ["who owes more than 10k", "fees-overdue", { amount: 10000 }],
    ["defualters above ₹15,000", "fees-overdue", { amount: 15000 }],
    ["fees baki 1.5 lakh", "fees-overdue", { amount: 150000 }],
    ["how much fee collected this week", "fees-collected", { when: "thisweek" }],
    ["fee collection yesterday", "fees-collected", { when: "yesterday" }],
    ["collection last month class 10", "fees-collected", { when: "lastmonth", cls: "10" }],
    ["who failed in maths", "below-pass", {}],
    ["low marks class VII", "below-pass", { cls: "7" }],
    ["brithday", "birthdays", { when: "thisweek" }],
    ["birthdays today", "birthdays", { when: "today" }],
  ] as const)("“%s” → %s", (text, key, params) => {
    const m = top(text);
    expect(m?.key).toBe(key);
    for (const [k, v] of Object.entries(params)) expect(m?.params[k as keyof typeof m.params], k).toBe(v);
    expect(m?.href.startsWith(`/ask?q=${key}`)).toBe(true);
    expect(m?.href).toContain("via=words");
  });

  it("leaves names, numbers and other searches to Search", () => {
    for (const text of ["Ravi Kumar", "fee Ravi", "SS/2026/00123", "9876543210", "homework due today", "attendance 5A", "Fee Management", "5th October"]) {
      expect(matchIntent(text), text).toEqual([]);
    }
  });

  it("offers only the person's own questions", () => {
    expect(matchIntent("fees due class 5", ["absent-today", "below-pass"])).toEqual([]);
    expect(top("absent today", ["absent-today"])?.key).toBe("absent-today");
  });

  it("fills only what a question takes, and a time it understands", () => {
    // Absent lists are for one day: "this month" falls back to today.
    expect(top("absent this month")?.params).toEqual({ when: "today" });
    expect(top("absent this month")?.title).toBe("Who is absent today?");
    // A number that is not money is not an amount.
    expect(top("fees due class 5")?.params.amount).toBeUndefined();
    expect(top("below 75% attendance")?.params).toEqual({});
  });
});

describe("classes as people write them", () => {
  it("reads Indian class names", () => {
    expect(readClass("5")?.words).toBe("5");
    expect(readClass("5th")?.words).toBe("5");
    expect(readClass("Class V-B")?.words).toBe("5 B");
    expect(readClass("std 10 a")?.words).toBe("10 A");
    expect(readClass("L.K.G.")?.words).toBe("LKG");
    expect(readClass("ukg b")?.words).toBe("UKG B");
    expect(readClass("13")).toBeNull();
    expect(readClass("Ravi")).toBeNull();
    expect(classKey("Class 5")).toBe(classKey("V"));
    expect(classKey("Class 5")).toBe(classKey("5th"));
    expect(classKey("UKG")).toBe(classKey("U.K.G"));
  });

  it("puts the class and time in the question and its link", () => {
    expect(questionTitle("absent-today", { cls: "5 a", when: "yesterday" })).toBe("Who was absent yesterday in Class 5 A?");
    expect(questionTitle("fees-overdue", { amount: 10000 })).toBe("Who owes ₹10,000 or more?");
    expect(askHref("fees-overdue", { cls: "ukg", amount: 10000 })).toBe("/ask?q=fees-overdue&cls=UKG&amount=10000");
    // The default time is left out of the link.
    expect(askHref("fees-collected", { when: "thisweek" })).toBe("/ask?q=fees-collected");
  });
});

describe("a question that matches none", () => {
  it("looks like a question by its words", () => {
    expect(looksLikeQuestion("how are the children doing")).toBe(true);
    expect(looksLikeQuestion("kitne bacche aaye?")).toBe(true);
    expect(looksLikeQuestion("Ravi Kumar")).toBe(false);
  });

  it("offers the closest ready-made questions, else the person's own", () => {
    const allowed: QuestionKey[] = ["absent-today", "below-pass", "fees-overdue", "birthdays"];
    expect(closestQuestions("how are the children doing in the exams", allowed)[0]).toBe("below-pass");
    expect(closestQuestions("how is the money side", allowed)[0]).toBe("fees-overdue");
    expect(closestQuestions("anything new", allowed, ["birthdays", "absent-today"])).toEqual(["birthdays", "absent-today"]);
  });
});

// Gap list G39: words typed in Hindi or Telugu reach the same questions, and the titles show in
// the person's language (English titles stay exactly as before).
describe("Indian languages", () => {
  it.each([
    ["आज कौन अनुपस्थित है?", "absent-today", {}],
    ["कल कक्षा 5 में कौन गैरहाज़िर था", "absent-today", { cls: "5", when: "yesterday" }],
    ["किसकी फ़ीस बकाया है", "fees-overdue", {}],
    ["ఈ రోజు గైర్హాజరు ఎవరు", "absent-today", {}],
    ["తరగతి 7 ఫీజు బాకీ", "fees-overdue", { cls: "7" }],
    ["ఈ వారం పుట్టినరోజులు", "birthdays", { when: "thisweek" }],
    ["సిబ్బంది ఆలస్యం నిన్న", "late-staff", { when: "yesterday" }],
  ] as const)("%s", (text, key, params) => {
    const m = top(text);
    expect(m?.key).toBe(key);
    expect(m?.params).toMatchObject(params);
  });

  it("looks like a question by its first word", () => {
    expect(looksLikeQuestion("कौन आया")).toBe(true);
    expect(looksLikeQuestion("ఎవరు రాలేదు")).toBe(true);
  });

  it("titles in the person's language, English unchanged", () => {
    expect(questionTitleIn(translator("en", {}), "absent-today", { cls: "5 A" })).toBe(questionTitle("absent-today", { cls: "5 A" }));
    const hiT = translator("hi", hi);
    const teT = translator("te", te);
    expect(questionTitleIn(hiT, "absent-today", { cls: "5 A" })).toContain("5 A");
    expect(questionTitleIn(hiT, "absent-today", { cls: "5 A" })).not.toContain("Who");
    expect(questionTitleIn(teT, "fees-overdue", { amount: 10000 })).toContain("₹10,000");
    expect(linkTitleIn(teT, "/ask?q=birthdays&when=today", "Whose birthday is today?")).not.toBe("Whose birthday is today?");
  });
});
