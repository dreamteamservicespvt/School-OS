// QA demo tenant for the real-school simulation:
//   "Chaitanya EM School — QA Demo" (school A) and "QA Isolation School B" (school B).
//
//   npx tsx --conditions=react-server --env-file=.env qa/seed-chaitanya.ts
//
// What a school sets up on its first day, before any daily work: the school,
// the academic year, classes and sections, subjects, periods, staff, leave
// types and a login for every role. Students are NOT made here: they come in
// through the real import screen, and daily work (fees, attendance, exams...)
// is done through the screens by the QA scripts.
//
// REAL PUBLIC SCHOOL INFORMATION (www.chaitanyaemschool.com, see
// /mnt/project-files/school-os/qa/school-profile.md): the school's name,
// Chekkapalli (Andhra Pradesh), English medium, Nursery to Grade 10, the public
// email, office hours, and the three leaders Nagaraju (Managing Director),
// Nagababu (Director) and Kesava (Principal).
// EVERYTHING ELSE IS SYNTHETIC DEMO DATA: staff, phone numbers, sections,
// subjects, periods, fees, buses and the hostel (the website states no hostel).
import { prisma, withSchool, type Tx } from "../src/lib/db";
import { createSchool } from "../src/lib/schools";
import { hashPassword } from "../src/lib/auth/password";
import { nextNumber, formatNumber } from "../src/lib/sequences";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const PASSWORD = process.env.DEMO_PASSWORD;

// LKG and UKG are not named on the website: DEMO classes, labelled as such in the class "level".
const CLASSES = [
  { name: "Nursery", level: "Stage 1 Foundation", sections: ["A"] },
  { name: "LKG", level: "Stage 1 Foundation (DEMO class)", sections: ["A"] },
  { name: "UKG", level: "Stage 1 Foundation (DEMO class)", sections: ["A"] },
  ...[1, 2, 3].map((g) => ({ name: `Grade ${g}`, level: "Stage 1 Foundation", sections: ["A", "B"] })),
  ...[4, 5, 6, 7].map((g) => ({ name: `Grade ${g}`, level: "Stage 2 LEAD", sections: ["A", "B"] })),
  ...[8, 9, 10].map((g) => ({ name: `Grade ${g}`, level: "Stage 3 IIT Foundation", sections: ["A", "B"] })),
];

// DEMO curriculum configuration. idx: 0 Nursery .. 12 Grade 10.
const SUBJECTS = [
  { code: "ENG", name: "English", from: 0, to: 12, ppw: 6 },
  { code: "TEL", name: "Telugu", from: 3, to: 12, ppw: 5 },
  { code: "MAT", name: "Mathematics", from: 0, to: 12, ppw: 7 },
  { code: "EVS", name: "Environmental Studies", from: 0, to: 2, ppw: 4 },
  { code: "SCI", name: "Science", from: 3, to: 9, ppw: 5 },
  { code: "PHY", name: "Physics", from: 10, to: 12, ppw: 4 },
  { code: "CHE", name: "Chemistry", from: 10, to: 12, ppw: 4 },
  { code: "BIO", name: "Biology", from: 10, to: 12, ppw: 4 },
  { code: "SST", name: "Social Studies", from: 3, to: 12, ppw: 4 },
  { code: "CMP", name: "Computer / Digital Learning", from: 3, to: 12, ppw: 2, type: "OPTIONAL" },
  { code: "FMA", name: "Foundation Mathematics", from: 8, to: 12, ppw: 2, type: "OPTIONAL" },
  { code: "FPH", name: "Foundation Physics", from: 10, to: 12, ppw: 1, type: "OPTIONAL" },
  { code: "FCH", name: "Foundation Chemistry", from: 10, to: 12, ppw: 1, type: "OPTIONAL" },
] as const;

const PERIODS = [
  { n: 1, s: "09:15", e: "09:55" }, { n: 2, s: "09:55", e: "10:35" }, { n: 0, s: "10:35", e: "10:50", label: "Short break" },
  { n: 3, s: "10:50", e: "11:30" }, { n: 4, s: "11:30", e: "12:10" }, { n: -1, s: "12:10", e: "12:50", label: "Lunch" },
  { n: 5, s: "12:50", e: "13:30" }, { n: 6, s: "13:30", e: "14:10" }, { n: 7, s: "14:10", e: "14:50" }, { n: 8, s: "14:50", e: "15:30" },
];

type P = { first: string; last?: string; designation: string; dept: string; type?: "Teaching" | "Non-teaching"; subjects?: string[]; login?: string; role?: string; real?: boolean };
// Logins: cems.<role>. Every role gets its own login (05-roles.md ready roles and templates).
const PEOPLE: P[] = [
  // REAL PUBLIC INFORMATION (names and titles only; phone numbers below are synthetic).
  { first: "Nagaraju", designation: "Managing Director", dept: "Administration", type: "Non-teaching", real: true },
  { first: "Nagababu", designation: "Director", dept: "Administration", type: "Non-teaching", real: true },
  { first: "Kesava", designation: "Principal", dept: "Administration", type: "Teaching", login: "cems.principal", role: "principal", real: true },
  // SYNTHETIC DEMO STAFF from here on.
  { first: "Demo Harika", last: "Vadde", designation: "Vice Principal", dept: "Administration", type: "Teaching", subjects: ["ENG"], login: "cems.viceprincipal", role: "vice-principal" },
  { first: "Demo Raghu", last: "Kondeti", designation: "Academic Head", dept: "Administration", type: "Teaching", subjects: ["MAT"], login: "cems.academichead", role: "academic-head" },
  { first: "Demo Sravani", last: "Pulla", designation: "Office Administrator", dept: "Administration", type: "Non-teaching", login: "cems.admin", role: "school-admin" },
  { first: "Demo Bhaskar", last: "Gorle", designation: "Accountant", dept: "Accounts", type: "Non-teaching", login: "cems.accountant", role: "accountant" },
  { first: "Demo Lavanya", last: "Teki", designation: "Class Teacher Grade 5 A, Mathematics", dept: "Mathematics", type: "Teaching", subjects: ["MAT"], login: "cems.classteacher", role: "class-teacher" },
  { first: "Demo Pavan", last: "Seela", designation: "Science Teacher", dept: "Science", type: "Teaching", subjects: ["SCI", "PHY"], login: "cems.teacher", role: "teacher" },
  { first: "Demo Mounika", last: "Ravada", designation: "Receptionist", dept: "Administration", type: "Non-teaching", login: "cems.reception", role: "receptionist" },
  { first: "Demo Appala", last: "Naidu", designation: "Transport In-charge", dept: "Transport", type: "Non-teaching", login: "cems.transport", role: "transport-in-charge" },
  { first: "Demo Jhansi", last: "Bonela", designation: "Librarian", dept: "Support", type: "Non-teaching", login: "cems.librarian", role: "librarian" },
  { first: "Demo Satyavathi", last: "Kella", designation: "Hostel Warden (QA demo hostel)", dept: "Support", type: "Non-teaching", login: "cems.warden", role: "hostel-warden" },
  { first: "Demo Ramana", last: "Allu", designation: "Store Keeper", dept: "Support", type: "Non-teaching", login: "cems.store", role: "store-keeper" },
  { first: "Demo Durga", last: "Peela", designation: "HR Executive", dept: "Administration", type: "Non-teaching", login: "cems.hr", role: "hr" },
  { first: "Demo Kumari", last: "Sanapala", designation: "Office Assistant", dept: "Administration", type: "Non-teaching", login: "cems.office", role: "office-staff" },
  { first: "Demo Srinu", last: "Lanka", designation: "Exam In-charge", dept: "Mathematics", type: "Teaching", subjects: ["MAT"], login: "cems.exam", role: "exam-in-charge" },
  { first: "Demo Swapna", last: "Tamarana", designation: "Admission Counsellor", dept: "Administration", type: "Non-teaching", login: "cems.admissions", role: "admission-counsellor" },
  { first: "Demo Padmaja", last: "Gudla", designation: "Student Counsellor", dept: "Support", type: "Non-teaching", login: "cems.counsellor", role: "counsellor" },
  { first: "Demo Yesu", last: "Babu", designation: "Gate Security", dept: "Support", type: "Non-teaching", login: "cems.gate", role: "gate-security" },
  { first: "Demo Simhachalam", last: "Mylapalli", designation: "Bus Driver", dept: "Transport", type: "Non-teaching", login: "cems.driver", role: "driver" },
  { first: "Demo Lakshmi", last: "Attendant", designation: "Bus Attendant", dept: "Transport", type: "Non-teaching" },
  { first: "Demo Ganga", last: "Attendant", designation: "Bus Attendant", dept: "Transport", type: "Non-teaching" },
  { first: "Demo Apparao", last: "Driver", designation: "Bus Driver", dept: "Transport", type: "Non-teaching" },
  { first: "Demo Venkata", last: "Driver", designation: "Bus Driver", dept: "Transport", type: "Non-teaching" },
  { first: "Demo Chinna", last: "Support", designation: "Support Staff", dept: "Support", type: "Non-teaching" },
  // Synthetic subject teachers.
  ...[
    ["Demo Anusha", "Chintada", "ENG"], ["Demo Kiran", "Boddu", "ENG"], ["Demo Rajani", "Pydi", "TEL"], ["Demo Murali", "Koppala", "TEL"],
    ["Demo Hema", "Sarvasiddi", "MAT"], ["Demo Ravi", "Mamidi", "MAT"], ["Demo Sunil", "Gandreti", "SCI"], ["Demo Divya", "Korada", "SCI"],
    ["Demo Prasad", "Inti", "PHY"], ["Demo Usha", "Nalla", "CHE"], ["Demo Kalyani", "Banda", "BIO"], ["Demo Naresh", "Dola", "SST"],
    ["Demo Bhavani", "Kalla", "SST"], ["Demo Chaitanya", "Sirra", "CMP"], ["Demo Rekha", "Pentakota", "EVS"], ["Demo Sowmya", "Yerra", "EVS"],
    ["Demo Gowri", "Lolla", "ENG"], ["Demo Vasu", "Arasavilli", "FMA"], ["Demo Ramya", "Muddada", "FPH"], ["Demo Teja", "Kurmana", "FCH"],
  ].map(([first, last, sub]) => ({ first, last, designation: `${sub} Teacher`, dept: sub === "ENG" || sub === "TEL" ? "Languages" : sub === "MAT" || sub === "FMA" ? "Mathematics" : sub === "SST" ? "Social Studies" : "Science", type: "Teaching" as const, subjects: [sub] })),
];

const DEPTS = ["Administration", "Accounts", "Languages", "Mathematics", "Science", "Social Studies", "Transport", "Support"];

async function makeSchoolA(hash: string) {
  const { school, campus } = await createSchool({
    code: "CEMS", name: "Chaitanya EM School — QA Demo", board: "State Board",
    address: "Chekkapalli, Andhra Pradesh", city: "Chekkapalli", state: "Andhra Pradesh", schoolType: "Day school",
    email: "chaitanyaemschool27@gmail.com", status: "ACTIVE",
    // Hostel is switched on ONLY to test the software: the website states no hostel.
    optionalOn: ["transport-management", "library-management", "inventory-management", "hostel-management"],
  });
  const schoolId = school.id;
  const ctx = { schoolId, userId: null };
  await withSchool(ctx, async (tx) => {
    // Every role template switched on, so every role can be signed in as.
    await tx.role.updateMany({ data: { isEnabled: true } });
    await tx.school.update({ where: { id: schoolId }, data: {} }).catch(() => {});

    await tx.financialYear.create({ data: { schoolId, name: "2025-26", startDate: day("2025-04-01"), endDate: day("2026-03-31"), status: "CLOSED", closedAt: day("2026-04-30") } });
    await tx.financialYear.create({ data: { schoolId, name: "2026-27", startDate: day("2026-04-01"), endDate: day("2027-03-31") } });
    const past = await tx.academicYear.create({ data: { schoolId, campusId: campus.id, name: "2025-26", startDate: day("2025-06-01"), endDate: day("2026-04-30"), status: "CLOSED", closedAt: day("2026-05-05") } });
    const year = await tx.academicYear.create({ data: { schoolId, campusId: campus.id, name: "2026-27", startDate: day("2026-06-01"), endDate: day("2027-04-30"), status: "ACTIVE" } });
    await tx.academicYear.create({ data: { schoolId, campusId: campus.id, name: "2027-28", startDate: day("2027-06-01"), endDate: day("2028-04-30"), status: "UPCOMING" } });
    await tx.term.create({ data: { schoolId, academicYearId: year.id, name: "Term 1", startDate: day("2026-06-01"), endDate: day("2026-10-15"), sortOrder: 1 } });
    await tx.term.create({ data: { schoolId, academicYearId: year.id, name: "Term 2", startDate: day("2026-10-16"), endDate: day("2027-04-30"), sortOrder: 2 } });
    for (const p of PERIODS) await tx.periodSlot.create({ data: { schoolId, campusId: campus.id, number: p.n, label: p.label ?? `Period ${p.n}`, startTime: p.s, endTime: p.e, isBreak: p.n <= 0 } });

    const depts: Record<string, string> = {};
    for (const d of DEPTS) depts[d] = (await tx.department.create({ data: { schoolId, name: d } })).id;

    const staff: { id: string; p: P }[] = [];
    for (const [i, p] of PEOPLE.entries()) {
      let userLoginId: string | undefined;
      if (p.login) {
        const u = await prisma.userLogin.create({ data: { username: p.login, displayName: [p.first, p.last].filter(Boolean).join(" "), phone: `90000${String(10000 + i).slice(-5)}`, status: "ACTIVE", passwordHash: hash, passwordChangedAt: new Date() } });
        userLoginId = u.id;
        const role = await tx.role.findFirstOrThrow({ where: { key: p.role } });
        await tx.schoolAccess.create({ data: { schoolId, userLoginId: u.id, roles: { create: [{ roleId: role.id, schoolId }] } } });
      }
      const n = await nextNumber(tx, ctx, "staff");
      const row = await tx.staff.create({
        data: {
          schoolId, campusId: campus.id, staffCode: formatNumber("CEMS-ST-", n, 3),
          firstName: p.first, lastName: p.last ?? null, fullName: [p.first, p.last].filter(Boolean).join(" "),
          phone: `90000${String(10000 + i).slice(-5)}`, gender: i % 2 ? "Female" : "Male",
          designation: p.designation, departmentId: depts[p.dept], staffType: p.type ?? "Teaching",
          joiningDate: day(p.real ? "2015-06-01" : `${2016 + (i % 9)}-06-01`),
          address: "DEMO address, Chekkapalli", userLoginId,
        },
      });
      staff.push({ id: row.id, p });
    }

    const subjectIds: Record<string, string> = {};
    const classes: { id: string; idx: number; name: string }[] = [];
    for (const [idx, c] of CLASSES.entries()) classes.push({ id: (await tx.schoolClass.create({ data: { schoolId, campusId: campus.id, name: c.name, level: c.level, sortOrder: idx + 1 } })).id, idx, name: c.name });
    for (const s of SUBJECTS) {
      subjectIds[s.code] = (await tx.subject.create({ data: { schoolId, code: s.code, name: s.name, type: "type" in s ? s.type : "CORE" } })).id;
      for (const c of classes) if (c.idx >= s.from && c.idx <= s.to) await tx.subjectClass.create({ data: { schoolId, subjectId: subjectIds[s.code], classId: c.id, periodsPerWeek: s.ppw } });
    }

    const teachers = staff.filter((s) => s.p.subjects?.length);
    const classTeacherPool = teachers.filter((t) => !t.p.login || t.p.login === "cems.classteacher");
    let k = 0;
    const load = new Map<string, number>();
    for (const c of classes) {
      for (const name of CLASSES[c.idx].sections) {
        const isFiveA = c.name === "Grade 5" && name === "A";
        const ct = isFiveA ? staff.find((s) => s.p.login === "cems.classteacher")! : classTeacherPool.filter((t) => t.p.login !== "cems.classteacher")[k++ % (classTeacherPool.length - 1)];
        const sec = await tx.section.create({ data: { schoolId, classId: c.id, academicYearId: year.id, name, seats: c.idx < 3 ? 25 : 35, classTeacherId: ct.id, room: `R-${c.idx + 1}${name}` } });
        await tx.section.create({ data: { schoolId, classId: c.id, academicYearId: past.id, name, seats: 35, classTeacherId: ct.id } });
        for (const s of SUBJECTS) {
          if (c.idx < s.from || c.idx > s.to) continue;
          let pool = teachers.filter((t) => t.p.subjects!.includes(s.code));
          // The class teacher login teaches Maths in Grade 5 A and 5 B; the subject teacher login teaches Science in Grade 5 to 7.
          if (s.code === "MAT" && c.name === "Grade 5") pool = [staff.find((x) => x.p.login === "cems.classteacher")!];
          else if (s.code === "SCI" && ["Grade 5", "Grade 6", "Grade 7"].includes(c.name)) pool = [staff.find((x) => x.p.login === "cems.teacher")!];
          else pool = pool.filter((t) => !["cems.classteacher", "cems.teacher"].includes(t.p.login ?? ""));
          if (!pool.length) continue;
          const chosen = pool.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0];
          load.set(chosen.id, (load.get(chosen.id) ?? 0) + s.ppw);
          await tx.teacherAllocation.create({ data: { schoolId, academicYearId: year.id, staffId: chosen.id, sectionId: sec.id, subjectId: subjectIds[s.code], fromDate: day("2026-06-01") } });
        }
      }
    }

    for (const lt of [
      { forWhom: "staff", name: "Casual Leave", code: "CL", daysPerYear: 12 },
      { forWhom: "staff", name: "Sick Leave", code: "SL", daysPerYear: 10, needsDocAfter: 2 },
      { forWhom: "staff", name: "Leave Without Pay", code: "LWP", daysPerYear: 0, paid: false },
      { forWhom: "student", name: "Sick", code: "SICK", daysPerYear: 0 },
      { forWhom: "student", name: "Medical", code: "MED", daysPerYear: 0 },
      { forWhom: "student", name: "Family function", code: "FAMILY", daysPerYear: 0 },
    ]) {
      const t = await tx.leaveType.create({ data: { schoolId, ...lt } });
      if (lt.forWhom === "staff" && lt.daysPerYear > 0) for (const s of staff) await tx.leaveBalance.create({ data: { schoolId, academicYearId: year.id, staffId: s.id, leaveTypeId: t.id, daysGiven: lt.daysPerYear } });
    }
    for (const [type, title, a, b] of [
      ["holiday", "Independence Day", "2026-08-15", "2026-08-15"], ["holiday", "Gandhi Jayanti", "2026-10-02", "2026-10-02"],
      ["vacation", "Dasara holidays (DEMO dates)", "2026-10-19", "2026-10-25"], ["holiday", "Diwali", "2026-11-08", "2026-11-08"],
      ["vacation", "Sankranti holidays (DEMO dates)", "2027-01-11", "2027-01-17"], ["holiday", "Republic Day", "2027-01-26", "2027-01-26"],
    ] as const) await tx.calendarEntry.create({ data: { schoolId, campusId: campus.id, academicYearId: year.id, type, title, startDate: day(a), endDate: day(b), attendanceOn: false } });
  }, { timeout: 600_000 });
  return schoolId;
}

/** School B: same names, same phone, to prove A can never see B. */
async function makeSchoolB(hash: string) {
  const { school, campus } = await createSchool({ code: "QAB", name: "QA Isolation School B", board: "State Board", address: "DEMO town, Andhra Pradesh", status: "ACTIVE" });
  const schoolId = school.id;
  const ctx = { schoolId, userId: null };
  await withSchool(ctx, async (tx) => {
    const u = await prisma.userLogin.create({ data: { username: "qab.admin", displayName: "School B Admin", phone: "9000099001", status: "ACTIVE", passwordHash: hash, passwordChangedAt: new Date() } });
    const role = await tx.role.findFirstOrThrow({ where: { key: "school-admin" } });
    await tx.schoolAccess.create({ data: { schoolId, userLoginId: u.id, roles: { create: [{ roleId: role.id, schoolId }] } } });
    const year = await tx.academicYear.create({ data: { schoolId, campusId: campus.id, name: "2026-27", startDate: day("2026-06-01"), endDate: day("2027-04-30"), status: "ACTIVE" } });
    await tx.financialYear.create({ data: { schoolId, name: "2026-27", startDate: day("2026-04-01"), endDate: day("2027-03-31") } });
    const cls = await tx.schoolClass.create({ data: { schoolId, campusId: campus.id, name: "Grade 5", sortOrder: 9 } });
    const staff = await tx.staff.create({ data: { schoolId, campusId: campus.id, staffCode: "QAB-ST-001", firstName: "Demo Lavanya", lastName: "Teki", fullName: "Demo Lavanya Teki", phone: "9000010007", designation: "Teacher", joiningDate: day("2020-06-01") } });
    const sec = await tx.section.create({ data: { schoolId, classId: cls.id, academicYearId: year.id, name: "A", classTeacherId: staff.id } });
    const n = await nextNumber(tx, ctx, "admission");
    const st = await tx.student.create({ data: { schoolId, campusId: campus.id, admissionNo: formatNumber("QAB/2026/", n, 4), firstName: "Aarav", lastName: "Kumar", fullName: "Aarav Kumar", dateOfBirth: day("2015-05-05"), gender: "Male", status: "ACTIVE", joiningDate: day("2026-06-01"), address: "SCHOOL-B-SECRET address" } });
    const g = await tx.guardian.create({ data: { schoolId, name: "Ramesh Kumar (School B)", relationship: "Father", phone: "9100000001" } });
    await tx.studentGuardian.create({ data: { schoolId, studentId: st.id, guardianId: g.id, relationship: "Father", isPrimary: true, emergencyOrder: 1 } });
    await tx.enrolment.create({ data: { schoolId, studentId: st.id, academicYearId: year.id, classId: cls.id, sectionId: sec.id, rollNo: 1 } });
  });
  return schoolId;
}

async function main() {
  if (!PASSWORD) throw new Error("Set DEMO_PASSWORD in .env first.");
  if (await prisma.userLogin.findUnique({ where: { username: "cems.principal" } })) { console.log("The QA demo is already there."); return; }
  const hash = await hashPassword(PASSWORD);
  const a = await makeSchoolA(hash);
  const b = await makeSchoolB(hash);
  console.log(`School A ${a}\nSchool B ${b}`);
  for (const p of PEOPLE.filter((x) => x.login)) console.log(`  ${p.login!.padEnd(20)} ${p.role}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
