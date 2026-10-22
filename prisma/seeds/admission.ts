// Admission demo: Admission Settings with tests, interviews, the online form,
// the application fee and offer letters on; sections for the upcoming year;
// two admission-team logins (counsellor, frontdesk); enquiries at every
// status with follow-ups overdue, due today and later; an Open House
// campaign; and applications at every stage, with papers, fees, consent,
// tests, interviews, a waiting list for a full class, and two children
// already admitted through the normal Confirm admission step.
import type { Prisma } from "@prisma/client";
import { prisma, withSchool, type SchoolContext } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth/password";
import { saveFile, DOCUMENT_TYPES } from "../../src/lib/files";
import { defaultDocsFor, loadSettings } from "../../src/lib/admission/settings";
import { createApplication, sendForDecision, type ApplicationInput } from "../../src/lib/admission/applications";
import { recordCounterPayment } from "../../src/lib/admission/fee";
import { nextEnquiryNo } from "../../src/lib/admission/enquiries";
import { confirmAdmission } from "../../src/lib/admission/convert";
import type { Viewer } from "../../src/lib/admission/access";
import type { SeedSchool } from "./types";

const TZ_OFFSET_MIN = 330; // Asia/Kolkata

/** A moment `days` from today (school time), at hh:mm school time. */
function at(days: number, hh = 10, mm = 0) {
  const now = new Date(Date.now() + TZ_OFFSET_MIN * 60_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hh, mm) - TZ_OFFSET_MIN * 60_000);
}
const dob = (s: string) => new Date(`${s}T00:00:00Z`);

/** A one-page PDF, so a seeded paper opens like a real upload. */
function demoPdf(title: string, line: string) {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "-");
  const content = `BT /F1 20 Tf 60 760 Td (${esc(title)}) Tj ET\nBT /F1 12 Tf 60 730 Td (${esc(line)}) Tj ET\nBT /F1 10 Tf 60 700 Td (Demo copy for School OS. Not a real document.) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

type EnquirySeed = {
  child: string; parent: string; phone: string; cls: string; source: string; status: string;
  ago: number; follow?: [number, number, number] | null; action?: string; owner?: "counsellor" | "frontdesk";
  lost?: string; campaign?: boolean; notes?: string; current?: boolean; email?: string; referredBy?: string; currentSchool?: string;
  calls?: [number, string, string][];
};

// Sunrise Public School: admissions for 2027-28, plus a few mid-year ones for this year.
const SPS_ENQUIRIES: EnquirySeed[] = [
  { child: "Aarohi Bansal", parent: "Nikhil Bansal", phone: "9845012301", cls: "Nursery", source: "walk-in", status: "new", ago: 0, follow: [0, 16, 30], action: "Call to book a campus visit" },
  { child: "Krish Malhotra", parent: "Pooja Malhotra", phone: "9845012302", cls: "Class 1", source: "website", status: "new", ago: 1, follow: [-1, 11, 0], action: "First call", email: "pooja.malhotra@example.com" },
  { child: "Ira Choudhary", parent: "Sameer Choudhary", phone: "9845012303", cls: "LKG", source: "whatsapp", status: "contacted", ago: 3, follow: [0, 11, 30], action: "Share fee details", calls: [[2, "Talked", "Asked about bus to Kondapur. Sent fee structure on WhatsApp."]] },
  { child: "Dhruv Agarwal", parent: "Ritu Agarwal", phone: "9845012304", cls: "Class 4", source: "referral", status: "visit-scheduled", ago: 6, follow: [1, 10, 0], action: "Campus visit at 10 AM", referredBy: "Mrs. Anjali Rao (parent of Class 6 B)", calls: [[5, "Talked", "Wants to see the science labs. Visit booked."]] },
  { child: "Avni Saxena", parent: "Gaurav Saxena", phone: "9845012305", cls: "Class 6", source: "campaign", status: "visited", ago: 9, follow: [-2, 15, 0], action: "Ask if they will apply", campaign: true, currentSchool: "Kendriya Vidyalaya, Gachibowli", calls: [[4, "Talked", "Liked the campus. Discussing with family."]] },
  { child: "Yash Pillai", parent: "Deepa Pillai", phone: "9845012306", cls: "UKG", source: "phone", status: "contacted", ago: 4, follow: [0, 17, 0], action: "Call back after 5 PM", calls: [[3, "No answer", ""], [2, "Talked", "Father travels; mother will decide by Friday."]] },
  { child: "Riya Ghosh", parent: "Arindam Ghosh", phone: "9845012307", cls: "Class 8", source: "campaign", status: "application-given", ago: 9, follow: [2, 11, 0], action: "Collect filled form", campaign: true, currentSchool: "Delhi Public School, Nacharam" },
  { child: "Shaurya Bhatt", parent: "Kavya Bhatt", phone: "9845012308", cls: "Class 2", source: "walk-in", status: "visited", ago: 12, follow: [-3, 12, 0], action: "Tell them Class 2 is full; offer waiting list" },
  { child: "Tara Nambiar", parent: "Vivek Nambiar", phone: "9845012309", cls: "Nursery", source: "website", status: "new", ago: 0, follow: [1, 11, 0], action: "First call", email: "vivek.nambiar@example.com" },
  { child: "Aditi Rane", parent: "Sunil Rane", phone: "9845012310", cls: "Class 3", source: "campaign", status: "contacted", ago: 9, follow: [5, 10, 30], action: "Invite to entrance test", campaign: true },
  { child: "Om Prakash", parent: "Rekha Prakash", phone: "9845012311", cls: "Class 5", source: "phone", status: "contacted", ago: 7, follow: [0, 14, 0], action: "Confirm visit date", owner: "frontdesk" },
  { child: "Meher Sethi", parent: "Harpreet Sethi", phone: "9845012312", cls: "LKG", source: "referral", status: "visit-scheduled", ago: 5, follow: [3, 16, 0], action: "Campus visit", referredBy: "Staff: Kavitha Nair" },
  { child: "Neil D'Souza", parent: "Maria D'Souza", phone: "9845012313", cls: "Class 9", source: "website", status: "contacted", ago: 15, follow: [-1, 16, 0], action: "Send Class 9 syllabus", email: "maria.dsouza@example.com", currentSchool: "St. Ann's High School" },
  { child: "Ananya Murthy", parent: "Kiran Murthy", phone: "9845012314", cls: "Class 7", source: "campaign", status: "visited", ago: 9, follow: [7, 11, 0], action: "Follow up after Diwali", campaign: true },
  { child: "Vivaan Jain", parent: "Sonal Jain", phone: "9845012315", cls: "Class 1", source: "walk-in", status: "new", ago: 2, follow: [0, 12, 30], action: "Call to explain Class 1 seats" },
  { child: "Prisha Hegde", parent: "Raghav Hegde", phone: "9845012316", cls: "UKG", source: "whatsapp", status: "contacted", ago: 1, follow: [2, 10, 0], action: "Send prospectus PDF" },
  // Closed: lost
  { child: "Aryan Kohli", parent: "Mohit Kohli", phone: "9845012317", cls: "Class 6", source: "walk-in", status: "lost", ago: 30, lost: "fees", notes: "Found a school with lower fees near Miyapur." },
  { child: "Sia Arora", parent: "Neha Arora", phone: "9845012318", cls: "LKG", source: "campaign", status: "lost", ago: 9, lost: "distance", campaign: true },
  { child: "Kian Mehta", parent: "Rahul Mehta", phone: "9845012319", cls: "Class 2", source: "phone", status: "lost", ago: 21, lost: "no-seat" },
  { child: "Ishita Rawat", parent: "Manoj Rawat", phone: "9845012320", cls: "Class 4", source: "website", status: "lost", ago: 18, lost: "not-reachable", calls: [[17, "No answer", ""], [15, "Switched off", ""], [12, "No answer", ""]] },
  { child: "Laksh Tiwari", parent: "Shweta Tiwari", phone: "9845012321", cls: "Class 8", source: "referral", status: "lost", ago: 40, lost: "other-school" },
  // Mid-year (this year)
  { child: "Hridaan Shetty", parent: "Prakash Shetty", phone: "9845012322", cls: "Class 4", source: "walk-in", status: "contacted", ago: 2, follow: [0, 15, 30], action: "Family moved from Pune; check TC", current: true },
  { child: "Mira Fernandes", parent: "Joanna Fernandes", phone: "9845012323", cls: "Class 7", source: "phone", status: "new", ago: 1, follow: [-1, 10, 0], action: "First call", current: true },
];

type AppSeed = {
  first: string; last: string; dob: string; gender: "Male" | "Female"; cls: string; father: string; mother: string; phone: string; address: string;
  stage: string; ago: number; source?: string; prev?: string; prevClass?: string; marks?: string; online?: boolean; current?: boolean;
  docs?: "all" | "some" | "received" | "missing"; fee?: boolean; consent?: boolean; test?: number | "booked" | null; interview?: "RECOMMENDED" | "NOT_RECOMMENDED" | "HOLD" | "booked" | null;
  remarks?: string; rank?: number; offer?: boolean; transport?: string; language?: string; category?: string; occupation?: string; email?: string;
};

const ADDRESSES = [
  "Plot 12, Road No. 3, Kavuri Hills, Madhapur, Hyderabad 500081",
  "Flat 402, My Home Avatar, Narsingi, Hyderabad 500075",
  "H.No. 8-2-293, Road No. 10, Jubilee Hills, Hyderabad 500033",
  "Villa 27, Aparna Western Meadows, Kondapur, Hyderabad 500084",
  "Flat 1104, Rainbow Vistas, Moosapet, Hyderabad 500018",
  "H.No. 3-45, Sai Nagar Colony, Miyapur, Hyderabad 500049",
];

const SPS_APPS: AppSeed[] = [
  { first: "Ishaan", last: "Reddy", dob: "2023-06-14", gender: "Male", cls: "LKG", father: "Srikanth Reddy", mother: "Harini Reddy", phone: "9845013301", address: ADDRESSES[0], stage: "ADMITTED", ago: 24, docs: "all", fee: true, consent: true, source: "walk-in", transport: "Kavuri Hills", language: "Telugu", occupation: "Software engineer" },
  { first: "Myra", last: "Kapoor", dob: "2019-11-02", gender: "Female", cls: "Class 3", father: "Anuj Kapoor", mother: "Ritika Kapoor", phone: "9845013302", address: ADDRESSES[1], stage: "ADMITTED", ago: 28, docs: "all", fee: true, consent: true, prev: "Oakridge International, Gachibowli", prevClass: "Class 2", marks: "A grade", test: 88, source: "website", language: "Hindi", email: "ritika.kapoor@example.com" },
  { first: "Vihaan", last: "Gupta", dob: "2016-08-21", gender: "Male", cls: "Class 6", father: "Rajesh Gupta", mother: "Sneha Gupta", phone: "9845013303", address: ADDRESSES[2], stage: "APPROVED", ago: 20, docs: "all", fee: true, consent: true, prev: "Bharatiya Vidya Bhavan", prevClass: "Class 5", marks: "86%", test: 79, interview: "RECOMMENDED", offer: true, remarks: "Good test score and interview. Approved for Class 6.", source: "campaign", language: "Hindi" },
  { first: "Anaya", last: "Iyer", dob: "2024-01-09", gender: "Female", cls: "Nursery", father: "Karthik Iyer", mother: "Lavanya Iyer", phone: "9845013304", address: ADDRESSES[3], stage: "APPROVED", ago: 16, docs: "some", fee: true, consent: true, remarks: "Approved. Birth certificate original to be shown.", source: "referral", transport: "Kondapur", language: "Tamil" },
  { first: "Kabir", last: "Joshi", dob: "2019-05-30", gender: "Male", cls: "Class 2", father: "Amit Joshi", mother: "Priyanka Joshi", phone: "9845013305", address: ADDRESSES[4], stage: "WAITING_LIST", ago: 19, docs: "all", fee: true, consent: true, prev: "Little Flower School", prevClass: "Class 1", test: 84, rank: 1, source: "walk-in" },
  { first: "Sara", last: "Thomas", dob: "2019-09-12", gender: "Female", cls: "Class 2", father: "Jacob Thomas", mother: "Anita Thomas", phone: "9845013306", address: ADDRESSES[5], stage: "WAITING_LIST", ago: 17, docs: "all", fee: true, consent: true, prev: "St. Joseph's Convent", prevClass: "Class 1", test: 78, rank: 2, source: "campaign" },
  { first: "Reyansh", last: "Nair", dob: "2019-03-03", gender: "Male", cls: "Class 2", father: "Vinod Nair", mother: "Shalini Nair", phone: "9845013307", address: ADDRESSES[0], stage: "WAITING_LIST", ago: 15, docs: "all", fee: true, consent: true, prev: "Chirec Public School", prevClass: "Class 1", test: 71, rank: 3, source: "phone" },
  { first: "Diya", last: "Patel", dob: "2018-02-17", gender: "Female", cls: "Class 4", father: "Hitesh Patel", mother: "Krupa Patel", phone: "9845013308", address: ADDRESSES[1], stage: "DECISION", ago: 13, docs: "all", fee: true, consent: true, prev: "Meridian School", prevClass: "Class 3", marks: "91%", test: 82, source: "website", language: "Hindi", category: "General" },
  { first: "Arjun", last: "Verma", dob: "2014-07-25", gender: "Male", cls: "Class 8", father: "Sanjay Verma", mother: "Alka Verma", phone: "9845013309", address: ADDRESSES[2], stage: "DECISION", ago: 14, docs: "all", fee: true, consent: true, prev: "Kendriya Vidyalaya, Bolarum", prevClass: "Class 7", marks: "74%", test: 64, interview: "HOLD", source: "referral" },
  { first: "Saanvi", last: "Rao", dob: "2019-12-08", gender: "Female", cls: "Class 2", father: "Pradeep Rao", mother: "Madhavi Rao", phone: "9845013310", address: ADDRESSES[3], stage: "TEST_INTERVIEW", ago: 8, docs: "all", fee: true, consent: true, prev: "Glendale Academy", prevClass: "Class 1", test: "booked", source: "campaign" },
  { first: "Advik", last: "Menon", dob: "2015-04-19", gender: "Male", cls: "Class 7", father: "Rohit Menon", mother: "Sruthi Menon", phone: "9845013311", address: ADDRESSES[4], stage: "TEST_INTERVIEW", ago: 10, docs: "all", fee: true, consent: true, prev: "Gitanjali School", prevClass: "Class 6", marks: "82%", test: 76, interview: "booked", source: "walk-in" },
  { first: "Kiara", last: "Singh", dob: "2022-10-27", gender: "Female", cls: "UKG", father: "Manpreet Singh", mother: "Simran Kaur", phone: "9845013312", address: ADDRESSES[5], stage: "DOCUMENTS", ago: 6, docs: "received", fee: true, consent: true, source: "whatsapp", transport: "Miyapur" },
  { first: "Aditya", last: "Kulkarni", dob: "2016-12-01", gender: "Male", cls: "Class 5", father: "Mahesh Kulkarni", mother: "Swati Kulkarni", phone: "9845013313", address: ADDRESSES[0], stage: "DOCUMENTS", ago: 5, docs: "missing", fee: false, consent: true, prev: "Sri Chaitanya Techno School", prevClass: "Class 4", source: "phone", language: "Marathi" },
  { first: "Pari", last: "Desai", dob: "2013-01-22", gender: "Female", cls: "Class 9", father: "Nilesh Desai", mother: "Hetal Desai", phone: "9845013314", address: ADDRESSES[1], stage: "REVIEWED", ago: 3, docs: "missing", fee: true, consent: true, prev: "Silver Oaks International", prevClass: "Class 8", marks: "88%", source: "website" },
  { first: "Atharv", last: "Mishra", dob: "2019-08-05", gender: "Male", cls: "Class 2", father: "Alok Mishra", mother: "Nidhi Mishra", phone: "9845013315", address: ADDRESSES[2], stage: "SUBMITTED_ONLINE", ago: 1, online: true, docs: "missing", fee: false, consent: true, prev: "Kangaroo Kids", prevClass: "Class 1", email: "nidhi.mishra@example.com" },
  { first: "Navya", last: "Krishnan", dob: "2023-03-11", gender: "Female", cls: "LKG", father: "Arun Krishnan", mother: "Divya Krishnan", phone: "9845013316", address: ADDRESSES[3], stage: "SUBMITTED", ago: 0, docs: "missing", fee: false, consent: false, source: "walk-in" },
  { first: "Rohan", last: "Das", dob: "2016-06-16", gender: "Male", cls: "Class 6", father: "Subhash Das", mother: "Moumita Das", phone: "9845013317", address: ADDRESSES[4], stage: "REJECTED", ago: 22, docs: "all", fee: true, consent: true, prev: "Holy Cross School", prevClass: "Class 5", marks: "48%", test: 38, remarks: "Test score well below the Class 6 level. Family told they can apply again next year.", source: "walk-in" },
  { first: "Zara", last: "Khan", dob: "2018-10-04", gender: "Female", cls: "Class 3", father: "Imran Khan", mother: "Ayesha Khan", phone: "9845013318", address: ADDRESSES[5], stage: "WITHDRAWN", ago: 25, docs: "some", fee: true, consent: true, prev: "Johnson Grammar School", prevClass: "Class 2", remarks: "Family is moving to Bengaluru in March.", source: "phone" },
  { first: "Tanvi", last: "Bhat", dob: "2017-09-28", gender: "Female", cls: "Class 4", father: "Ganesh Bhat", mother: "Shruti Bhat", phone: "9845013319", address: ADDRESSES[0], stage: "DOCUMENTS", ago: 4, docs: "received", fee: true, consent: true, prev: "Vidyashilp Academy, Bengaluru", prevClass: "Class 4", current: true, source: "walk-in" },
];

const GVS_ENQUIRIES: EnquirySeed[] = [
  { child: "Harsha Vardhan", parent: "Ramesh Goud", phone: "9849022401", cls: "Class 1", source: "walk-in", status: "new", ago: 0, follow: [0, 15, 0], action: "Call back" },
  { child: "Sravya Reddy", parent: "Venkat Reddy", phone: "9849022402", cls: "Class 3", source: "phone", status: "contacted", ago: 3, follow: [-1, 11, 0], action: "Share fee details" },
  { child: "Manideep", parent: "Laxmi Bai", phone: "9849022403", cls: "Class 6", source: "referral", status: "visited", ago: 6, follow: [2, 10, 0], action: "Ask if they will apply" },
  { child: "Pranav Teja", parent: "Srinivas Rao", phone: "9849022404", cls: "Class 2", source: "walk-in", status: "lost", ago: 12, lost: "distance" },
];

const GVS_APPS: AppSeed[] = [
  { first: "Lasya", last: "Priya", dob: "2018-05-12", gender: "Female", cls: "Class 3", father: "Ravi Kumar", mother: "Sujatha", phone: "9849023401", address: "H.No. 2-7-45, Hanamkonda, Warangal 506001", stage: "DOCUMENTS", ago: 4, docs: "received", consent: true, prev: "ZPHS Kazipet", prevClass: "Class 2" },
  { first: "Charan", last: "Raj", dob: "2015-01-30", gender: "Male", cls: "Class 6", father: "Mallesh", mother: "Padma", phone: "9849023402", address: "H.No. 5-1-12, Subedari, Warangal 506002", stage: "SUBMITTED", ago: 1, docs: "missing", consent: false, prev: "Government School, Hasanparthy", prevClass: "Class 5" },
];

async function login(username: string, name: string, phone: string, hash: string) {
  const found = await prisma.userLogin.findUnique({ where: { username } });
  if (found) return found.id;
  const u = await prisma.userLogin.create({ data: { username, displayName: name, phone, status: "ACTIVE", passwordHash: hash, passwordChangedAt: new Date() } });
  return u.id;
}

export async function seedAdmission(school: SeedSchool) {
  const { schoolId, campusId } = school;
  const principalId = school.users.principal;
  if (!principalId) return;
  const sys: SchoolContext = { schoolId, userId: null };

  // Two admission-team logins for Sunrise: an Admission Counsellor (full) and the front desk (own enquiries).
  if (school.full) {
    const password = process.env.DEMO_PASSWORD;
    if (!password) throw new Error("Set DEMO_PASSWORD in .env first.");
    const hash = await hashPassword(password);
    school.users.counsellor = await login("counsellor", "Divya Menon", "9876500006", hash);
    school.users.frontdesk = await login("frontdesk", "Naresh Kumar", "9876500007", hash);
    await withSchool(sys, async (tx) => {
      await tx.role.updateMany({ where: { key: "admission-counsellor" }, data: { isEnabled: true } });
      for (const [username, roleKey, staffName] of [["counsellor", "admission-counsellor", "Divya Menon"], ["frontdesk", "receptionist", "Naresh Kumar"]] as const) {
        const userId = school.users[username];
        const role = await tx.role.findFirstOrThrow({ where: { key: roleKey } });
        if (!(await tx.schoolAccess.findFirst({ where: { userLoginId: userId } }))) {
          await tx.schoolAccess.create({ data: { schoolId, userLoginId: userId, roles: { create: [{ roleId: role.id, schoolId }] } } });
        }
        await tx.staff.updateMany({ where: { fullName: staffName, userLoginId: null }, data: { userLoginId: userId } });
      }
    });
  }

  const ctx: SchoolContext = { schoolId, userId: principalId };
  const base = await withSchool(ctx, async (tx) => {
    const classes = await tx.schoolClass.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } });
    const current = await tx.academicYear.findUniqueOrThrow({ where: { id: school.yearId } });
    const upcoming = await tx.academicYear.findFirst({ where: { status: "UPCOMING" }, orderBy: { startDate: "asc" } });
    const staff = await tx.staff.findMany({ where: { archivedAt: null }, select: { id: true, fullName: true, userLoginId: true } });
    const staffOf = (userId?: string) => staff.find((s) => s.userLoginId && s.userLoginId === userId)?.id ?? null;
    const principalStaff = staffOf(principalId);
    const counsellor = staffOf(school.users.counsellor) ?? principalStaff;
    const frontdesk = staffOf(school.users.frontdesk) ?? counsellor;

    // The upcoming year's sections, copied from this year (Sunrise only), so admissions open for 2027-28.
    if (school.full && upcoming && (await tx.section.count({ where: { academicYearId: upcoming.id } })) === 0) {
      const now = await tx.section.findMany({ where: { academicYearId: current.id, archivedAt: null }, orderBy: { name: "asc" } });
      const class1 = classes.find((c) => c.name === "Class 1");
      const class2 = classes.find((c) => c.name === "Class 2");
      // Class 2 is full for new joiners: its seats equal the Class 1 students moving up (shows the waiting list).
      const moving = class1 ? await tx.enrolment.count({ where: { academicYearId: current.id, classId: class1.id, status: "STUDYING", archivedAt: null } }) : 0;
      const class2Sections = now.filter((s) => s.classId === class2?.id);
      for (const s of now) {
        let seats = s.seats;
        if (s.classId === class2?.id) {
          const k = class2Sections.indexOf(s);
          seats = Math.floor(moving / class2Sections.length) + (k < moving % class2Sections.length ? 1 : 0);
        }
        await tx.section.create({ data: { schoolId, classId: s.classId, academicYearId: upcoming.id, name: s.name, seats, room: s.room, createdById: principalId } });
      }
    }

    const owners = new Map<string, string | null>();
    for (const c of classes) owners.set(c.id, ["Nursery", "LKG", "UKG"].includes(c.name) ? frontdesk : counsellor);
    const stages = [
      { key: "enquiry", label: "Enquiry", on: true },
      { key: "application", label: "Application", on: true },
      { key: "documents", label: "Documents", on: true },
      { key: "payment", label: "Application fee", on: true },
      { key: "test", label: "Test", on: school.full },
      { key: "interview", label: "Interview", on: school.full },
      { key: "decision", label: "Decision", on: true, needsApproval: true },
      { key: "admitted", label: "Admitted", on: true },
    ];
    await loadSettings(tx, ctx);
    await tx.admissionSetting.update({
      where: { schoolId },
      data: {
        stages: stages as unknown as Prisma.InputJsonValue,
        ownerRule: school.full ? "class" : "default", defaultOwnerStaffId: counsellor,
        testsOn: school.full, interviewsOn: school.full, onlineOn: true, applicationFeeOn: school.full, offerLettersOn: school.full, campaignsOn: school.full,
        siblingPriorityOn: true, waitingListOn: true,
        facts: school.full
          ? "Admissions for 2027-28 are open from Nursery to Class 9.\nApplication fee: Rs 500 up to Class 5, Rs 750 from Class 6.\nEntrance test for Class 2 and above, on Saturdays at 10 AM.\nCampus visits: Monday to Saturday, 9 AM to 1 PM.\nPapers: birth certificate, photo, address proof, parent ID; TC and marksheet from Class 2.\nSchool buses cover Madhapur, Kondapur, Miyapur, Kavuri Hills and Narsingi.\nAdmission office: 040 2345 6789."
          : "Admissions open for Class 1 to Class 8. Office hours 9 AM to 4 PM.",
        updatedById: principalId,
      },
    });
    for (const c of classes) {
      const small = c.sortOrder <= classes.find((x) => x.name === "Class 5")!.sortOrder;
      await tx.admissionClassRule.upsert({
        where: { schoolId_classId: { schoolId, classId: c.id } },
        create: {
          schoolId, classId: c.id,
          documents: defaultDocsFor(c.sortOrder >= (classes.find((x) => x.name === "Class 2")?.sortOrder ?? 99)) as unknown as Prisma.InputJsonValue,
          feePaise: school.full ? BigInt(small ? 50000 : 75000) : null, onlineOpen: c.name !== "Class 10",
          ownerStaffId: school.full ? owners.get(c.id) ?? null : null, updatedById: principalId,
        },
        update: {},
      });
    }
    return { classes, current, upcoming: school.full ? upcoming : null, counsellor, frontdesk, principalStaff, owners };
  });

  const classId = (name: string) => base.classes.find((c) => c.name === name)!.id;
  const admissionYear = base.upcoming ?? base.current;
  const viewer: Viewer = { userId: principalId, see: "all", change: "all", staffId: base.principalStaff, restricted: true, overCapacity: true, roleKeys: ["principal"], campusId: null };

  // Campaign
  const campaignId = school.full ? await withSchool(ctx, async (tx) => (await tx.admissionCampaign.create({
    data: { schoolId, name: "Open House - October 2026", channel: "whatsapp", message: "Dear parent, Sunrise Public School invites you to our Open House this Saturday, 10 AM to 1 PM. Meet the teachers, see the labs and the library, and get your child's admission questions answered. Reply YES to book a slot.", sentCount: 14, skipped: 1, sentAt: at(-9, 18, 0), createdAt: at(-9, 17, 40), createdById: principalId },
  })).id) : null;

  // Enquiries
  const enquiryIds = new Map<string, string>();
  await withSchool(ctx, async (tx) => {
    for (const e of school.full ? SPS_ENQUIRIES : GVS_ENQUIRIES) {
      const created = at(-e.ago, 9 + (e.phone.charCodeAt(9) % 7), (e.phone.charCodeAt(8) % 4) * 15);
      const owner = e.owner === "frontdesk" ? base.frontdesk : school.full ? base.owners.get(classId(e.cls)) ?? base.counsellor : base.counsellor;
      const closed = ["lost", "applied", "admitted"].includes(e.status);
      const row = await tx.enquiry.create({
        data: {
          enquiryNo: await nextEnquiryNo(tx, ctx),
          schoolId, campusId, academicYearId: e.current ? base.current.id : admissionYear.id,
          childName: e.child, parentName: e.parent, phone: e.phone, email: e.email ?? null, classId: classId(e.cls),
          source: e.source, firstSource: e.source, status: e.status, ownerStaffId: owner,
          nextFollowUpAt: !closed && e.follow ? at(e.follow[0], e.follow[1], e.follow[2]) : null, nextAction: !closed ? e.action ?? null : null,
          currentSchool: e.currentSchool ?? null, referredBy: e.referredBy ?? null, notes: e.notes ?? null,
          lostReason: e.lost ?? null, lostNote: e.lost ? e.notes ?? null : null, closedAt: e.status === "lost" ? at(-Math.max(0, e.ago - 3), 16, 0) : null,
          campaignId: e.campaign ? campaignId : null, createdById: e.source === "walk-in" && e.owner === "frontdesk" ? school.users.frontdesk ?? principalId : principalId,
          createdAt: created,
        },
      });
      enquiryIds.set(e.phone, row.id);
      const act = (kind: string, text: string, when: Date, extra: Partial<Prisma.EnquiryActivityUncheckedCreateInput> = {}) =>
        tx.enquiryActivity.create({ data: { schoolId, enquiryId: row.id, kind, text, at: when, byId: principalId, ...extra } });
      await act("created", `Enquiry added (${e.source.replace("-", " ")}) for ${e.cls}.`, created);
      if (e.campaign) await act("campaign", "Sent the campaign \"Open House - October 2026\" on WhatsApp.", at(-9, 18, 0));
      for (const [daysAgo, outcome, note] of e.calls ?? []) {
        await act("call", note ? `Outgoing call: ${outcome}. ${note}` : `Outgoing call: ${outcome}.`, at(-daysAgo, 11, 15), { direction: "outgoing", outcome });
      }
      if (e.status !== "new" && !closed) await act("status", `Status changed to ${e.status.replace(/-/g, " ")}.`, at(-Math.max(0, e.ago - 1), 12, 0), { data: { to: e.status } });
      if (!closed && e.follow) await act("follow-up", `Next follow-up set${e.action ? `: ${e.action}` : ""}.`, at(-Math.max(0, e.ago - 1), 12, 5));
      if (e.status === "lost") await act("lost", `Closed as lost: ${e.lost}.${e.notes ? ` ${e.notes}` : ""}`, at(-Math.max(0, e.ago - 3), 16, 0), { data: { reason: e.lost ?? null } });
    }
  });

  // Applications: made through the normal Add application step, then moved along.
  const pdfFor = (title: string, child: string) => new File([new Uint8Array(demoPdf(title, `Child: ${child}`))], `${title.toLowerCase().replace(/\s+/g, "-")}.pdf`, { type: "application/pdf" });
  const appIds: { seed: AppSeed; id: string }[] = [];
  for (const a of school.full ? SPS_APPS : GVS_APPS) {
    const id = await withSchool(ctx, async (tx) => {
      const s = await loadSettings(tx, ctx);
      const year = a.current ? base.current : admissionYear;
      // The family's enquiry first (counter applications come from an enquiry).
      let enquiryId: string | null = null;
      if (!a.online) {
        const e = await tx.enquiry.create({
          data: {
            enquiryNo: await nextEnquiryNo(tx, ctx),
            schoolId, campusId, academicYearId: year.id, childName: `${a.first} ${a.last}`, parentName: a.father, phone: a.phone, classId: classId(a.cls),
            source: a.source ?? "walk-in", firstSource: a.source ?? "walk-in", status: "application-given", ownerStaffId: school.full ? base.owners.get(classId(a.cls)) ?? null : base.counsellor,
            campaignId: a.source === "campaign" ? campaignId : null, createdById: principalId, createdAt: at(-a.ago - 4, 11, 0),
          },
        });
        await tx.enquiryActivity.create({ data: { schoolId, enquiryId: e.id, kind: "created", text: `Enquiry added (${(a.source ?? "walk-in").replace("-", " ")}) for ${a.cls}.`, at: at(-a.ago - 4, 11, 0), byId: principalId } });
        enquiryId = e.id;
      }
      const input: ApplicationInput = {
        classId: classId(a.cls), yearId: year.id, firstName: a.first, lastName: a.last, dateOfBirth: dob(a.dob), gender: a.gender,
        fatherName: a.father, motherName: a.mother, guardianName: null, guardianRelation: null, phone: a.phone, altPhone: null, email: a.email ?? null,
        address: a.address, previousSchool: a.prev ?? null, previousClass: a.prevClass ?? null, previousMarks: a.marks ?? null,
        preferences: { secondLanguage: a.language ?? null, transportNeeded: Boolean(a.transport), transportStop: a.transport ?? null, hostelNeeded: false },
        category: a.category ?? null, religion: null, motherTongue: a.language ?? null, occupation: a.occupation ?? null, aadhaar: null,
      };
      const app = await createApplication(tx, ctx, null, s, input, { campusId, channel: a.online ? "online" : "counter", enquiryId, force: true });
      const created = at(-a.ago, 11, 30);
      await tx.application.update({ where: { id: app.id }, data: { createdAt: created } });
      await tx.applicationActivity.updateMany({ where: { applicationId: app.id }, data: { at: created } });
      if (enquiryId) await tx.enquiryActivity.updateMany({ where: { enquiryId, kind: "application" }, data: { at: created } });
      return app.id;
    });
    appIds.push({ seed: a, id });
  }

  // Papers, consent and the application fee.
  for (const { seed: a, id } of appIds) {
    await withSchool(ctx, async (tx) => {
      const child = `${a.first} ${a.last}`;
      const docs = await tx.applicationDocument.findMany({ where: { applicationId: id }, orderBy: { docType: "asc" } });
      const required = docs.filter((d) => d.required);
      const upTo = a.docs === "all" ? docs.length : a.docs === "some" ? Math.max(1, required.length - 1) : a.docs === "received" ? required.length : a.stage === "SUBMITTED" ? 0 : 2;
      for (const [i, d] of docs.entries()) {
        if (i >= upTo || (!d.required && a.docs !== "all")) continue;
        const stored = await saveFile(tx, ctx, { file: pdfFor(d.docType.replace(/-/g, " "), child), purpose: "admission-document", allowed: DOCUMENT_TYPES });
        const when = at(-a.ago + (a.ago > 2 ? 1 : 0), 12, 10 + i);
        const verified = a.docs === "all" || (a.docs === "some" && i < upTo - 1) || (a.docs === "received" && i === 0);
        const rejected = a.docs === "received" && i === 1 && a.stage === "DOCUMENTS" && school.full && a.cls === "UKG";
        await tx.applicationDocument.update({
          where: { id: d.id },
          data: {
            fileId: stored.id, uploadedById: principalId, uploadedAt: when,
            status: rejected ? "REJECTED" : verified ? "VERIFIED" : "RECEIVED", rejectReason: rejected ? "The photo is blurred. Please upload a clear copy." : null,
            verifiedAt: verified ? when : null, verifiedById: verified ? principalId : null, originalSeen: verified && i % 2 === 0,
          },
        });
        await tx.applicationActivity.create({ data: { schoolId, applicationId: id, kind: "document", text: `${d.docType.replace(/-/g, " ")} uploaded${verified ? " and verified" : rejected ? " and rejected: the photo is blurred" : ""}.`, at: when, byId: principalId } });
      }
      if (a.consent) {
        for (const consentType of ["data-processing", "photo"]) {
          await tx.admissionConsent.create({ data: { schoolId, applicationId: id, consentType, version: 1, givenByName: a.father, phone: a.phone, howGiven: a.online ? "admission-form-online" : "admission-form-counter", givenAt: at(-a.ago, 11, 35), otpVerifiedAt: at(-a.ago, 11, 36) } });
        }
      }
      if (a.fee && school.full) {
        const app = await tx.application.findUniqueOrThrow({ where: { id } });
        if (app.feeDuePaise) {
          const p = await recordCounterPayment(tx, ctx, viewer, id, { amountPaise: app.feeDuePaise, mode: a.ago % 2 ? "upi" : "cash", reference: a.ago % 2 ? `UPI${String(412000000 + a.ago * 7919).slice(0, 9)}` : null });
          await tx.applicationFeePayment.update({ where: { id: p.id }, data: { confirmedAt: at(-a.ago, 11, 45), createdAt: at(-a.ago, 11, 45) } });
          await tx.applicationActivity.updateMany({ where: { applicationId: id, kind: "fee" }, data: { at: at(-a.ago, 11, 45) } });
        }
      }
    });
  }

  // Tests and interviews (Sunrise).
  if (school.full) {
    await withSchool(ctx, async (tx) => {
      const past = await tx.admissionTest.create({ data: { schoolId, academicYearId: admissionYear.id, title: "Entrance test - Classes 2 to 9 (Round 1)", startsAt: at(-6, 10, 0), venue: "Exam hall, Block B", maxMarks: 100, createdById: principalId, createdAt: at(-12, 10, 0) } });
      const next = await tx.admissionTest.create({ data: { schoolId, academicYearId: admissionYear.id, title: "Entrance test - Classes 2 to 9 (Round 2)", startsAt: at(5, 10, 0), venue: "Exam hall, Block B", maxMarks: 100, createdById: principalId, createdAt: at(-3, 10, 0) } });
      for (const { seed: a, id } of appIds) {
        if (typeof a.test === "number") {
          await tx.admissionTestBooking.create({ data: { schoolId, testId: past.id, applicationId: id, marks: a.test, scoredById: principalId, scoredAt: at(-5, 15, 0), remarks: a.test >= 80 ? "Strong in maths and reading." : a.test < 50 ? "Struggled with reading comprehension." : null } });
          await tx.applicationActivity.create({ data: { schoolId, applicationId: id, kind: "test", text: `Entrance test score recorded: ${a.test} of 100.`, at: at(-5, 15, 0), byId: principalId } });
        } else if (a.test === "booked") {
          await tx.admissionTestBooking.create({ data: { schoolId, testId: next.id, applicationId: id } });
          await tx.applicationActivity.create({ data: { schoolId, applicationId: id, kind: "test", text: `Booked for the entrance test on ${next.startsAt.toISOString().slice(0, 10)}.`, at: at(-2, 12, 0), byId: principalId } });
        }
        if (a.interview && base.principalStaff) {
          const booked = a.interview === "booked";
          const slot = appIds.findIndex((x) => x.id === id) % 4;
          const when = booked ? at(1, 11, 15) : at(-4, 11, slot * 15);
          const outcome = booked ? null : a.interview as "RECOMMENDED" | "NOT_RECOMMENDED" | "HOLD";
          const notes = outcome === "RECOMMENDED" ? "Confident, answered well. Parents keen on the science programme." : outcome === "HOLD" ? "Shy in the interview; meet again with the class teacher." : null;
          await tx.interviewSlot.create({
            data: {
              schoolId, applicationId: id, interviewerStaffId: base.principalStaff, startsAt: when, minutes: 15, outcome, notes, createdById: principalId,
              history: outcome ? [{ at: at(-4, 11, 20).toISOString(), by: principalId, outcome, notes }] : [],
            },
          });
          await tx.applicationActivity.create({ data: { schoolId, applicationId: id, kind: "interview", text: booked ? "Interview booked with Lakshmi Rao." : `Interview outcome: ${outcome!.replace("_", " ").toLowerCase()}.`, at: booked ? at(-1, 15, 0) : at(-4, 11, 20), byId: principalId } });
        }
      }
    });
  }

  // Stages, decisions, the waiting list and admissions.
  for (const { seed: a, id } of appIds) {
    await withSchool(ctx, async (tx) => {
      const stage = a.stage as Prisma.ApplicationUncheckedUpdateInput["stage"];
      const reviewed = !["SUBMITTED", "SUBMITTED_ONLINE"].includes(a.stage);
      const decided = ["APPROVED", "REJECTED", "ADMITTED"].includes(a.stage);
      const decidedAt = at(-Math.max(1, a.ago - 8), 16, 0);
      await tx.application.update({
        where: { id },
        data: {
          stage: a.stage === "ADMITTED" ? "APPROVED" : a.stage === "DECISION" ? "TEST_INTERVIEW" : stage,
          reviewedAt: reviewed ? at(-a.ago + (a.ago > 1 ? 1 : 0), 15, 0) : null, reviewedById: reviewed ? principalId : null, reviewNote: reviewed ? "Form complete." : null,
          decidedAt: decided ? decidedAt : null, decidedById: decided ? principalId : null, decisionRemarks: decided ? a.remarks ?? "Approved." : null,
          waitingRank: a.rank ?? null, waitingSince: a.rank ? at(-6, 16, 0) : null, waitingReason: a.rank ? "Class 2 is full for 2027-28." : null,
          offerLetterNo: a.offer ? `SPS/OL/2027/${String(appIds.findIndex((x) => x.id === id) + 1).padStart(4, "0")}` : null, offerSentAt: a.offer ? at(-2, 17, 0) : null,
          withdrawnAt: a.stage === "WITHDRAWN" ? at(-10, 14, 0) : null, withdrawnReason: a.stage === "WITHDRAWN" ? a.remarks ?? null : null,
        },
      });
      const acts: [string, string, Date][] = [];
      if (reviewed) acts.push(["review", "Reviewed: form complete.", at(-a.ago + (a.ago > 1 ? 1 : 0), 15, 0)]);
      if (decided) acts.push(["decision", a.stage === "REJECTED" ? `Rejected: ${a.remarks}` : `Approved by Lakshmi Rao. ${a.remarks ?? ""}`.trim(), decidedAt]);
      if (a.rank) acts.push(["waiting-list", `Added to the waiting list at rank ${a.rank}: Class 2 is full for 2027-28.`, at(-6, 16, 0)]);
      if (a.offer) acts.push(["offer", "Offer letter sent on WhatsApp.", at(-2, 17, 0)]);
      if (a.stage === "WITHDRAWN") acts.push(["withdrawn", `Withdrawn: ${a.remarks}`, at(-10, 14, 0)]);
      for (const [kind, text, when] of acts) await tx.applicationActivity.create({ data: { schoolId, applicationId: id, kind, text, at: when, byId: principalId } });
      if (a.stage === "DECISION") {
        // Sent for the decision the normal way, so it waits in Approvals for the Principal.
        const s = await loadSettings(tx, ctx);
        await sendForDecision(tx, ctx, viewer, s, await tx.application.findUniqueOrThrow({ where: { id } }));
        await tx.applicationActivity.updateMany({ where: { applicationId: id, kind: "stage" }, data: { at: at(-2, 12, 0) } });
      }
      if (a.stage === "ADMITTED") {
        await confirmAdmission(tx, ctx, viewer, id, { sectionId: null, admissionDate: at(-a.ago + 6, 10, 0) });
        await tx.application.update({ where: { id }, data: { admittedAt: at(-a.ago + 6, 10, 30) } });
      }
    });
  }
}
