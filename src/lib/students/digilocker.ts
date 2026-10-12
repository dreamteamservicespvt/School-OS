// DigiLocker-ready records (03 §2): the issued certificates as a plain CSV with one
// header row, in the columns a DigiLocker Issuer upload asks for. The school uploads
// it in its own DigiLocker Issuer account; School OS holds no DigiLocker key.
import { formatDate } from "../format";

export type DigiLockerRow = {
  number: string | null;
  type: string;
  issueDate: Date;
  studentName: string;
  admissionNo: string;
  dateOfBirth: Date | null;
  gender: string | null;
  apaarId: string | null;
  className: string;
  purpose: string | null;
};

export const DIGILOCKER_COLUMNS = [
  "Document number", "Document type", "Issue date", "Name", "Date of birth", "Gender", "APAAR ID", "Admission number", "Class", "Purpose",
] as const;

function cell(v: string | null | undefined) {
  const s = String(v ?? "");
  // Stops spreadsheet programs running a cell as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Only issued certificates with a number can go to DigiLocker. */
export function digiLockerCsv(rows: DigiLockerRow[], timeZone: string) {
  const lines = [DIGILOCKER_COLUMNS.join(",")];
  for (const r of rows) {
    if (!r.number) continue;
    lines.push([
      r.number, r.type, formatDate(r.issueDate, timeZone), r.studentName, r.dateOfBirth ? formatDate(r.dateOfBirth, timeZone) : "",
      r.gender, r.apaarId, r.admissionNo, r.className, r.purpose,
    ].map(cell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
