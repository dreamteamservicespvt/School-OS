// Add Staff step 3, "Classes and subjects" (09 §2; owner test 2026-11-05): two
// separate choices, so ticking a subject never makes anyone a class teacher.
// - "Class teacher of": one section at most, offered only when step 2 gives the
//   Class Teacher role (the class teacher takes the daily attendance, so needs it).
// - "Subjects taught": subject and section pairs, offered when the post teaches and
//   the roles chosen (if any) include a teaching role.
// A section that has a class teacher, and a subject and section with a primary
// teacher, are shown taken; a second (secondary) teacher is set in Teacher Allocation.

export const CLASS_TEACHER_ROLE = "class-teacher";
const TEACHING_ROLES = new Set(["teacher", "class-teacher", "principal", "vice-principal", "academic-head", "exam-in-charge"]);
const NON_TEACHING_READY = new Set(["school-admin", "accountant", "receptionist", "transport-in-charge", "librarian", "hostel-warden", "store-keeper", "hr", "office-staff", "admission-counsellor", "counsellor", "gate-security", "driver", "student"]);

export type StepThree = {
  /** "Class teacher of" is offered. */
  classTeacher: boolean;
  /** "Subjects taught" is offered. */
  subjects: boolean;
  /** Why a choice is not offered, in plain words (empty when both are). */
  notes: string[];
};

/**
 * What step 3 offers for the post and the roles chosen in step 2. A role the
 * school made itself (not one of the ready ones) may teach, so it keeps subjects.
 */
export function stepThree(o: { teachingPost: boolean; giveLogin: boolean; roleKeys: readonly string[] }): StepThree {
  const notes: string[] = [];
  if (!o.teachingPost) return { classTeacher: false, subjects: false, notes };
  const classTeacher = o.giveLogin && o.roleKeys.includes(CLASS_TEACHER_ROLE);
  if (!classTeacher) {
    notes.push(o.giveLogin
      ? "To make them a class teacher, tick the Class Teacher role in step 2."
      : "A class teacher takes the daily attendance, so needs a login with the Class Teacher role (step 2).");
  }
  const subjects = !o.giveLogin || o.roleKeys.some((k) => TEACHING_ROLES.has(k) || !NON_TEACHING_READY.has(k));
  if (!subjects) notes.push("The roles chosen in step 2 do not teach. To give subjects, tick the Teacher role in step 2.");
  return { classTeacher, subjects, notes };
}

/** The sections and the subjects with someone on them already, as shown on step 3. */
export type Taken = {
  /** Section id to the name of its class teacher. */
  classTeacher: Record<string, string>;
  /** "sectionId:subjectId" to the name of its primary teacher. */
  subject: Record<string, string>;
};

/** The pairs that can be given: those picked that nobody else has. */
export function freePairs(picked: Iterable<string>, taken: Taken): string[] {
  return [...new Set(picked)].filter((k) => !taken.subject[k]);
}

/** The one line under step 3 that says what was chosen. */
export function stepThreeSummary(o: { classTeacherOf: string | null; pairs: readonly string[] }): string {
  const sections = new Set(o.pairs.map((p) => p.split(":")[0])).size;
  const ct = o.classTeacherOf ? `Class teacher of ${o.classTeacherOf}.` : "Not a class teacher.";
  if (!o.pairs.length) return `${ct} No subjects chosen yet.`;
  const n = o.pairs.length;
  return `${ct} Teaches ${n} subject${n === 1 ? "" : "s"} across ${sections} section${sections === 1 ? "" : "s"} (one per subject and section).`;
}

/** The server's refusal of a class-teacher section, or null when it can be given. */
export function classTeacherRefusal(o: { giveLogin: boolean; roleKeys: readonly string[]; sectionLabel: string; currentTeacher: string | null }): string | null {
  if (!o.giveLogin || !o.roleKeys.includes(CLASS_TEACHER_ROLE)) {
    return "Step 3: a class teacher takes the daily attendance, so needs a login with the Class Teacher role. Tick Class Teacher in step 2, or choose \"Not a class teacher\".";
  }
  if (o.currentTeacher) return `Step 3: ${o.sectionLabel} already has a class teacher, ${o.currentTeacher}. Choose another section, or change it in Academic Management, Classes & Sections.`;
  return null;
}
