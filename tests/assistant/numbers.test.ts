// The no-invention guard (00-global.md §2.1 rule 2): a reply may only use the
// numbers in the records, the person's words and today's date. No database.
import { describe, expect, it } from "vitest";
import { allowedNumbers, inventedNumbers, numbersIn } from "@/lib/assistant/numbers";

describe("numbers in a reply", () => {
  it("reads Indian grouping, ₹, %, dates and Telugu and Hindi digits", () => {
    expect(numbersIn("₹1,20,000 from 12 payments, 92.5%")).toEqual(["120000", "12", "92.5"]);
    expect(numbersIn("15-11-2026")).toEqual(["15", "11", "2026"]);
    expect(numbersIn("౩ మంది, ३ छात्र")).toEqual(["3", "3"]);
    expect(numbersIn("Class 05")).toEqual(["5"]);
  });
});

describe("a reply with a number not in the records is caught", () => {
  const facts = { count: "3", total: 3, rows: [{ Student: "Aarav Sharma", Class: "5 A", "Roll no.": "1" }], scope: "Whole school · 09-10-2026", amount: "₹45,600" };
  const allowed = allowedNumbers([facts, "who is absent today"], new Date("2026-10-09T00:00:00Z"));

  it("passes a reply that only uses the records' numbers", () => {
    expect(inventedNumbers("3 students are absent today, including Aarav Sharma of 5 A.", allowed)).toEqual([]);
    expect(inventedNumbers("ఈ రోజు 3 మంది రాలేదు; ₹45,600 వచ్చింది.", allowed)).toEqual([]);
  });

  it("catches a made-up count, amount or percentage", () => {
    expect(inventedNumbers("4 students are absent.", allowed)).toEqual(["4"]);
    expect(inventedNumbers("About ₹50,000 came in, 90% of the target.", allowed)).toEqual(["50000", "90"]);
  });
});
