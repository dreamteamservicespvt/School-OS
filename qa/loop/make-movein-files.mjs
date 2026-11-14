// Layman loop "Moving in": realistic files a school brings from its old software (made-up people, fake numbers,
// local testing only). Writes to qa-output/loop/movein/.
//   node qa/loop/make-movein-files.mjs
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";

const OUT = path.resolve("qa-output/loop/movein");
mkdirSync(OUT, { recursive: true });

// 1. An "old software" export: its own headings, mixed classes, dates, phones and genders, a duplicate, a missing phone.
const old = [
  ["Adm No", "Student Name", "Class", "Sec", "DOB", "Gender", "Father Name", "Mother Name", "Mobile", "Address", "Aadhar No"],
  ["1001", "Kiran Kumar Varma", "5", "A", "05/03/2016", "M", "Ramana Varma", "Sita Varma", "+91 90000 00101", "Main Road, Kakinada", "2345 6789 0123"],
  ["1002", "Divya Sri", "V", "a", "2016-07-21", "F", "Prasad Rao", "Lakshmi", "9000000102", "", ""],
  ["1003", "Mohammed Arif", "Class 5", "B", "12-Jan-2016", "Boy", "Abdul Khader", "Fathima", "090000-00103", "Gandhi Nagar", ""],
  ["1004", "శ్రావ్య", "5", "B", new Date(Date.UTC(2016, 1, 14)), "F", "వెంకట్", "రమ", "9000000104", "", ""],
  ["1005", "Rahul", "4", "A", "3/9/2017", "Male", "Suresh", "", "", "Kakinada", ""],
  ["1006", "Sneha Reddy", "4", "A", "2017-11-02", "Female", "Raghava Reddy", "Anitha", "9000000106", "", "1234 5678 9012"],
  ["1007", "Sai Teja", "IV", "B", "15/08/2017", "M", "Srinivas", "Padma", "9000000107", "", ""],
  ["1008", "Ananya", "UKG", "A", "2020-04-10", "F", "Mahesh", "Kavya", "9000000108", "", ""],
  ["1009", "Arjun", "Ukg", "B", "2020-09-30", "M", "Ravi", "Swathi", "9000000109", "", ""],
  ["1010", "Bhavya", "LKG", "A", "2021-01-05", "F", "Naresh", "Deepa", "9000000110", "", ""],
  ["1011", "Charan", "1", "A", "2019-06-18", "M", "Kishore", "Latha", "9000000111", "", ""],
  ["1012", "Charan Teja", "1st", "A", "2019-08-01", "M", "Kishore", "Latha", "9000000111", "", ""],
  ["1013", "Harshitha", "10", "A", "2011-03-12", "F", "Gopal", "Rani", "9000000113", "", ""],
  ["1014", "Vamsi", "X", "B", "2011-12-25", "M", "Murali", "Uma", "9000000114", "", ""],
  ["1002", "Divya Sri", "V", "a", "2016-07-21", "F", "Prasad Rao", "Lakshmi", "9000000102", "", ""],
  ["1015", "Pooja", "6", "C", "2015-05-05", "F", "Anil", "Sunitha", "9000000115", "", ""],
  ["1016", "Nikhil", "Nursery", "A", "2022-02-02", "M", "Vijay", "Priya", "98765", "", ""],
];
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Students 2026-27");
ws.addRow(["SRI CHAITANYA OLD SOFTWARE - STUDENT LIST", "", "", "", "Printed 14/11/2026"]);
ws.addRow([]);
for (const r of old) ws.addRow(r);
await wb.xlsx.writeFile(path.join(OUT, "students-old-software.xlsx"));

// 2. A plain CSV the office typed by hand (different headings again).
writeFileSync(path.join(OUT, "students-typed.csv"), [
  "Name of the student,Class & Section,Date of Birth,Parent,Parent phone",
  "Teja Sai,7-A,02.04.2014,Ramesh,9000000201",
  "Keerthi,7 A,2014/09/09,Sreenivas,9000000202",
  "Gowtham,VII B,14/02/2014,Hari,9000000203",
  "Manasa,7B,,Ravi Kumar,9000000204",
].join("\n"));

// 3. Staff from the old register.
const staff = new ExcelJS.Workbook();
const ss = staff.addWorksheet("Staff");
for (const r of [
  ["Emp Code", "Name", "Designation", "Mobile No", "DOJ", "Salary"],
  ["T01", "Padmavathi", "Teacher", "9000000301", "01/06/2015", "18000"],
  ["T02", "Rajesh Kumar", "PET", "9000000302", "15-06-2018", "15,000"],
  ["T03", "Srilatha", "Principal", "9000000303", "2010-06-01", "45000"],
  ["A01", "Venu", "Accountant", "9000000304", "01/04/2019", "20000"],
  ["S01", "Ramulu", "Peon", "", "01/06/2012", "9000"],
]) ss.addRow(r);
await staff.xlsx.writeFile(path.join(OUT, "staff-old-register.xlsx"));

// 4. Old fee dues (balances the school carries in).
writeFileSync(path.join(OUT, "fee-dues-old.csv"), [
  "Adm No,Student,Pending Amount,Remarks",
  "1001,Kiran Kumar Varma,\"12,500\",Term 2 not paid",
  "1003,Mohammed Arif,3000,bus fee",
  "1005,Rahul,₹ 8,000.00,",
  "1099,Unknown Child,5000,not in list",
].join("\n"));
console.log("written to", OUT);
