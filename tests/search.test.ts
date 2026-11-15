import { describe, expect, it } from "vitest";
import { matches, withWords } from "@/components/shell/search-box";

describe("search matching", () => {
  it("finds a page from the start of any word", () => {
    expect(matches("Fee Management", "fee")).toBe(true);
    expect(matches("Fee Management", "man fee")).toBe(true);
    expect(matches("Staff & HR Management", "hr")).toBe(true);
  });
  it("forgives one wrong letter in longer words", () => {
    expect(matches("Attendance Management", "attendence")).toBe(true);
    expect(matches("Library Management", "libary")).toBe(true);
  });
  it("does not match letters scattered through a name", () => {
    expect(matches("Staff & HR Management", "fee")).toBe(false);
    expect(matches("Settings", "xyz")).toBe(false);
  });
});

// Owner decision 13 (15 Nov 2026): the menu shows short module names, so key pages are found by the words people say.
describe("key pages by their job words", () => {
  const finds = (label: string, href: string, q: string) => matches(withWords(label, href), q);
  it("finds the Time Table, written either way", () => {
    expect(finds("Time Table", "/academic-management/time-table", "timetable")).toBe(true);
    expect(finds("Time Table", "/academic-management/time-table", "time table")).toBe(true);
    expect(finds("My Time Table", "/academic-management/time-table/mine", "timetable")).toBe(true);
  });
  it("finds Collect Fee, Take Attendance, Marks Entry and Notices", () => {
    expect(finds("Fee Management", "/fee-management", "collect fee")).toBe(true);
    expect(finds("Attendance Management", "/attendance-management", "take attendance")).toBe(true);
    expect(finds("Marks Entry", "/examination-results/marks", "enter marks")).toBe(true);
    expect(finds("Notice Board", "/communication/notices", "notices")).toBe(true);
  });
  it("finds a module by its short menu label", () => {
    expect(matches("Fee Management", "fees")).toBe(true);
    expect(matches("Examination & Results", "exams")).toBe(true);
    expect(matches("Admission Management", "admissions")).toBe(true);
  });
  it("adds no words to other pages", () => {
    expect(withWords("Fee Dashboard", "/fee-management/dashboard")).toBe("Fee Dashboard");
    expect(finds("Fee Dashboard", "/fee-management/dashboard", "collect")).toBe(false);
  });
});
