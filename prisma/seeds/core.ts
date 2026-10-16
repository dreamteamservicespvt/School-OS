// Demo school setup: years, classes, sections, subjects, the Time Table,
// staff and students with their guardians. Every module's demo builds on it.
import { withSchool, type Tx } from "../../src/lib/db";
import { nextNumber, formatNumber } from "../../src/lib/sequences";
import { encryptField } from "../../src/lib/crypto";
import type { SeedSchool } from "./types";
import { BOY_NAMES, GIRL_NAMES, SURNAMES, FATHER_NAMES, MOTHER_NAMES, OCCUPATIONS, LOCALITIES, rng, pick, phoneFrom, day } from "./names";

const CLASSES = [
  { name: "Nursery", level: "Pre-primary" },
  { name: "LKG", level: "Pre-primary" },
  { name: "UKG", level: "Pre-primary" },
  ...Array.from({ length: 10 }, (_, i) => ({ name: `Class ${i + 1}`, level: i < 5 ? "Primary" : i < 8 ? "Middle" : "Secondary" })),
];

const SUBJECTS = [
  { code: "ENG", name: "English", type: "LANGUAGE", dept: "Languages", from: 0, to: 12, ppw: 6 },
  { code: "HIN", name: "Hindi", type: "LANGUAGE", dept: "Languages", from: 3, to: 12, ppw: 4 },
  { code: "TEL", name: "Telugu", type: "LANGUAGE", dept: "Languages", from: 3, to: 12, ppw: 4 },
  { code: "MAT", name: "Mathematics", type: "CORE", dept: "Mathematics", from: 0, to: 12, ppw: 7 },
  { code: "EVS", name: "Environmental Studies", type: "CORE", dept: "Science", from: 0, to: 7, ppw: 5 },
  { code: "SCI", name: "Science", type: "CORE", dept: "Science", from: 8, to: 12, ppw: 6 },
  { code: "SST", name: "Social Studies", type: "CORE", dept: "Social Studies", from: 8, to: 12, ppw: 5 },
  { code: "CS", name: "Computer Science", type: "OPTIONAL", dept: "Science", from: 3, to: 12, ppw: 2 },
  { code: "ART", name: "Art", type: "CORE", dept: "Pre-primary", from: 0, to: 12, ppw: 2, gradeOnly: true },
  { code: "PE", name: "Physical Education", type: "CORE", dept: "Support", from: 0, to: 12, ppw: 2, gradeOnly: true },
] as const;

const DEPARTMENTS = ["Languages", "Mathematics", "Science", "Social Studies", "Pre-primary", "Administration", "Accounts", "Transport", "Support"];

const PERIODS = [
  { n: 1, s: "08:45", e: "09:25" }, { n: 2, s: "09:25", e: "10:05" }, { n: 3, s: "10:05", e: "10:45" },
  { n: 0, s: "10:45", e: "11:00", label: "Short break" },
  { n: 4, s: "11:00", e: "11:40" }, { n: 5, s: "11:40", e: "12:20" },
  { n: -1, s: "12:20", e: "13:00", label: "Lunch" },
  { n: 6, s: "13:00", e: "13:40" }, { n: 7, s: "13:40", e: "14:20" }, { n: 8, s: "14:20", e: "15:00" },
];

type NewStaff = { first: string; last: string; designation: string; dept: string; type: "Teaching" | "Non-teaching"; subjects?: string[]; login?: string; gender: string };

const STAFF: NewStaff[] = [
  { first: "Lakshmi", last: "Rao", designation: "Principal", dept: "Administration", type: "Teaching", login: "principal", gender: "Female" },
  { first: "Suresh", last: "Kumar", designation: "Office Administrator", dept: "Administration", type: "Non-teaching", login: "admin", gender: "Male" },
  { first: "Priya", last: "Sharma", designation: "Accountant", dept: "Accounts", type: "Non-teaching", login: "accountant", gender: "Female" },
  { first: "Ravi", last: "Teja", designation: "TGT Mathematics", dept: "Mathematics", type: "Teaching", subjects: ["MAT"], login: "teacher", gender: "Male" },
  { first: "Anitha", last: "Reddy", designation: "Librarian", dept: "Support", type: "Non-teaching", login: "librarian", gender: "Female" },
  { first: "Meena", last: "Iyer", designation: "PRT English", dept: "Languages", type: "Teaching", subjects: ["ENG"], login: "newteacher", gender: "Female" },
  { first: "Srinivas", last: "Murthy", designation: "PGT Mathematics", dept: "Mathematics", type: "Teaching", subjects: ["MAT"], gender: "Male" },
  { first: "Kavitha", last: "Nair", designation: "TGT Mathematics", dept: "Mathematics", type: "Teaching", subjects: ["MAT"], gender: "Female" },
  { first: "Swathi", last: "Varma", designation: "PRT Mathematics", dept: "Mathematics", type: "Teaching", subjects: ["MAT"], gender: "Female" },
  { first: "Rajesh", last: "Gupta", designation: "TGT English", dept: "Languages", type: "Teaching", subjects: ["ENG"], gender: "Male" },
  { first: "Padma", last: "Chowdary", designation: "TGT English", dept: "Languages", type: "Teaching", subjects: ["ENG"], gender: "Female" },
  { first: "Sunitha", last: "Joshi", designation: "PRT English", dept: "Languages", type: "Teaching", subjects: ["ENG"], gender: "Female" },
  { first: "Ramesh", last: "Mishra", designation: "TGT Hindi", dept: "Languages", type: "Teaching", subjects: ["HIN"], gender: "Male" },
  { first: "Geetha", last: "Verma", designation: "PRT Hindi", dept: "Languages", type: "Teaching", subjects: ["HIN"], gender: "Female" },
  { first: "Venkatesh", last: "Naidu", designation: "TGT Telugu", dept: "Languages", type: "Teaching", subjects: ["TEL"], gender: "Male" },
  { first: "Madhavi", last: "Goud", designation: "PRT Telugu", dept: "Languages", type: "Teaching", subjects: ["TEL"], gender: "Female" },
  { first: "Prakash", last: "Kulkarni", designation: "TGT Science", dept: "Science", type: "Teaching", subjects: ["SCI"], login: "subjectteacher", gender: "Male" },
  { first: "Divya", last: "Menon", designation: "TGT Science", dept: "Science", type: "Teaching", subjects: ["SCI"], gender: "Female" },
  { first: "Jyothi", last: "Pillai", designation: "PRT EVS", dept: "Science", type: "Teaching", subjects: ["EVS"], gender: "Female" },
  { first: "Latha", last: "Shetty", designation: "PRT EVS", dept: "Science", type: "Teaching", subjects: ["EVS"], gender: "Female" },
  { first: "Anil", last: "Das", designation: "TGT Social Studies", dept: "Social Studies", type: "Teaching", subjects: ["SST"], gender: "Male" },
  { first: "Rekha", last: "Bhat", designation: "TGT Social Studies", dept: "Social Studies", type: "Teaching", subjects: ["SST"], gender: "Female" },
  { first: "Kiran", last: "Agarwal", designation: "Computer Teacher", dept: "Science", type: "Teaching", subjects: ["CS"], gender: "Male" },
  { first: "Usha", last: "Mehta", designation: "Pre-primary Teacher", dept: "Pre-primary", type: "Teaching", subjects: ["ENG", "MAT", "EVS"], gender: "Female" },
  { first: "Aruna", last: "Patel", designation: "Pre-primary Teacher", dept: "Pre-primary", type: "Teaching", subjects: ["ENG", "MAT", "EVS"], gender: "Female" },
  { first: "Vani", last: "Singh", designation: "Art Teacher", dept: "Pre-primary", type: "Teaching", subjects: ["ART"], gender: "Female" },
  { first: "Mohan", last: "Yadav", designation: "Physical Education Teacher", dept: "Support", type: "Teaching", subjects: ["PE"], gender: "Male" },
  { first: "Satish", last: "Reddy", designation: "Physical Education Teacher", dept: "Support", type: "Teaching", subjects: ["PE"], gender: "Male" },
  { first: "Naresh", last: "Kumar", designation: "Receptionist", dept: "Administration", type: "Non-teaching", login: "reception", gender: "Male" },
  { first: "Ganesh", last: "Rao", designation: "Transport Supervisor", dept: "Transport", type: "Non-teaching", login: "transport", gender: "Male" },
  { first: "Sarita", last: "Sharma", designation: "Office Assistant", dept: "Administration", type: "Non-teaching", gender: "Female" },
  { first: "Harish", last: "Naidu", designation: "Lab Assistant", dept: "Science", type: "Non-teaching", gender: "Male" },
  { first: "Sunita", last: "Patil", designation: "Hostel Warden", dept: "Support", type: "Non-teaching", login: "warden", gender: "Female" },
  { first: "Mahesh", last: "Yadav", designation: "Store Keeper", dept: "Support", type: "Non-teaching", login: "store", gender: "Male" },
];

export async function seedCore(base: { schoolId: string; campusId: string; code: string; name: string; users: Record<string, string>; full: boolean }): Promise<SeedSchool> {
  const ctx = { schoolId: base.schoolId, userId: null };
  const r = rng(base.code === "SPS" ? 2026 : 7);
  return withSchool(ctx, async (tx) => {
    const { schoolId, campusId } = base;
    await tx.financialYear.create({ data: { schoolId, name: "2025-26", startDate: day("2025-04-01"), endDate: day("2026-03-31"), status: "CLOSED", closedAt: day("2026-04-30") } });
    const fy = await tx.financialYear.create({ data: { schoolId, name: "2026-27", startDate: day("2026-04-01"), endDate: day("2027-03-31") } });
    const past = await tx.academicYear.create({ data: { schoolId, campusId, name: "2025-26", startDate: day("2025-04-01"), endDate: day("2026-03-31"), status: "CLOSED", closedAt: day("2026-04-05") } });
    const year = await tx.academicYear.create({ data: { schoolId, campusId, name: "2026-27", startDate: day("2026-04-01"), endDate: day("2027-03-31"), status: "ACTIVE" } });
    await tx.academicYear.create({ data: { schoolId, campusId, name: "2027-28", startDate: day("2027-04-01"), endDate: day("2028-03-31"), status: "UPCOMING" } });
    const t1 = await tx.term.create({ data: { schoolId, academicYearId: year.id, name: "Term 1", startDate: day("2026-04-01"), endDate: day("2026-09-30"), sortOrder: 1 } });
    const t2 = await tx.term.create({ data: { schoolId, academicYearId: year.id, name: "Term 2", startDate: day("2026-10-01"), endDate: day("2027-03-31"), sortOrder: 2 } });
    for (const [i, name] of ["Term 1", "Term 2"].entries()) {
      await tx.term.create({ data: { schoolId, academicYearId: past.id, name, startDate: day(i ? "2025-10-01" : "2025-04-01"), endDate: day(i ? "2026-03-31" : "2025-09-30"), sortOrder: i + 1 } });
    }

    for (const p of PERIODS) {
      await tx.periodSlot.create({ data: { schoolId, campusId, number: p.n, label: p.label ?? `Period ${p.n}`, startTime: p.s, endTime: p.e, isBreak: p.n <= 0 } });
    }

    // Departments and staff.
    const depts: Record<string, string> = {};
    for (const name of DEPARTMENTS) depts[name] = (await tx.department.create({ data: { schoolId, name } })).id;
    const staffList = base.full ? STAFF : STAFF.filter((s) => s.login === "principal" || !s.login).slice(0, 14);
    const staffIds: { id: string; s: NewStaff }[] = [];
    for (const [i, s] of staffList.entries()) {
      const n = await nextNumber(tx, ctx, "staff");
      const joined = day(`${2012 + (i % 13)}-${String((i % 12) + 1).padStart(2, "0")}-01`);
      const row = await tx.staff.create({
        data: {
          schoolId, campusId,
          staffCode: formatNumber(`${base.code}-ST-`, n, 3),
          firstName: s.first, lastName: s.last, fullName: `${s.first} ${s.last}`,
          phone: s.login && base.users[s.login] ? `98765000${String(i + 1).padStart(2, "0")}` : phoneFrom(r),
          email: `${s.first.toLowerCase()}.${s.last.toLowerCase()}@${base.code.toLowerCase()}.edu.in`,
          gender: s.gender,
          dateOfBirth: day(`${1970 + (i % 25)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`),
          designation: s.designation,
          departmentId: depts[s.dept],
          staffType: s.type,
          employmentType: i % 9 === 8 ? "Contract" : i % 11 === 10 ? "Probation" : "Permanent",
          joiningDate: joined,
          qualification: s.type === "Teaching" ? pick(r, ["B.Ed, M.Sc", "B.Ed, M.A", "B.Ed, B.Sc", "D.El.Ed, B.A", "M.Ed, M.Sc"]) : pick(r, ["B.Com", "B.A", "Intermediate", "M.Com", "B.Sc"]),
          experienceYears: 3 + (i % 18),
          address: `${pick(r, LOCALITIES)}, Hyderabad`,
          bloodGroup: pick(r, ["A+", "B+", "O+", "AB+", "O-", "B-"]),
          emergencyName: `${pick(r, FATHER_NAMES)} ${s.last}`,
          emergencyPhone: phoneFrom(r),
          aadhaarEnc: encryptField(`${4000 + i}${String(Math.floor(r() * 1e8)).padStart(8, "0")}`),
          panEnc: encryptField(`ABCPD${String(1000 + i)}K`),
          bankAccountEnc: encryptField(`5010${String(Math.floor(r() * 1e10)).padStart(10, "0")}`),
          bankIfsc: "HDFC0001234", bankName: "HDFC Bank",
          uan: `1009${String(Math.floor(r() * 1e8)).padStart(8, "0")}`,
          userLoginId: s.login ? base.users[s.login] : undefined,
        },
      });
      staffIds.push({ id: row.id, s });
      if (base.full && i % 4 === 0) {
        await tx.staffDocument.create({ data: { schoolId, staffId: row.id, kind: "Police verification", number: `PV-${1000 + i}`, expiresOn: day(i % 8 === 0 ? "2026-10-25" : "2027-06-30"), verified: true } });
      }
      if (base.full) await tx.staffDocument.create({ data: { schoolId, staffId: row.id, kind: "Degree certificate", verified: i % 5 !== 3 } });
    }
    for (const name of ["Mathematics", "Languages", "Science"]) {
      const head = staffIds.find((x) => x.s.dept === name && x.s.type === "Teaching");
      if (head) await tx.department.update({ where: { id: depts[name] }, data: { headStaffId: head.id } });
    }

    // Classes, sections, subjects.
    const classes = base.full ? CLASSES : CLASSES.slice(3, 11);
    const classRows: { id: string; idx: number; name: string }[] = [];
    for (const c of classes) {
      const idx = CLASSES.indexOf(c);
      const row = await tx.schoolClass.create({ data: { schoolId, campusId, name: c.name, level: c.level, sortOrder: idx + 1 } });
      classRows.push({ id: row.id, idx, name: c.name });
    }
    const subjectRows: Record<string, string> = {};
    for (const s of SUBJECTS) {
      const row = await tx.subject.create({ data: { schoolId, code: s.code, name: s.name, type: s.type, gradeOnly: "gradeOnly" in s && s.gradeOnly } });
      subjectRows[s.code] = row.id;
      for (const c of classRows) {
        if (c.idx >= s.from && c.idx <= s.to) await tx.subjectClass.create({ data: { schoolId, subjectId: row.id, classId: c.id, periodsPerWeek: s.ppw } });
      }
    }

    const teachers = staffIds.filter((x) => x.s.type === "Teaching" && x.s.designation !== "Principal");
    const load = new Map<string, number>();
    const sections: { id: string; classIdx: number; className: string; name: string }[] = [];
    let ctIndex = 0;
    const classTeacherPool = teachers.filter((t) => !["ART", "PE", "CS"].includes(t.s.subjects?.[0] ?? ""));
    for (const c of classRows) {
      const names = base.full && (c.idx >= 3 && c.idx <= 9) ? ["A", "B"] : ["A"];
      for (const name of names) {
        let classTeacherId: string;
        if (c.name === "Class 5" && name === "A" && base.users.teacher) classTeacherId = staffIds.find((x) => x.s.login === "teacher")!.id;
        else {
          let t = classTeacherPool[ctIndex++ % classTeacherPool.length];
          if (t.s.login === "teacher") t = classTeacherPool[ctIndex++ % classTeacherPool.length];
          classTeacherId = t.id;
        }
        const row = await tx.section.create({ data: { schoolId, classId: c.id, academicYearId: year.id, name, seats: c.idx < 3 ? 25 : 40, classTeacherId, room: `${c.idx < 3 ? "G" : c.idx < 8 ? "1" : "2"}${String(sections.length + 1).padStart(2, "0")}` } });
        sections.push({ id: row.id, classIdx: c.idx, className: c.name, name });
        // Last year's section for the same class, closed with the year.
        await tx.section.create({ data: { schoolId, classId: c.id, academicYearId: past.id, name, seats: 40, classTeacherId } });
      }
    }

    // Teacher Allocation: the least-loaded teacher of the subject; Ravi Teja gets 5 A, 5 B and 6 A maths.
    const allocs: { sectionId: string; subjectCode: string; staffId: string }[] = [];
    for (const sec of sections) {
      for (const s of SUBJECTS) {
        if (sec.classIdx < s.from || sec.classIdx > s.to) continue;
        let pool = teachers.filter((t) => t.s.subjects?.includes(s.code));
        if (sec.classIdx < 3 && ["ENG", "MAT", "EVS"].includes(s.code)) pool = teachers.filter((t) => t.s.designation === "Pre-primary Teacher");
        else pool = pool.filter((t) => t.s.designation !== "Pre-primary Teacher");
        if (pool.length === 0) continue;
        let chosen = pool.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0];
        const ravi = staffIds.find((x) => x.s.login === "teacher");
        if (s.code === "MAT" && ravi && ((sec.className === "Class 5") || (sec.className === "Class 6" && sec.name === "A"))) chosen = ravi;
        else if (s.code === "MAT" && ravi && chosen.id === ravi.id) chosen = pool.filter((t) => t.id !== ravi.id).sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0] ?? chosen;
        load.set(chosen.id, (load.get(chosen.id) ?? 0) + s.ppw);
        allocs.push({ sectionId: sec.id, subjectCode: s.code, staffId: chosen.id });
        await tx.teacherAllocation.create({ data: { schoolId, academicYearId: year.id, staffId: chosen.id, sectionId: sec.id, subjectId: subjectRows[s.code], fromDate: day("2026-04-01") } });
      }
    }

    // A published Time Table with no teacher in two places at once.
    const version = await tx.timetableVersion.create({ data: { schoolId, academicYearId: year.id, campusId, name: "Time Table 2026-27", status: "PUBLISHED", effectiveFrom: day("2026-06-10"), publishedAt: day("2026-06-05") } });
    const busy = new Set<string>();
    const teaching = PERIODS.filter((p) => p.n > 0);
    for (const sec of sections) {
      const mine = allocs.filter((a) => a.sectionId === sec.id);
      const needs: string[] = [];
      for (const a of mine) {
        const s = SUBJECTS.find((x) => x.code === a.subjectCode)!;
        for (let k = 0; k < s.ppw; k++) needs.push(a.subjectCode);
      }
      let cursor = sections.indexOf(sec) * 3;
      for (let d = 1; d <= 6; d++) {
        for (const p of teaching) {
          if (d === 6 && p.n > 5) continue; // Saturdays end after period 5.
          let placed = false;
          for (let tries = 0; tries < needs.length && !placed; tries++) {
            const code = needs[(cursor + tries) % needs.length];
            const a = mine.find((x) => x.subjectCode === code)!;
            const key = `${a.staffId}:${d}:${p.n}`;
            if (busy.has(key)) continue;
            busy.add(key);
            needs.splice((cursor + tries) % needs.length, 1);
            await tx.timetablePeriod.create({ data: { schoolId, versionId: version.id, sectionId: sec.id, dayOfWeek: d, periodNo: p.n, startTime: p.s, endTime: p.e, subjectId: subjectRows[code], staffId: a.staffId } });
            placed = true;
            cursor++;
          }
          if (!placed) {
            await tx.timetablePeriod.create({ data: { schoolId, versionId: version.id, sectionId: sec.id, dayOfWeek: d, periodNo: p.n, startTime: p.s, endTime: p.e, room: "Library" } });
          }
          if (needs.length === 0) needs.push(...mine.map((m) => m.subjectCode));
        }
      }
    }

    // Leave types.
    for (const lt of [
      { forWhom: "staff", name: "Casual Leave", code: "CL", daysPerYear: 12 },
      { forWhom: "staff", name: "Sick Leave", code: "SL", daysPerYear: 10, needsDocAfter: 2 },
      { forWhom: "staff", name: "Earned Leave", code: "EL", daysPerYear: 15, carryForward: true, maxCarry: 30 },
      { forWhom: "staff", name: "Leave Without Pay", code: "LWP", daysPerYear: 0, paid: false },
      { forWhom: "student", name: "Sick", code: "SICK", daysPerYear: 0 },
      { forWhom: "student", name: "Family function", code: "FAMILY", daysPerYear: 0 },
      { forWhom: "student", name: "Other", code: "OTHER", daysPerYear: 0 },
    ]) {
      const t = await tx.leaveType.create({ data: { schoolId, ...lt } });
      if (lt.forWhom === "staff" && lt.daysPerYear > 0) {
        for (const s of staffIds) await tx.leaveBalance.create({ data: { schoolId, academicYearId: year.id, staffId: s.id, leaveTypeId: t.id, daysGiven: lt.daysPerYear } });
      }
    }

    // School Calendar 2026-27.
    for (const h of [
      ["holiday", "Independence Day", "2026-08-15", "2026-08-15"],
      ["holiday", "Ganesh Chaturthi", "2026-09-14", "2026-09-14"],
      ["holiday", "Gandhi Jayanti", "2026-10-02", "2026-10-02"],
      ["vacation", "Dasara holidays", "2026-10-17", "2026-10-25"],
      ["holiday", "Diwali", "2026-11-08", "2026-11-08"],
      ["holiday", "Christmas", "2026-12-25", "2026-12-25"],
      ["vacation", "Sankranti holidays", "2027-01-12", "2027-01-16"],
      ["holiday", "Republic Day", "2027-01-26", "2027-01-26"],
      ["holiday", "Holi", "2027-03-22", "2027-03-22"],
      ["vacation", "Summer vacation", "2026-04-24", "2026-06-09"],
    ] as const) {
      await tx.calendarEntry.create({ data: { schoolId, campusId, academicYearId: year.id, type: h[0], title: h[1], startDate: day(h[2]), endDate: day(h[3]), attendanceOn: false } });
    }

    await seedStudents(tx, ctx, r, base, sections, past.id, year.id);

    return { ...base, ctx, yearId: year.id, pastYearId: past.id, financialYearId: fy.id, termIds: [t1.id, t2.id] };
  }, { timeout: 600_000 });
}

async function seedStudents(
  tx: Tx, ctx: { schoolId: string; userId: null }, r: () => number,
  base: { schoolId: string; campusId: string; code: string; full: boolean },
  sections: { id: string; classIdx: number; className: string; name: string }[],
  pastYearId: string, yearId: string,
) {
  const { schoolId, campusId } = base;
  const pastSections = await tx.section.findMany({ where: { academicYearId: pastYearId }, include: { schoolClass: true } });
  const families: { fatherId: string; motherId: string; surname: string; address: string }[] = [];
  const perSection = base.full ? 16 : 10;
  for (const sec of sections) {
    for (let k = 0; k < perSection; k++) {
      const boy = r() < 0.52;
      const first = pick(r, boy ? BOY_NAMES : GIRL_NAMES);
      // About one child in seven is a brother or sister of a child already here.
      const sibling = families.length > 10 && r() < 0.14 ? families[Math.floor(r() * families.length)] : null;
      const surname = sibling?.surname ?? pick(r, SURNAMES);
      const address = sibling?.address ?? `${1 + Math.floor(r() * 400)}-${Math.floor(r() * 90)}, ${pick(r, LOCALITIES)}, Hyderabad`;
      const age = sec.classIdx + 3;
      const dob = day(`${2026 - age - 1}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`);
      const isNew = sec.classIdx === 0 || r() < 0.08;
      const joinYear = isNew ? 2026 : 2026 - Math.min(sec.classIdx, 1 + Math.floor(r() * sec.classIdx));
      const n = await nextNumber(tx, ctx, `admission`);
      const student = await tx.student.create({
        data: {
          schoolId, campusId,
          admissionNo: formatNumber(`${base.code}/${joinYear}/`, n, 4),
          firstName: first, lastName: surname, fullName: `${first} ${surname}`,
          dateOfBirth: dob, gender: boy ? "Male" : "Female",
          bloodGroup: pick(r, ["A+", "B+", "O+", "AB+", "O-", "A-", "B-"]),
          category: pick(r, ["General", "General", "General", "OBC", "OBC", "SC", "ST", "EWS"]),
          religion: pick(r, ["Hindu", "Hindu", "Hindu", "Muslim", "Christian", "Sikh"]),
          motherTongue: pick(r, ["Telugu", "Telugu", "Hindi", "Urdu", "Tamil", "Kannada", "Marathi"]),
          address, city: "Hyderabad", state: "Telangana", pinCode: `5000${String(10 + Math.floor(r() * 89))}`,
          aadhaarEnc: encryptField(`${5000 + n}${String(Math.floor(r() * 1e8)).padStart(8, "0")}`),
          apaarId: r() < 0.7 ? String(Math.floor(r() * 1e12)).padStart(12, "0") : null,
          pen: r() < 0.7 ? String(Math.floor(r() * 1e11)).padStart(11, "0") : null,
          medicalNotes: r() < 0.06 ? pick(r, ["Asthma, carries an inhaler", "Allergic to peanuts", "Wears glasses"]) : null,
          status: "ACTIVE",
          joiningDate: day(`${joinYear}-06-${String(10 + Math.floor(r() * 5)).padStart(2, "0")}`),
          previousSchool: isNew && sec.classIdx > 2 ? pick(r, ["Little Flower School", "St. Mary's School", "Delhi Public School", "Kendriya Vidyalaya"]) : null,
        },
      });

      let fatherId: string, motherId: string;
      if (sibling) {
        fatherId = sibling.fatherId; motherId = sibling.motherId;
      } else {
        const father = await tx.guardian.create({ data: { schoolId, name: `${pick(r, FATHER_NAMES)} ${surname}`, relationship: "Father", phone: phoneFrom(r), email: r() < 0.6 ? `${surname.toLowerCase()}${Math.floor(r() * 900 + 100)}@gmail.com` : null, occupation: pick(r, OCCUPATIONS), address, language: pick(r, ["en", "te", "te", "hi"]) } });
        const mother = await tx.guardian.create({ data: { schoolId, name: `${pick(r, MOTHER_NAMES)} ${surname}`, relationship: "Mother", phone: phoneFrom(r), occupation: pick(r, OCCUPATIONS), address, language: pick(r, ["en", "te", "hi"]) } });
        fatherId = father.id; motherId = mother.id;
        families.push({ fatherId, motherId, surname, address });
      }
      await tx.studentGuardian.create({ data: { schoolId, studentId: student.id, guardianId: fatherId, relationship: "Father", isPrimary: true, emergencyOrder: 1 } });
      await tx.studentGuardian.create({ data: { schoolId, studentId: student.id, guardianId: motherId, relationship: "Mother", emergencyOrder: 2 } });

      await tx.enrolment.create({ data: { schoolId, studentId: student.id, academicYearId: yearId, classId: (await classIdOf(tx, sec.id)), sectionId: sec.id, rollNo: k + 1 } });
      if (!isNew && sec.classIdx > 0) {
        const prev = pastSections.find((p) => p.schoolClass.sortOrder === sec.classIdx && p.name === sec.name) ?? pastSections.find((p) => p.schoolClass.sortOrder === sec.classIdx);
        if (prev) await tx.enrolment.create({ data: { schoolId, studentId: student.id, academicYearId: pastYearId, classId: prev.classId, sectionId: prev.id, rollNo: k + 1, status: "PROMOTED" } });
      }
    }
  }
  // Roll numbers in name order, as most schools do.
  for (const sec of sections) {
    const rows = await tx.enrolment.findMany({ where: { sectionId: sec.id, academicYearId: yearId }, include: { student: true } });
    rows.sort((a, b) => a.student.fullName.localeCompare(b.student.fullName));
    for (const [i, row] of rows.entries()) await tx.enrolment.update({ where: { id: row.id }, data: { rollNo: i + 1 } });
  }
}

const classCache = new Map<string, string>();
async function classIdOf(tx: Tx, sectionId: string) {
  if (!classCache.has(sectionId)) classCache.set(sectionId, (await tx.section.findUniqueOrThrow({ where: { id: sectionId } })).classId);
  return classCache.get(sectionId)!;
}
