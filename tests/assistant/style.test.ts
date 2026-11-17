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
import { schoolToday, spokenText, toneFor, writtenText } from "@/lib/assistant/speech";
import { WORD_KEYS, withoutEmptyList, words } from "@/lib/assistant/words";
import { matchIntent } from "@/lib/ask/questions";

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

  it("each everyday question chip is understood again when tapped, as the same question", () => {
    const chips: [string, string][] = [
      ["Who is absent today?", "absent-today"], ["Who was absent yesterday?", "absent-today"],
      ["Who has been absent several days in a row?", "absent-streak"], ["Who is below the attendance line?", "below-attendance"],
      ["Which classes have not taken attendance today?", "not-marked"], ["Which staff came late {when}?", "late-staff"],
      ["Which staff are absent {when}?", "staff-absent"], ["Which staff are on leave {when}?", "staff-on-leave"],
      ["How much fee was collected {when}?", "fees-collected"], ["Who has fees overdue?", "fees-overdue"],
      ["Who owes {amount} or more?", "fees-overdue"], ["Which classes have marks below the pass mark?", "below-pass"],
      ["Whose birthday is today?", "birthdays"], ["Whose birthday is coming up this week?", "birthdays"],
    ];
    for (const [en, key] of chips) {
      const said = TE_MIX[en].replace("{when}", "ఈరోజు").replace("{amount}", "₹10,000");
      expect(matchIntent(said)[0]?.key, said).toBe(key);
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

// Live test 17 Nov 2026 (Principal, Telugu, "ఈరోజు absent ఎవరు?"): the reply said
// "17-11-2026 attendance ఇంకా తీసుకోలేదు, ... చెప్పలేను: ." It should say "ఈరోజు" and end at the full stop.
describe("how a reply is written", () => {
  const today = new Date(2026, 10, 17);

  it("today's date is written as today, in each language", () => {
    expect(writtenText("Attendance for 17-11-2026 has not been taken yet, so nobody can be counted absent.", "en", today))
      .toBe("Attendance for today has not been taken yet, so nobody can be counted absent.");
    expect(writtenText("17-11-2026 attendance ఇంకా తీసుకోలేదు, అందుకే ఎవరు absent అనేది ఇప్పుడే చెప్పలేను.", "te", today))
      .toBe("ఈరోజు attendance ఇంకా తీసుకోలేదు, అందుకే ఎవరు absent అనేది ఇప్పుడే చెప్పలేను.");
    expect(writtenText("17-11-2026 की उपस्थिति अभी नहीं ली गई है, इसलिए किसी को अनुपस्थित नहीं गिना जा सकता।", "hi", today))
      .toBe("आज की उपस्थिति अभी नहीं ली गई है, इसलिए किसी को अनुपस्थित नहीं गिना जा सकता।");
  });

  it("the little word for 'on' goes with the date: 'on today', 'ఈరోజు న', 'आज को' are not said", () => {
    expect(writtenText("Nobody is marked absent on 17-11-2026.", "en", today)).toBe("Nobody is marked absent today.");
    expect(writtenText("3 students are absent on 17-11-2026: 2 in Class 5 A, 1 in Class 5 B.", "en", today)).toBe("3 students are absent today: 2 in Class 5 A, 1 in Class 5 B.");
    expect(writtenText("17-11-2026 న ఎవరూ absent లేరు.", "te", today)).toBe("ఈరోజు ఎవరూ absent లేరు.");
    expect(writtenText("16-11-2026న 3 మంది విద్యార్థులు గైర్హాజరయ్యారు", "te", today)).toBe("నిన్న 3 మంది విద్యార్థులు గైర్హాజరయ్యారు");
    expect(writtenText("17-11-2026 को कोई अनुपस्थित दर्ज नहीं है।", "hi", today)).toBe("आज कोई अनुपस्थित दर्ज नहीं है।");
    // A Telugu word that only starts with న stays: "నాటికి", "నుంచి".
    expect(writtenText("17-11-2026 నాటికి", "te", today)).toBe("ఈరోజు నాటికి");
    expect(writtenText("17-11-2026 నుంచి 24-11-2026 వరకు School Calendar లో ఏమీ లేదు.", "te", today)).toBe("ఈరోజు నుంచి 24-11-2026 వరకు School Calendar లో ఏమీ లేదు.");
  });

  it("yesterday's date is written as yesterday; every other date stays exactly as it is", () => {
    expect(writtenText("Nobody came late on 16-11-2026.", "en", today)).toBe("Nobody came late yesterday.");
    expect(writtenText("16-11-2026 को कोई देर से नहीं आया।", "hi", today)).toBe("कल कोई देर से नहीं आया।");
    expect(writtenText("Nobody came late on 15-11-2026.", "en", today)).toBe("Nobody came late on 15-11-2026.");
    expect(writtenText("Exam on 18-11-2026.", "en", today)).toBe("Exam on 18-11-2026.");
    expect(writtenText("17-11-2025 న ఎవరూ absent లేరు.", "te", today)).toBe("17-11-2025 న ఎవరూ absent లేరు.");
    // Across a new year.
    expect(writtenText("Nobody came late on 31-12-2026.", "en", new Date(2027, 0, 1))).toBe("Nobody came late yesterday.");
  });

  it("a date right after the day word does not repeat the word (live 17 Nov 2026: 'collected today, today')", () => {
    expect(writtenText("No fees were collected today, 17-11-2026. You can check the details in Fee Reports.", "en", today))
      .toBe("No fees were collected today. You can check the details in Fee Reports.");
    expect(writtenText("Today, 17-11-2026, nobody is absent.", "en", today)).toBe("Today, nobody is absent.");
    expect(writtenText("Nobody came late yesterday: 16-11-2026.", "en", today)).toBe("Nobody came late yesterday.");
    expect(writtenText("ఈరోజు, 17-11-2026 fee ఏమీ రాలేదు.", "te", today)).toBe("ఈరోజు fee ఏమీ రాలేదు.");
    expect(writtenText("ఈ రోజు 17-11-2026 fee ఏమీ రాలేదు.", "te", today)).toBe("ఈ రోజు fee ఏమీ రాలేదు.");
    expect(writtenText("आज, 17-11-2026 को कोई फ़ीस नहीं आई।", "hi", today)).toBe("आज कोई फ़ीस नहीं आई।");
    // Two different days stay two days, and a word that only starts like the day word is left alone.
    expect(writtenText("Late yesterday, 17-11-2026 nobody.", "en", today)).toBe("Late yesterday, today nobody.");
    expect(writtenText("Collected today: today's total is ₹500.", "en", today)).toBe("Collected today: today's total is ₹500.");
  });

  it("a date that repeats the day word in brackets is said once; a range in brackets keeps its dates", () => {
    expect(writtenText("₹500 was collected today (17-11-2026), in 1 payment.", "en", today)).toBe("₹500 was collected today, in 1 payment.");
    expect(writtenText("ఈరోజు (17-11-2026) ₹500 fee collect అయ్యింది, 1 payment లో.", "te", today)).toBe("ఈరోజు ₹500 fee collect అయ్యింది, 1 payment లో.");
    expect(writtenText("ఈ రోజు (17-11-2026) ₹500 వసూలైంది.", "te", today)).toBe("ఈ రోజు ₹500 వసూలైంది.");
    expect(writtenText("कल (16-11-2026) ₹500 जमा हुए।", "hi", today)).toBe("कल ₹500 जमा हुए।");
    expect(writtenText("₹1,55,202 was collected this month (01-11-2026 to 17-11-2026), in 12 payments.", "en", today))
      .toBe("₹1,55,202 was collected this month (01-11-2026 to 17-11-2026), in 12 payments.");
    expect(writtenText("1 on the School Calendar from 17-11-2026 to 24-11-2026: Sports Day (17-11-2026).", "en", today))
      .toBe("1 on the School Calendar from today to 24-11-2026: Sports Day (today).");
    expect(writtenText("17-11-2026: nobody is absent.", "en", today)).toBe("Today: nobody is absent.");
  });

  it("the school's today comes from the school's time zone, not the server's", () => {
    // 00:30 on 17 Nov in India is still 16 Nov in UTC.
    const now = new Date("2026-11-16T19:00:00Z");
    const ist = schoolToday("Asia/Kolkata", now);
    expect([ist.getFullYear(), ist.getMonth() + 1, ist.getDate()]).toEqual([2026, 11, 17]);
    const utc = schoolToday("UTC", now);
    expect([utc.getFullYear(), utc.getMonth() + 1, utc.getDate()]).toEqual([2026, 11, 16]);
    expect(writtenText("Nobody is marked absent on 17-11-2026.", "en", ist)).toBe("Nobody is marked absent today.");
    expect(writtenText("Nobody is marked absent on 17-11-2026.", "en", utc)).toBe("Nobody is marked absent on 17-11-2026.");
  });

  it("an empty list never leaves ':' or ': .' behind, in any language", () => {
    expect(withoutEmptyList("17-11-2026 attendance ఇంకా తీసుకోలేదు, అందుకే ఎవరు absent అనేది ఇప్పుడే చెప్పలేను: ."))
      .toBe("17-11-2026 attendance ఇంకా తీసుకోలేదు, అందుకే ఎవరు absent అనేది ఇప్పుడే చెప్పలేను.");
    expect(withoutEmptyList("Nobody is marked absent on 17-11-2026: . 2 classes have not taken attendance yet.")).toBe("Nobody is marked absent on 17-11-2026. 2 classes have not taken attendance yet.");
    expect(withoutEmptyList("आज कोई अनुपस्थित दर्ज नहीं है: ।")).toBe("आज कोई अनुपस्थित दर्ज नहीं है।");
    expect(withoutEmptyList("Still needed: ")).toBe("Still needed");
    // A colon with something after it stays.
    expect(withoutEmptyList("2 students are absent today: Aarav Sharma, Diya Reddy.")).toBe("2 students are absent today: Aarav Sharma, Diya Reddy.");
    expect(withoutEmptyList("Sports Day at 10:30.")).toBe("Sports Day at 10:30.");
  });

  it("no fixed sentence puts a list blank after a colon unless the code always fills it", () => {
    // words.ts: the only list blanks after a colon are filled with at least one item by the code
    // (studentMany: two or more matches; upcoming: two or more entries; upcomingOne: one; missing: a card that is not ready).
    const listAfterColon = WORD_KEYS.filter((k) => /:\s*\{(list|fields)\}/.test(words("en", k)));
    expect(listAfterColon.sort()).toEqual(["missing", "studentMany", "upcoming", "upcomingOne"]);
  });
});
