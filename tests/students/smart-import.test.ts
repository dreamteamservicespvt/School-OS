// Smart Import (03 §2): suggestions only, confirmed by a person; empty cells stay empty.
import { describe, expect, it } from "vitest";
import { acceptedFixes, applyFixes, fixClass, fixDate, fixName, fixPhone, suggestFixes, suggestMatch } from "@/lib/students/smart-import";

const COLUMNS = [
  { key: "fullName", label: "Full name", required: true },
  { key: "className", label: "Class" },
  { key: "dateOfBirth", label: "Date of birth", required: true },
  { key: "guardianPhone", label: "Parent's phone", required: true },
  { key: "motherPhone", label: "Mother's phone" },
];

describe("Smart Import fixes", () => {
  it("reads dates written other ways, and leaves good or unreadable dates alone", () => {
    expect(fixDate("2014/03/02")).toBe("02-03-2014");
    expect(fixDate("2-3-14", 2026)).toBe("02-03-2014");
    expect(fixDate("5-6-98", 2026)).toBe("05-06-1998");
    expect(fixDate("14 Mar 2016")).toBe("14-03-2016");
    expect(fixDate("March 14, 2016")).toBe("14-03-2016");
    expect(fixDate("42005")).toBe("01-01-2015");
    expect(fixDate("14-03-2016")).toBeNull();
    expect(fixDate("31/02/2016")).toBeNull();
    expect(fixDate("")).toBeNull();
  });

  it("tidies phones, classes and names in capitals", () => {
    expect(fixPhone("+91 98495 60211")).toBe("9849560211");
    expect(fixPhone("09849560211")).toBe("9849560211");
    expect(fixPhone("9849560211")).toBeNull();
    expect(fixPhone("12345")).toBeNull();
    expect(fixClass("VII")).toBe("7");
    expect(fixClass("Std 5")).toBe("5");
    expect(fixClass("5th")).toBe("5");
    expect(fixClass("5")).toBeNull();
    expect(fixClass("Class 5")).toBeNull();
    expect(fixClass("LKG")).toBeNull();
    expect(fixName("ARJUN RAO")).toBe("Arjun Rao");
    expect(fixName("Arjun Rao")).toBeNull();
  });

  it("suggests fixes per column and applies only the ticked ones, never filling empty cells", () => {
    const rows = [
      ["ARJUN RAO", "VII", "2014/03/02", "+91 98495 60211", ""],
      ["Sita Devi", "7", "", "9849560212", ""],
    ];
    const match = { fullName: 0, className: 1, dateOfBirth: 2, guardianPhone: 3, motherPhone: 4 };
    const fixes = suggestFixes(COLUMNS, rows, match);
    expect(fixes.map((f) => f.id).sort()).toEqual(["className:class", "dateOfBirth:date", "fullName:caps", "guardianPhone:phone"]);
    const fixed = applyFixes(rows, match, acceptedFixes("dateOfBirth:date,guardianPhone:phone"));
    expect(fixed[0]).toEqual(["ARJUN RAO", "VII", "02-03-2014", "9849560211", ""]);
    expect(fixed[1][2]).toBe("");
    expect(applyFixes(rows, match, new Set())).toBe(rows);
    expect(acceptedFixes("x;drop,dateOfBirth:date")).toEqual(new Set(["dateOfBirth:date"]));
  });

  it("suggests columns from headings and values, without taking a column twice", () => {
    const headers = ["Student", "Mob No", "D.O.B", "Mother Mobile"];
    const rows = [["Arjun", "9849560211", "02-03-2014", "9849560299"], ["Sita", "9849560212", "2014/04/05", "9849560298"]];
    const s = suggestMatch(COLUMNS, headers, rows, {});
    const by = Object.fromEntries(s.map((m) => [m.key, m.index]));
    expect(by.fullName).toBe(0);
    expect(by.guardianPhone).toBe(1);
    expect(by.dateOfBirth).toBe(2);
    expect(by.motherPhone).toBe(3);
    expect(new Set(s.map((m) => m.index)).size).toBe(s.length);
  });
});
