// Who sees what in Homework & Learning (05-roles.md, the approved prototype's
// config.js OWN, OWN_BY_ROLE and DUTY, and the owner's 13 Oct request that
// each role sees only the work they really do):
//   Own staff (Teacher, Class Teacher): every page but Homework Settings, only
//     their own classes and subjects from Teacher Allocation; a class teacher
//     also reads the homework of every subject of their own section.
// Who does the desk work is in src/lib/duty.ts (DUTY):
//   Principal and School Admin watch and remind: Homework (with who gives how
//     much and Remind), Learning Progress and Homework Settings. They do not
//     do a teacher's desk work, so Submissions, Study Material, Quizzes,
//     Discussions and Online Classes are not in their menu.
//   Vice Principal and Academic Head read every teaching page (view only) and
//     run Learning Progress and Homework Settings.
//   Any other role with Full reach (a school's own role) works on every page.
//   Student (schools giving students logins): Homework, Study Material,
//     Quizzes, Discussions and Online Classes, only their own work.
// Study Material, Quizzes, Discussions and Online Classes are optional pages
// the school switches on in Homework Settings (School Feature records).
import type { PermissionMap } from "../permissions";
import { pageMode, type DutyPerson } from "../duty";

export type HomeworkLevel = "full" | "own" | "student";
/** On one page: "edit" does the work there, "view" reads it. */
export type PageMode = "edit" | "view";

export const HOMEWORK_PAGES = {
  homework: { label: "Homework", levels: ["full", "own", "student"] },
  submissions: { label: "Submissions & Grading", levels: ["full", "own"] },
  "study-material": { label: "Study Material", levels: ["full", "own", "student"] },
  quizzes: { label: "Quizzes", levels: ["full", "own", "student"] },
  discussions: { label: "Discussions", levels: ["full", "own", "student"] },
  "online-classes": { label: "Online Classes", levels: ["full", "own", "student"] },
  "learning-progress": { label: "Learning Progress", levels: ["full", "own"] },
  settings: { label: "Homework Settings", levels: ["full"] },
} as const satisfies Record<string, { label: string; levels: readonly HomeworkLevel[] }>;

export type HomeworkPageKey = keyof typeof HOMEWORK_PAGES;
export const PAGE_KEYS = Object.keys(HOMEWORK_PAGES) as HomeworkPageKey[];

/** The optional pages and the School Feature that switches each on (Homework Settings, "Optional pages"). */
export const OPTIONAL_PAGES = [
  { page: "study-material", feature: "homework-study-material", label: "Study Material", sub: "Notes, documents and videos for each class and subject" },
  { page: "quizzes", feature: "homework-quizzes", label: "Quizzes", sub: "Quizzes that mark themselves" },
  { page: "discussions", feature: "homework-discussions", label: "Discussions", sub: "Class boards for questions and answers" },
  { page: "online-classes", feature: "homework-online-classes", label: "Online Classes", sub: "Schedule, meeting links, attendance and recordings" },
] as const satisfies readonly { page: HomeworkPageKey; feature: string; label: string; sub: string }[];

export type OptionalFeature = (typeof OPTIONAL_PAGES)[number]["feature"];

/** Staff roles whose "Own" here means their own classes (not a student's own work). */
const STAFF_OWN_ROLES = new Set(["teacher", "class-teacher"]);

export function homeworkLevel(permissions: PermissionMap, roles: readonly { key: string | null }[]): HomeworkLevel | null {
  const a = permissions["homework-learning"];
  if (!a || a.see === "none") return null;
  if (a.see === "all") return "full";
  const keys = roles.map((r) => r.key ?? "");
  if (keys.includes("student") && !keys.some((k) => STAFF_OWN_ROLES.has(k))) return "student";
  return "own";
}

/**
 * Edit, view or not at all, for each page: the level's pages, narrowed for the
 * roles that oversee rather than teach (DUTY in src/lib/duty.ts). Several roles give the widest.
 */
export function pageModes(permissions: PermissionMap, roles: DutyPerson["roles"]): Record<HomeworkPageKey, PageMode | null> {
  const level = homeworkLevel(permissions, roles);
  const out = {} as Record<HomeworkPageKey, PageMode | null>;
  const change = permissions["homework-learning"]?.change ?? "none";
  for (const page of PAGE_KEYS) {
    if (!level || !(HOMEWORK_PAGES[page].levels as readonly HomeworkLevel[]).includes(level)) { out[page] = null; continue; }
    if (level !== "full") { out[page] = "edit"; continue; }
    // A role that sees everything but changes nothing reads every page.
    if (change !== "all") { out[page] = "view"; continue; }
    const m = pageMode({ roles }, "homework-learning", page);
    out[page] = m === "hidden" ? null : m === "full" ? "edit" : "view";
  }
  return out;
}

export function featureForPage(page: HomeworkPageKey): OptionalFeature | null {
  return OPTIONAL_PAGES.find((o) => o.page === page)?.feature ?? null;
}

/** May this person open this page, with the school's optional pages as they are switched? */
export function homeworkPageAllowed(modes: Record<HomeworkPageKey, PageMode | null>, features: ReadonlySet<string>, page: HomeworkPageKey) {
  if (!modes[page]) return false;
  const f = featureForPage(page);
  return !f || features.has(f);
}

/** Changes (giving homework, grading, lessons, quizzes, classes) need Full or Own; the Student only hands in work. */
export const staffLevel = (level: HomeworkLevel | null): level is "full" | "own" => level === "full" || level === "own";

export class HomeworkProblem extends Error {
  field?: string;
  link?: { href: string; label: string };
  constructor(message: string, field?: string, link?: { href: string; label: string }) {
    super(message);
    this.name = "HomeworkProblem";
    this.field = field;
    this.link = link;
  }
}
