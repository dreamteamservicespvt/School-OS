// Builds the SYNTHETIC DEMO student file for Chaitanya EM School — QA Demo,
// in the same Excel shape a school would bring. No real children.
//   node qa/make-students-xlsx.mjs <out.xlsx>
import ExcelJS from "exceljs";
const out = process.argv[2] ?? "qa-students.xlsx";
const BOYS = ["Aarav", "Vihaan", "Arjun", "Aditya", "Rohan", "Sai", "Karthik", "Pranav", "Harsha", "Teja", "Charan", "Varun", "Nikhil", "Abhiram", "Manoj"];
const GIRLS = ["Ananya", "Saanvi", "Diya", "Ishita", "Kavya", "Sahithi", "Lasya", "Harini", "Navya", "Sravya", "Meghana", "Keerthi", "Hasini", "Tejaswi", "Pooja"];
const SUR = ["Kumar", "Reddy", "Rao", "Sharma", "Varma", "Patel", "Singh", "Naidu", "Gorle", "Pydi", "Boddu", "Korada", "Inti", "Lanka", "Allu"];
const FATHERS = ["Ramesh", "Suresh", "Venkata", "Srinivas", "Prasad", "Murali", "Ravi", "Sanjay", "Mahesh", "Naresh"];
const MOTHERS = ["Lakshmi", "Padma", "Swathi", "Rani", "Jyothi", "Sujatha", "Vani", "Latha", "Radha", "Kavitha"];
const VILLAGES = ["Chekkapalli (DEMO address)", "Demo Village North", "Demo Village South", "Demo Village East", "Demo Village West"];
const CLASSES = [["Nursery", ["A"], 3], ["LKG", ["A"], 4], ["UKG", ["A"], 5], ...[1,2,3,4,5,6,7,8,9,10].map((g) => [`Grade ${g}`, ["A", "B"], 5 + g])];
let seq = 0;
const rows = [];
const dd = (d) => `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
// Student 001..020 scenarios, all in Grade 5 A so one class teacher sees them all.
const SCEN = [
  ["Aarav Kumar", "M", "Fully paid"], ["Ananya Reddy", "F", "Partial fee paid"], ["Vihaan Rao", "M", "Fee overdue"], ["Saanvi Sharma", "F", "Discount/concession"],
  ["Arjun Varma", "M", "Late fee"], ["Diya Patel", "F", "Absent frequently"], ["Aditya Kumar", "M", "Medical leave"], ["Ishita Rao", "F", "Transport user"],
  ["Rohan Singh", "M", "No transport"], ["Kavya Reddy", "F", "Parent Link enabled"], ["Sai Naidu", "M", "Parent Link revoked"], ["Sahithi Gorle", "F", "Exam high performer"],
  ["Karthik Pydi", "M", "Exam low performer"], ["Lasya Boddu", "F", "Homework pending"], ["Pranav Korada", "M", "Homework completed"], ["Harini Inti", "F", "Transfer/TC candidate"],
  ["Charan Lanka", "M", "New admission"], ["Navya Allu", "F", "Pending document"], ["Teja Varma", "M", "Birthday upcoming"], ["Meghana Rao", "F", "Data intentionally incomplete"],
];
for (const [cls, secs, age] of CLASSES) {
  for (const sec of secs) {
    for (let k = 0; k < (cls === "Grade 5" && sec === "A" ? 20 : 15); k++) {
      seq++;
      const boy = (seq * 7) % 2 === 0;
      let name = `${(boy ? BOYS : GIRLS)[(seq * 3) % 15]} ${SUR[(seq * 5) % 15]}`;
      let gender = boy ? "Male" : "Female";
      let note = "";
      const scen = cls === "Grade 5" && sec === "A" ? SCEN[k] : null;
      if (scen) { name = scen[0]; gender = scen[1] === "M" ? "Male" : "Female"; note = scen[2]; }
      const year = 2026 - age - 1;
      let dob = new Date(Date.UTC(year, (seq * 5) % 12, 1 + (seq % 27)));
      if (note === "Birthday upcoming") dob = new Date(Date.UTC(year, 9, 20)); // 20 October
      const surname = name.split(" ")[1];
      const father = `${FATHERS[seq % 10]} ${surname}`;
      const row = {
        "Full name": name, Class: cls, Section: sec, "Date of birth": dd(dob), Gender: gender,
        "Father's or guardian's name": father, Relation: "Father", "Parent's phone": `91${String(10000000 + seq * 137).slice(-8)}`,
        "Mother's name": `${MOTHERS[seq % 10]} ${surname}`, "Mother's phone": seq % 3 ? `92${String(10000000 + seq * 211).slice(-8)}` : "",
        "Admission date": note === "New admission" ? "10-10-2026" : "12-06-2026",
        "Blood group": ["A+", "B+", "O+", "AB+"][seq % 4], Category: ["General", "OBC", "SC", "ST", "EWS"][seq % 5], "Mother tongue": seq % 6 ? "Telugu" : "Hindi",
        Address: `${1 + (seq % 90)}-${seq % 12}, ${VILLAGES[seq % 5]}, Andhra Pradesh`, "Previous school": "",
        "QA scenario (SYNTHETIC DEMO DATA)": note || "Regular synthetic demo student",
      };
      if (note === "Data intentionally incomplete") { row["Date of birth"] = ""; row["Parent's phone"] = "12345"; }
      rows.push(row);
    }
  }
}
// Validation rows a real office file would have.
rows.push({ "Full name": "  Demo  Spaces  Student  ", Class: "Grade 6", Section: "A", "Date of birth": "05-05-2014", Gender: "male", "Father's or guardian's name": "Demo Father", "Parent's phone": "+91 91234 56780", "QA scenario (SYNTHETIC DEMO DATA)": "Leading/trailing spaces, +91 phone, lowercase gender" });
rows.push({ "Full name": "Demo Future Birth", Class: "Grade 6", Section: "A", "Date of birth": "05-05-2031", Gender: "Female", "Father's or guardian's name": "Demo Father", "Parent's phone": "9123456781", "QA scenario (SYNTHETIC DEMO DATA)": "Future date of birth must be refused" });
rows.push({ "Full name": "Demo Wrong Class", Class: "Grade 13", Section: "A", "Date of birth": "05-05-2014", Gender: "Female", "Father's or guardian's name": "Demo Father", "Parent's phone": "9123456782", "QA scenario (SYNTHETIC DEMO DATA)": "Class that does not exist" });
rows.push({ "Full name": "శ్రీ లక్ష్మి Demo", Class: "Grade 6", Section: "B", "Date of birth": "31-02-2014", Gender: "Female", "Father's or guardian's name": "Demo Father", "Parent's phone": "9123456783", "QA scenario (SYNTHETIC DEMO DATA)": "Telugu name (Unicode), impossible date 31-02" });
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Students");
const cols = Object.keys(rows[0]);
ws.columns = cols.map((c) => ({ header: c, key: c, width: 22 }));
for (const r of rows) ws.addRow(r);
await wb.xlsx.writeFile(out);
console.log(`${rows.length} rows -> ${out}`);
