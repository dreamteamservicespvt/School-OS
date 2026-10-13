// Who sees what in Homework & Learning (05-roles.md, the approved prototype's
// config.js OWN and OWN_BY_ROLE, and the design thread's role audit):
//   Full (Principal, School Admin, Vice Principal, Academic Head): every page,
//     every class and subject.
//   Own staff (Teacher, Class Teacher): every page but Homework Settings, only
//     their own classes and subjects from Teacher Allocation; a class teacher
//     also reads the homework of every subject of their own section.
//   Student (schools giving students logins): Homework, Study Material,
//     Quizzes, Discussions and Online Classes, only their own work.
// Study Material, Quizzes, Discussions and Online Classes are optional pages
// the school switches on in Homework Settings (School Feature records).
import type { PermissionMap } from "../permissions";

export type HomeworkLevel = "full" | "own" | "student";

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

export function featureForPage(page: HomeworkPageKey): OptionalFeature | null {
  return OPTIONAL_PAGES.find((o) => o.page === page)?.feature ?? null;
}

/** May this person open this page, with the school's optional pages as they are switched? */
export function homeworkPageAllowed(level: HomeworkLevel | null, features: ReadonlySet<string>, page: HomeworkPageKey) {
  if (!level) return false;
  if (!(HOMEWORK_PAGES[page].levels as readonly HomeworkLevel[]).includes(level)) return false;
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
