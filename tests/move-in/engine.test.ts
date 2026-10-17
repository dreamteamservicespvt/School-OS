// The move-in engine without a database: reading files, tidy-ups, matching
// headings and values the many ways old software writes them.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { decodeText, guessSeparator, readDelimited, readWorkbook, ReadProblem } from "@/lib/move-in/read";
import { classKey, dateOrder, readDate, splitClassSection, tidyBloodGroup, tidyDate, tidyGender, tidyName, tidyPhone } from "@/lib/move-in/tidy";
import { closeEnough, findHeaderRow, guessKind, matchColumns } from "@/lib/move-in/match";
import { parseRupees } from "@/lib/fees/act";
import { findOption, findSection, suggestSections, type SectionOption } from "@/lib/move-in/lookups";
import { cleanCsv, prepareSheet, safeCell, type Choices } from "@/lib/move-in/prepare";
import type { ImportColumn } from "@/lib/importer";

const STUDENT_COLS: ImportColumn[] = [
  { key: "fullName", label: "Full name", required: true, aliases: ["name", "student name"] },
  { key: "className", label: "Class" },
  { key: "sectionName", label: "Section" },
  { key: "dateOfBirth", label: "Date of birth", required: true, aliases: ["dob"] },
  { key: "gender", label: "Gender", required: true },
  { key: "guardianName", label: "Father's or guardian's name", required: true, aliases: ["father name"] },
  { key: "guardianPhone", label: "Parent's phone", required: true, aliases: ["phone", "mobile"] },
  { key: "motherName", label: "Mother's name" },
  { key: "motherPhone", label: "Mother's phone" },
  { key: "admissionNo", label: "Admission number", aliases: ["admission no"] },
  { key: "rollNo", label: "Roll number" },
];
const STAFF_COLS: ImportColumn[] = [
  { key: "fullName", label: "Full name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "designation", label: "Designation", required: true },
  { key: "department", label: "Department" },
  { key: "joiningDate", label: "Joining date", required: true },
];
const KINDS = [{ key: "students", columns: STUDENT_COLS }, { key: "staff", columns: STAFF_COLS }];

const sec = (id: string, className: string, sectionName: string): SectionOption => ({ id, className, sectionName, key: classKey(className) });
const SECTIONS = [sec("s5a", "Class 5", "A"), sec("s5b", "Class 5", "B"), sec("s6a", "Class 6", "A"), sec("lkga", "LKG", "A"), sec("ukg", "UKG", "Rose")];
const LOOKUPS = { sections: SECTIONS, designations: ["Teacher", "Accountant", "Support Staff", "Security"], departments: ["Science", "Mathematics"] };

describe("reading files", () => {
  it("finds the separator", () => {
    expect(guessSeparator("a;b;c\n1;2;3")).toBe(";");
    expect(guessSeparator("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(guessSeparator('"x, y",b\n1,2')).toBe(",");
  });
  it("reads UTF-16 and Windows-1252 text", () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Name\tClass\r\nRavi\t5\r\n", "utf16le")]);
    expect(readDelimited(decodeText(utf16))).toEqual([["Name", "Class"], ["Ravi", "5"]]);
    expect(decodeText(Buffer.from([0x52, 0xe9, 0x6d, 0x79]))).toBe("Rémy");
  });
  it("keeps quoted commas and line breaks, and drops empty rows at the end", () => {
    expect(readDelimited('Name,Address\n"Rao, Arjun","12-4,\nAmeerpet"\n,\n')).toEqual([["Name", "Address"], ["Rao, Arjun", "12-4,\nAmeerpet"]]);
  });
  it("reads every sheet of a workbook, dates as DD-MM-YYYY", async () => {
    const wb = new ExcelJS.Workbook();
    const a = wb.addWorksheet("Students");
    a.addRow(["Sunrise School student list"]);
    a.addRow(["Name", "DOB", "Mobile"]);
    a.addRow(["Ravi", new Date(Date.UTC(2016, 2, 14)), 9876543210]);
    wb.addWorksheet("Staff").addRow(["Name", "Designation"]);
    const sheets = await readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()), "school.xlsx");
    expect(sheets.map((s) => s.name)).toEqual(["Students", "Staff"]);
    expect(sheets[0].rows[2]).toEqual(["Ravi", "14-03-2016", "9876543210"]);
  });
  it("explains old .xls files instead of failing", async () => {
    await expect(readWorkbook(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2]), "old.xls")).rejects.toThrow(ReadProblem);
  });
});

describe("tidy-ups", () => {
  it("names", () => {
    expect(tidyName("ARJUN  K.RAO")).toBe("Arjun K. Rao");
    expect(tidyName("priya sharma")).toBe("Priya Sharma");
    expect(tidyName("McDonald D'Souza")).toBe("McDonald D'Souza");
  });
  it("phones", () => {
    expect(tidyPhone("+91 98765-43210")).toBe("9876543210");
    expect(tidyPhone("098765 43210")).toBe("9876543210");
    expect(tidyPhone("919876543210")).toBe("9876543210");
    expect(tidyPhone("9.876543211E+09")).toBe("9876543211");
    expect(tidyPhone("9.87654321E+09")).toBe("9.87654321E+09");
    expect(tidyPhone("9.87654E+09")).toBe("9.87654E+09");
    expect(tidyPhone("9876543210 / 9123456780")).toBe("9876543210");
    expect(tidyPhone("12345")).toBe("12345");
  });
  it("dates written many ways", () => {
    expect(tidyDate("14/3/2016")).toBe("14-03-2016");
    expect(tidyDate("14.03.16")).toBe("14-03-2016");
    expect(tidyDate("14-Mar-2016")).toBe("14-03-2016");
    expect(tidyDate("14th March 2016")).toBe("14-03-2016");
    expect(tidyDate("March 14, 2016")).toBe("14-03-2016");
    expect(tidyDate("2016-03-14")).toBe("14-03-2016");
    expect(tidyDate("42443")).toBe("14-03-2016");
    expect(tidyDate("3/14/2016", "MDY")).toBe("14-03-2016");
    expect(tidyDate("31/02/2016")).toBe("31/02/2016");
    expect(readDate("05-06-89")?.getUTCFullYear()).toBe(1989);
  });
  it("works out day-first or month-first per column", () => {
    expect(dateOrder(["03/14/2016", "01/02/2016"])).toBe("MDY");
    expect(dateOrder(["14/03/2016", "01/02/2016"])).toBe("DMY");
    expect(dateOrder(["01/02/2016"])).toBe("DMY");
  });
  it("gender and blood group codes", () => {
    expect(tidyGender("1-Male")).toBe("Male");
    expect(tidyGender("G")).toBe("Female");
    expect(tidyGender("boy")).toBe("Male");
    expect(tidyBloodGroup("b +ve")).toBe("B+");
    expect(tidyBloodGroup("AB Negative")).toBe("AB-");
  });
  it("class names however they are written", () => {
    for (const v of ["Class 5", "5th", "V", "Std. 5", "Grade five", "class-5", "05"]) expect(classKey(v)).toBe("5");
    for (const v of ["LKG", "L.K.G", "Jr KG", "PP1", "pp-1"]) expect(classKey(v)).toBe("lkg");
    expect(classKey("UKG")).toBe("ukg");
    expect(classKey("Rose")).toBeNull();
  });
  it("splits class and section written together", () => {
    expect(splitClassSection("5 A")).toEqual({ className: "5", sectionName: "A" });
    expect(splitClassSection("5A")).toEqual({ className: "5", sectionName: "A" });
    expect(splitClassSection("V-B")).toEqual({ className: "V", sectionName: "B" });
    expect(splitClassSection("5th (A)")).toEqual({ className: "5th", sectionName: "A" });
    expect(splitClassSection("Class 5 - Section B")).toEqual({ className: "Class 5", sectionName: "B" });
    expect(splitClassSection("UKG Rose")).toEqual({ className: "UKG", sectionName: "Rose" });
    expect(splitClassSection("LKG")).toBeNull();
    expect(splitClassSection("Class 5")).toBeNull();
  });
});

describe("matching headings", () => {
  const grid = [
    ["SUNRISE PUBLIC SCHOOL"],
    ["Student list 2026-27"],
    ["S.No", "Adm No", "First Name", "Last Name", "Class & Sec", "D.O.B", "Sex", "Father Name", "Father Mob", "Mother Name", "Mother Mobile"],
    ["1", "A-101", "ARJUN", "RAO", "5th A", "14/03/2016", "M", "SRINIVAS RAO", "+91 98765 43210", "LAKSHMI", "9123456780"],
    ["2", "A-102", "priya", "sharma", "V-B", "02-11-2015", "F", "ramesh sharma", "09876501234", "", ""],
  ];
  it("finds the heading row under the school's title", () => {
    expect(findHeaderRow(grid, KINDS)).toBe(2);
  });
  it("tells a student sheet from a staff sheet", () => {
    expect(guessKind(grid[2], KINDS)?.key).toBe("students");
    expect(guessKind(["Employee Name", "Mobile", "Designation", "DOJ"], KINDS)?.key).toBe("staff");
  });
  it("matches the columns, joining first and last name and splitting class and section", () => {
    const m = matchColumns("students", STUDENT_COLS, grid[2], grid.slice(3));
    expect(m.admissionNo).toEqual([1]);
    expect(m.fullName).toEqual([2, 3]);
    expect(m.className).toEqual([4]);
    expect(m.sectionName).toEqual([4]);
    expect(m.dateOfBirth).toEqual([5]);
    expect(m.gender).toEqual([6]);
    expect(m.guardianName).toEqual([7]);
    expect(m.guardianPhone).toEqual([8]);
    expect(m.motherName).toEqual([9]);
    expect(m.motherPhone).toEqual([10]);
  });
  it("forgives a typo or two in a heading, but not a different word", () => {
    expect(closeEnough("admisionno", "admissionno")).toBe(true);
    expect(closeEnough("fathermobil", "fathermobile")).toBe(true);
    expect(closeEnough("mothername", "fathername")).toBe(false);
    const g = [["Admision No", "Studnet Name", "Date of Brith", "Gender", "Fathers Nmae", "Fathers Mobil"], ["A-1", "Ravi Rao", "14/03/2016", "M", "Srinivas Rao", "9876543210"], ["A-2", "Sita Rao", "01/01/2015", "F", "Mohan Rao", "9876501234"], ["A-3", "Anil Das", "05/06/2015", "M", "Das", "9876501299"]];
    const m = matchColumns("students", STUDENT_COLS, g[0], g.slice(1));
    expect(m.admissionNo).toEqual([0]);
    expect(m.fullName).toEqual([1]);
    expect(m.dateOfBirth).toEqual([2]);
    expect(m.guardianName).toEqual([4]);
    expect(m.guardianPhone).toEqual([5]);
  });
  it("knows the headings of Fedena and Entab exports", () => {
    const m = matchColumns("students", STUDENT_COLS, ["Stu Name", "Batch", "Admission Num", "DOB", "Gender", "Father Name", "Mobile"], []);
    expect(m.fullName).toEqual([0]);
    expect(m.className).toEqual([1]);
    expect(m.admissionNo).toEqual([2]);
  });
  it("reads amounts written the way old registers write them", () => {
    expect(parseRupees("Rs. 12,500/-", "Amount")).toBe(BigInt(1250000));
    expect(parseRupees("INR 4500", "Amount")).toBe(BigInt(450000));
    expect(parseRupees("₹ 4,500.50", "Amount")).toBe(BigInt(450050));
    expect(parseRupees("12500/-", "Amount")).toBe(BigInt(1250000));
    expect(() => parseRupees("twelve", "Amount")).toThrow();
  });
  it("finds required columns by their values when the heading says nothing", () => {
    const g = [["Student", "Col2", "Col3", "Col4", "Papa"], ["Ravi", "9876543210", "14/03/2016", "M", "Rao"], ["Sita", "9876501234", "01/01/2015", "F", "Rao"]];
    const m = matchColumns("students", STUDENT_COLS, g[0], g.slice(1));
    expect(m.guardianPhone).toEqual([1]);
    expect(m.dateOfBirth).toEqual([2]);
    expect(m.gender).toEqual([3]);
  });

  it("prepares clean rows with every tidy-up listed", () => {
    const choices: Choices = { headerRow: 3, columnMatch: matchColumns("students", STUDENT_COLS, grid[2], grid.slice(3)), valueMatch: {}, rowFixes: {}, leftOut: [], tidy: true };
    const p = prepareSheet("students", STUDENT_COLS, grid, choices, LOOKUPS);
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0].values).toMatchObject({ fullName: "Arjun Rao", className: "Class 5", sectionName: "A", dateOfBirth: "14-03-2016", gender: "Male", guardianName: "Srinivas Rao", guardianPhone: "9876543210", admissionNo: "A-101" });
    expect(p.rows[1].values).toMatchObject({ fullName: "Priya Sharma", className: "Class 5", sectionName: "B", gender: "Female", guardianPhone: "9876501234" });
    expect(p.unmatched).toHaveLength(0);
    expect(p.tidied.find((t) => t.key === "guardianPhone")?.count).toBe(2);
  });

  it("lists classes it cannot place, with suggestions, and follows the person's choice", () => {
    const g = [["Name", "Class", "Section", "DOB", "Gender", "Father name", "Mobile"], ["Ravi", "Fifth Std", "C", "14/03/2016", "M", "Rao", "9876543210"], ["Sita", "Fifth Std", "C", "1/1/2016", "F", "Rao", "9876543211"], ["", "", "", "", "", "", ""], ["Total", "2", "", "", "", "", ""]];
    const base: Choices = { headerRow: 1, columnMatch: matchColumns("students", STUDENT_COLS, g[0], g.slice(1)), valueMatch: {}, rowFixes: {}, leftOut: [], tidy: true };
    const p = prepareSheet("students", STUDENT_COLS, g, base, LOOKUPS);
    expect(p.passed).toMatchObject({ empty: 1, totals: 1 });
    expect(p.unmatched).toHaveLength(1);
    expect(p.unmatched[0]).toMatchObject({ column: "class", count: 2, label: "Fifth Std C" });
    expect(p.unmatched[0].suggestions[0].label).toMatch(/^Class 5/);
    const chosen = prepareSheet("students", STUDENT_COLS, g, { ...base, valueMatch: { class: { [p.unmatched[0].value]: "s5b" } } }, LOOKUPS);
    expect(chosen.unmatched).toHaveLength(0);
    expect(chosen.rows[0].values).toMatchObject({ className: "Class 5", sectionName: "B" });
  });

  it("applies fixes typed on screen and leaves out rows", () => {
    const g = [["Name", "Class", "DOB", "Gender", "Father name", "Mobile"], ["Ravi", "5 A", "31/02/2016", "M", "Rao", "98765"], ["Sita", "6", "1/1/2016", "F", "Rao", "9876543211"]];
    const p = prepareSheet("students", STUDENT_COLS, g, { headerRow: 1, columnMatch: matchColumns("students", STUDENT_COLS, g[0], []), valueMatch: {}, rowFixes: { "2": { dateOfBirth: "28/02/2016", guardianPhone: "9876543219" } }, leftOut: [3], tidy: true }, LOOKUPS);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ fixed: true, values: { dateOfBirth: "28-02-2016", guardianPhone: "9876543219", className: "Class 5", sectionName: "A" } });
    expect(p.passed.leftOut).toBe(1);
  });

  it("matches staff designations by the words schools use", () => {
    expect(findOption(LOOKUPS.designations, "PGT", "designation")).toBe("Teacher");
    expect(findOption(LOOKUPS.designations, "Peon", "designation")).toBe("Support Staff");
    expect(findOption(LOOKUPS.designations, "Chowkidar", "designation")).toBe("Security");
    expect(findOption(LOOKUPS.designations, "Librarian", "designation")).toBeNull();
    expect(findOption(LOOKUPS.departments, "science", "department")).toBe("Science");
  });

  it("places sections written many ways", () => {
    expect(findSection(SECTIONS, "V", "b")?.id).toBe("s5b");
    expect(findSection(SECTIONS, "5th B", "")?.id).toBe("s5b");
    expect(findSection(SECTIONS, "6", "")?.id).toBe("s6a");
    expect(findSection(SECTIONS, "5", "")).toBeNull();
    expect(findSection(SECTIONS, "Jr KG", "A")?.id).toBe("lkga");
    expect(suggestSections(SECTIONS, "Class 5", "C").map((s) => s.id)).toContain("s5a");
  });

  it("writes CSV the importer reads back, and keeps formulas out of downloads", () => {
    expect(cleanCsv([{ key: "a", label: "A" }], [{ line: 2, values: { a: 'x, "y"' }, changes: [], fixed: false }])).toBe('﻿A\r\n"x, ""y"""\r\n');
    expect(safeCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
  });
});
