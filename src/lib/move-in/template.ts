// A ready Excel sheet for one import, made for this school (workflow 15,
// step 2): the import's columns, drop-down lists of this school's own
// classes, sections, designations and departments, and a sheet that says how
// to fill each column. Typing from paper registers into it avoids most
// problems before the file is even uploaded.
import "server-only";

import ExcelJS from "exceljs";
import type { ImportKind } from "../importer";
import type { Lookups } from "./lookups";
import { valueType } from "./match";
import { PAYMENT_MODES } from "../fees/words";

const LAST_ROW = 3001;

const colName = (n: number) => {
  let s = "";
  for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

/** Where the filled sheet is uploaded, by import kind, when its own module has an Import page. */
const UPLOAD_AT: Record<string, string> = {
  "fee-old-dues": "Fee Management, Student Fee Ledger, Import",
  "fee-past-receipts": "Fee Management, Student Fee Ledger, Import",
  "finance-past-expenses": "Finance Management, Expenses, Import",
  "calendar-holidays": "Events & Calendar, School Calendar, Import",
  students: "Student Management, Import students",
  staff: "Staff & HR Management, Import staff",
  "admission-enquiries": "Admission Management, Enquiries, Import",
  "library-catalogue": "Library Management, Books, Import",
  "inventory-items": "Inventory Management, Items & Stock, Import",
  "inventory-assets": "Inventory Management, Assets, Import",
  "hostel-rooms": "Hostel Management, Rooms & Beds, Import",
  "attendance-so-far": "Attendance Management, Import attendance so far",
};
/** Kinds brought in only on their own module's page. */
const ONLY_THERE: Record<string, string> = {
  "students-update": "Student Management, Import students, Changes to students already here",
  "salary-structures": "Salary Management, Salary Structures, Import",
};

export async function templateWorkbook(kind: ImportKind<unknown>, lookups: Lookups, schoolName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "School OS";
  const ws = wb.addWorksheet(kind.label, { views: [{ state: "frozen", ySplit: 1 }] });
  const lists = wb.addWorksheet("Lists", { state: "veryHidden" });
  const help = wb.addWorksheet("How to fill");

  const classNames = [...new Set(lookups.sections.map((s) => s.className))];
  const sectionNames = [...new Set(lookups.sections.map((s) => s.sectionName))].sort();
  const listFor: Record<string, string[]> = {
    className: classNames,
    sectionName: sectionNames,
    gender: ["Male", "Female", "Other"],
    bloodGroup: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    designation: lookups.designations,
    department: lookups.departments,
    createLogin: ["Yes", "No"],
    guardianRelation: ["Father", "Mother", "Guardian", "Grandparent", "Other"],
    category: ["General", "OBC", "SC", "ST", "EWS"],
    employmentType: ["Permanent", "Probation", "Contract", "Temporary", "Part-time", "Guest"],
    feeHead: lookups.feeHeads ?? [],
    mode: PAYMENT_MODES.map((m) => m.label),
    ...(kind.key === "finance-past-expenses" ? { head: lookups.expenseHeads ?? [] } : {}),
    ...(kind.key === "calendar-holidays" ? { type: ["Holiday", "Vacation"] } : {}),
  };

  ws.columns = kind.columns.map((c) => ({ header: c.label + (c.required ? " *" : ""), key: c.key, width: Math.max(14, Math.min(36, c.label.length + 6)) }));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.height = 22;
  head.alignment = { vertical: "middle" };
  kind.columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.required ? "FFFDE7C2" : "FFEFF3F8" } };
    const note = [c.help, c.example ? `For example: ${c.example}` : null, c.required ? "Must be filled." : null].filter(Boolean).join(" ");
    if (note) cell.note = note;
  });

  let listCol = 0;
  kind.columns.forEach((c, i) => {
    const values = listFor[c.key];
    const letter = colName(i);
    const type = valueType(kind.key, c.key);
    // Text columns stay text, so Excel keeps leading zeros and long numbers whole.
    if (type === "phone" || type === "digits" || ["admissionNo", "rollNo", "siblingAdmissionNo", "head", "apaarId", "pen"].includes(c.key)) {
      ws.getColumn(i + 1).numFmt = "@";
    }
    if (type === "date") {
      ws.getColumn(i + 1).numFmt = "dd-mm-yyyy";
    }
    if (values?.length) {
      const lc = colName(listCol++);
      values.forEach((v, j) => { lists.getCell(`${lc}${j + 1}`).value = v; });
      (ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } }).dataValidations.add(`${letter}2:${letter}${LAST_ROW}`, {
        type: "list", allowBlank: !c.required, formulae: [`Lists!$${lc}$1:$${lc}$${values.length}`],
        showErrorMessage: true,
        errorStyle: "warning", errorTitle: c.label, error: `Choose from the list. ${c.label} must be one School OS knows.`,
      });
    }
  });

  help.columns = [{ header: "Column", width: 30 }, { header: "How to fill it", width: 90 }];
  help.getRow(1).font = { bold: true };
  help.addRow([`${schoolName}: ${kind.label}`, "Fill one row for each record on the first sheet. Columns with a star must be filled. Leave other columns empty when you do not know."]);
  const where = ONLY_THERE[kind.key] ?? `${UPLOAD_AT[kind.key] ? `${UPLOAD_AT[kind.key]}, or in ` : ""}Settings, Data Backup & Security, Switching to School OS`;
  help.addRow(["", `Upload the file in ${where}. Every row is checked and you see the problems before anything is saved.`]);
  for (const c of kind.columns) {
    const list = listFor[c.key];
    help.addRow([c.label + (c.required ? " *" : ""), [c.help, c.example ? `Example: ${c.example}.` : null, list?.length ? `Choose from: ${list.slice(0, 12).join(", ")}${list.length > 12 ? "…" : ""}.` : null].filter(Boolean).join(" ") || "Optional."]);
  }
  help.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
