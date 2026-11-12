// What a teacher types in a marks box is never changed silently (QA LC9),
// the "no mark yet" line names the part that is missing (QA LC10), and
// Marks Entry tells Overdue from Due soon (QA LC8).
import { describe, expect, it } from "vitest";
import { markNumber, missingWords, readMarkText } from "@/lib/exams/compute";
import { marksDueFilter, marksDueSoon, marksDueSoonOnly, marksOverdue } from "@/lib/exams/marks";

describe("typing in a marks box", () => {
  it("takes digits and half marks, and AB or ML in any case", () => {
    expect(readMarkText("37")).toEqual({ kind: "mark", text: "37" });
    expect(readMarkText(" 37.5 ")).toEqual({ kind: "mark", text: "37.5" });
    expect(readMarkText("7.")).toEqual({ kind: "mark", text: "7." });
    expect(readMarkText("ab")).toEqual({ kind: "code", code: "AB" });
    expect(readMarkText("AB")).toEqual({ kind: "code", code: "AB" });
    expect(readMarkText("Ml")).toEqual({ kind: "code", code: "ML" });
    expect(readMarkText("")).toEqual({ kind: "blank" });
  });

  it("waits on a code still being typed instead of turning it into AB", () => {
    expect(readMarkText("a")).toEqual({ kind: "partial" });
    expect(readMarkText("M")).toEqual({ kind: "partial" });
  });

  it("gives a message for anything else, never AB, 5 or 12", () => {
    for (const t of ["abc", "1e2", "x", "12a", "AB1"]) expect(readMarkText(t).kind, t).toBe("bad");
    const minus = readMarkText("-5");
    expect(minus.kind).toBe("bad");
    expect(minus.kind === "bad" && minus.problem).toMatch(/minus sign is not allowed/);
    const e = readMarkText("1e2");
    expect(e.kind === "bad" && e.problem).toMatch(/“1e2” is not a mark/);
  });

  it("reads only plain digits as a number", () => {
    expect(markNumber("1e2")).toBeNaN();
    expect(markNumber("-5")).toBeNaN();
    expect(markNumber("0x10")).toBeNaN();
    expect(markNumber("37.5")).toBe(37.5);
    expect(markNumber("7.")).toBe(7);
    expect(markNumber(" ")).toBeNull();
  });
});

describe("what is missing", () => {
  const cats = [{ name: "Theory" }, { name: "Internal" }];
  it("names the empty part when some are in", () => {
    expect(missingWords({ parts: { Theory: "72", Internal: "" }, absent: false }, cats, false)).toBe(": Internal missing");
  });
  it("says nothing more when every part is empty, the student is absent, or the paper has one part", () => {
    expect(missingWords({ parts: { Theory: "", Internal: "" }, absent: false }, cats, false)).toBe("");
    expect(missingWords({ parts: { Theory: "", Internal: "" }, absent: true }, cats, false)).toBe("");
    expect(missingWords({ parts: { Marks: "" }, absent: false }, [{ name: "Marks" }], false)).toBe("");
  });
});

describe("Overdue and Due soon", () => {
  const today = new Date("2026-11-12T00:00:00Z");
  const day = (n: number) => new Date(today.getTime() + n * 86_400_000);
  const late = { status: "IN_PROGRESS", date: day(-20), due: day(-5) };
  const soon = { status: "NOT_STARTED", date: day(-1), due: day(2) };
  const done = { status: "SUBMITTED", date: day(-20), due: day(-5) };

  it("a late paper is Overdue, not Due soon", () => {
    expect(marksOverdue(late, today)).toBe(true);
    expect(marksDueSoonOnly(late, today)).toBe(false);
    expect(marksDueSoon(late, today)).toBe(true); // the Dashboard card still counts it as waiting
  });
  it("a paper due in the next days is Due soon, not Overdue; a submitted one is neither", () => {
    expect(marksOverdue(soon, today)).toBe(false);
    expect(marksDueSoonOnly(soon, today)).toBe(true);
    expect(marksOverdue(done, today)).toBe(false);
  });
  it("the Dashboard links to the filter that shows its papers", () => {
    expect(marksDueFilter([late], today)).toBe("overdue");
    expect(marksDueFilter([soon], today)).toBe("soon");
    expect(marksDueFilter([late, soon], today)).toBe("due");
  });
});
