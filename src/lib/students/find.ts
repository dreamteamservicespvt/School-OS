// The one student search, used by every screen that finds a student: the
// Search box, Collect Fee and the ledger, the Student List and form pickers,
// student leave, front office, hostel, library, inventory, transport and
// Communication. The matching rules are in find-rules.ts.
//
// It runs inside withSchool(), so row-level security keeps it inside one
// school. It never widens what a person may see: the caller passes the
// person's own limit on students (`scope`) and any filter of its own
// (`where`), and every student returned passes both. Screens whose people do
// not see parents pass byParent: false.
//
// No database extension is needed: the database narrows the rows with plain
// string tests, and the rules in find-rules.ts decide and rank in the app.
// Its speed for a school of 2,000 students is measured in tests/students/find-speed.test.ts.
import "server-only";

import { Prisma, type StudentStatus } from "@prisma/client";
import type { Tx } from "../db";
import { CLOSE_RANK, closeParts, parseQuery, rankCandidate, sectionLabel, type ParsedQuery, type Ranked } from "./find-rules";
import { STUDYING } from "./labels";

export type FindStudentOptions = {
  /**
   * The person's limit on students, such as studentScope() from Student or Fee
   * Management. Pass {} only when the person may see every student.
   */
  scope: Prisma.StudentWhereInput;
  /** The screen's own filter, for example "students without a bed". */
  where?: Prisma.StudentWhereInput;
  /** The year whose class, section and roll number are shown and searched. */
  yearId: string | null;
  /** Default: students studying now (Admitted, Active, Promoted). "any": every status, left students too. */
  statuses?: readonly StudentStatus[] | "any";
  /** Archived records: left out (default), included, or only those. */
  archived?: "exclude" | "include" | "only";
  /** Match parents' names and phones. Pass false for people who may not see parents. Default true. */
  byParent?: boolean;
  /** At most this many (default 8). */
  take?: number;
  /** Close spellings: "ranked" after every other match (default), or "fallback" only when nothing else matches. */
  close?: "ranked" | "fallback";
};

export type StudentHit = {
  id: string;
  name: string;
  firstName: string;
  admissionNo: string;
  status: StudentStatus;
  archived: boolean;
  photoFileId: string | null;
  /** This year's class and section, e.g. "Class 5 A", or null with no class this year. */
  classSection: string | null;
  classId: string | null;
  sectionId: string | null;
  rollNo: number | null;
  /** How it matched: admission number, name, roll number, a parent's phone or a parent's name. */
  by: Ranked["by"];
  /** Matched on a close spelling (one letter wrong), not what was typed. */
  close: boolean;
  /** The parent whose name or phone matched. */
  parent: string | null;
  rank: number;
};

type Row = {
  id: string;
  full_name: string;
  first_name: string;
  admission_no: string;
  status: StudentStatus;
  archived: boolean;
  photo_file_id: string | null;
  class_id: string | null;
  section_id: string | null;
  roll_no: number | null;
  class_name: string | null;
  section_name: string | null;
  parents: { name: string; phone: string; alt: string | null }[];
};

const isEmpty = (w: Prisma.StudentWhereInput | undefined) => !w || Object.keys(w).length === 0;
const STUDYING_SET = new Set<string>(STUDYING);
/** One collator for sorting names (making one per comparison is slow). */
const NAMES = new Intl.Collator("en", { sensitivity: "base" });
/** Most rows the database sends for ranking in a picker; list filters take up to LIST_LIMIT. */
const CANDIDATES = 3000;
const LIST_LIMIT = 20000;
/**
 * Characters that separate words, for the database's prefilter: spaces and
 * common punctuation, the same ones words() in find-rules.ts splits on.
 */
const SEPARATORS = " .,;:/\\|()[]{}'\"`-_&+*#@!?~^=<>%$\t\u00a0\u2013\u2014\u2018\u2019\u201c\u201d\u00b7";
const SPACES = " ".repeat(Array.from(SEPARATORS).length);

/** Students matching a search, best first. Empty for an empty search. */
export async function findStudents(tx: Tx, rawQ: string, opts: FindStudentOptions): Promise<StudentHit[]> {
  const q = parseQuery(String(rawQ ?? ""));
  if (!q.lower) return [];
  const take = opts.take ?? 8;
  const byParent = opts.byParent ?? true;

  // The person's limit and the screen's filter, checked on the students found
  // (few), so a narrow limit never has to list every student it allows.
  const restricted = !isEmpty(opts.scope) || !isEmpty(opts.where);
  // One letter matches most of the school: a picker over the whole school
  // needs only the first few names starting with it, which come first.
  const oneLetter = Array.from(q.lower).length < 2 && take <= 50 && !restricted;
  const filter: Filter = { statuses: opts.statuses === "any" ? null : [...(opts.statuses ?? STUDYING)], archived: opts.archived ?? "exclude", yearId: opts.yearId, byParent, limit: oneLetter ? 200 : Math.max(CANDIDATES, take) };
  const allowed = async (hits: StudentHit[]) => {
    if (!restricted || !hits.length) return hits;
    const ok = new Set((await tx.student.findMany({ where: { AND: [opts.scope, opts.where ?? {}, { id: { in: hits.map((h) => h.id) } }] }, select: { id: true } })).map((r) => r.id));
    return hits.filter((h) => ok.has(h.id));
  };

  // First what was typed (number, name, roll, phone); close spellings only when that is not enough.
  const typed = rank(q, await candidates(tx, q, filter, "typed", []), byParent);
  const hits = await allowed(typed);
  const fallback = opts.close === "fallback";
  const enough = fallback ? hits.some((h) => !h.close) : hits.length >= take;
  if (!enough && q.tokens.some((t) => closeParts(t))) {
    hits.push(...(await allowed(rank(q, await candidates(tx, q, filter, "close", typed.map((h) => h.id)), byParent))));
  }
  hits.sort((a, b) => a.rank - b.rank
    || Number(!STUDYING_SET.has(a.status)) - Number(!STUDYING_SET.has(b.status))
    || NAMES.compare(a.name, b.name)
    || a.admissionNo.localeCompare(b.admissionNo));
  const sure = hits.filter((h) => !h.close);
  return (fallback && sure.length ? sure : hits).slice(0, take);
}

/**
 * Ids of every student matching a search, best first, for list filters
 * (Student List, hostel and library lists). Close spellings only when nothing
 * else matches, so a filtered list never fills with near names.
 */
export async function studentIdsMatching(tx: Tx, rawQ: string, opts: Omit<FindStudentOptions, "take" | "close">): Promise<string[]> {
  return (await findStudents(tx, rawQ, { ...opts, take: LIST_LIMIT, close: "fallback" })).map((h) => h.id);
}

/**
 * For a list of other records filtered by student (certificates, leaving
 * records, outings, fines, concessions...): ids of every student matching the
 * search, any status, archived too. Not by parents, as before.
 */
export function studentIdsForFilter(tx: Tx, rawQ: string): Promise<string[]> {
  return studentIdsMatching(tx, rawQ, { scope: {}, yearId: null, statuses: "any", archived: "include", byParent: false });
}

type Filter = {
  statuses: string[] | null;
  archived: "exclude" | "include" | "only";
  yearId: string | null;
  byParent: boolean;
  limit: number;
};

const TRUE = Prisma.sql`true`;
const FALSE = Prisma.sql`false`;

/**
 * The database's prefilter: every row the rules in find-rules.ts can match, and
 * a few more. Plain string tests only (no regular expressions), so it is quick.
 * "typed": each typed word is somewhere in the name (or a parent's name), or
 * the search is in the admission number, a parent's phone or a roll number.
 * "close": for each typed word the name has a word starting with its first
 * part, or contains its last part, which any one-letter slip leaves intact.
 *
 * One statement, sent back as one JSON value (much quicker to read than many
 * rows). The guardians who pass the prefilter, their links, the students with
 * the roll number, and the classes of the students found are each read once by
 * a list of ids: plans that cannot go wrong on tables without statistics yet,
 * or with statistics from before the school's students were added (joins here
 * were once worked out again for every student, and later for every pair of
 * parent link and guardian).
 */
async function candidates(tx: Tx, q: ParsedQuery, f: Filter, pass: "typed" | "close", exclude: string[]): Promise<Row[]> {
  const typed = pass === "typed";
  const short = Array.from(q.lower).length < 2;
  const spaced = (name: Prisma.Sql) => Prisma.sql`(' ' || translate(${name}, ${SEPARATORS}, ${SPACES}))`;
  const nameHit = (name: Prisma.Sql) => {
    if (!q.tokens.length) return FALSE;
    const each = q.tokens.map((t) => {
      if (typed) return short ? Prisma.sql`strpos(${spaced(name)}, ${` ${t}`}) > 0` : Prisma.sql`strpos(${name}, ${t}) > 0`;
      const part = closeParts(t);
      return part ? Prisma.sql`(strpos(${spaced(name)}, ${` ${part.start}`}) > 0 OR strpos(${name}, ${part.part}) > 0)` : Prisma.sql`strpos(${name}, ${t}) > 0`;
    });
    return Prisma.sql`(${Prisma.join(each, " AND ")})`;
  };
  // Phones are kept as digits (10-digit mobile numbers).
  const phone = (col: Prisma.Sql) => Prisma.sql`strpos(${col}, ${q.digits ?? ""}) > 0`;

  const studentHit = typed
    ? Prisma.sql`(${short ? Prisma.sql`starts_with(lower(s.admission_no), ${q.lower})` : Prisma.sql`strpos(lower(s.admission_no), ${q.lower}) > 0`}
        OR ${q.compact && !short ? Prisma.sql`strpos(translate(lower(s.admission_no), ${SEPARATORS}, ''), ${q.compact}) > 0` : FALSE}
        OR ${nameHit(Prisma.sql`lower(s.full_name)`)}
        OR ${q.roll ? Prisma.sql`s.id = ANY(ARRAY(SELECT e.student_id FROM enrolment e WHERE e.academic_year_id = ${f.yearId}::uuid AND e.archived_at IS NULL AND e.roll_no = ${q.roll.rollNo}))` : FALSE})`
    : nameHit(Prisma.sql`lower(s.full_name)`);
  const guardianHit = typed
    ? Prisma.sql`(${nameHit(Prisma.sql`lower(g.name)`)} OR ${q.digits ? Prisma.sql`${phone(Prisma.sql`g.phone`)} OR ${phone(Prisma.sql`coalesce(g.alt_phone, '')`)}` : FALSE})`
    : nameHit(Prisma.sql`lower(g.name)`);

  // Every costly string test runs once per row of its own table, and each
  // step after that reads by a list of ids, joined up here in the app. A plan
  // that pairs rows cannot multiply them: with statistics from before a
  // school's students were added (a new school on a busy server), the planner
  // once paired each parent link with every guardian, testing names 4 million
  // times (36 seconds for one search).
  const query = Prisma.sql`
    WITH gm AS MATERIALIZED (
      SELECT g.id, g.name, g.phone, g.alt_phone AS alt
      FROM guardian g
      WHERE ${f.byParent ? TRUE : FALSE} AND g.archived_at IS NULL AND ${guardianHit}
    ),
    p AS MATERIALIZED (
      SELECT sg.student_id, sg.guardian_id
      FROM student_guardian sg
      WHERE sg.archived_at IS NULL AND sg.guardian_id = ANY(ARRAY(SELECT id FROM gm))
    ),
    found AS MATERIALIZED (
      SELECT s.id, s.full_name, s.first_name, s.admission_no, s.status, s.archived_at IS NOT NULL AS archived, s.photo_file_id
      FROM student s
      WHERE ${exclude.length ? Prisma.sql`NOT (s.id = ANY(${exclude}::uuid[]))` : TRUE}
        AND ${f.statuses ? Prisma.sql`s.status::text = ANY(${f.statuses}::text[])` : TRUE}
        AND ${f.archived === "exclude" ? Prisma.sql`s.archived_at IS NULL` : f.archived === "only" ? Prisma.sql`s.archived_at IS NOT NULL` : TRUE}
        AND (s.id = ANY(ARRAY(SELECT student_id FROM p)) OR ${studentHit})
      ORDER BY CASE WHEN lower(s.admission_no) = ${q.lower} THEN 0
                    WHEN lower(s.full_name) = ${q.lower} THEN 1
                    WHEN starts_with(lower(s.admission_no), ${q.lower}) OR starts_with(lower(s.full_name), ${q.tokens[0] ?? q.lower}) THEN 2
                    ELSE 3 END, s.status::text <> ALL(${[...STUDYING]}::text[]), s.full_name
      LIMIT ${f.limit}
    ),
    en AS MATERIALIZED (
      SELECT e.student_id, e.class_id, e.section_id, e.roll_no
      FROM enrolment e
      WHERE e.student_id = ANY(ARRAY(SELECT id FROM found)) AND e.academic_year_id = ${f.yearId}::uuid AND e.archived_at IS NULL
    ),
    secs AS MATERIALIZED (
      SELECT sec.id, sec.name, c.name AS class_name
      FROM section sec LEFT JOIN school_class c ON c.id = sec.class_id
      WHERE sec.id = ANY(ARRAY(SELECT DISTINCT section_id FROM en WHERE section_id IS NOT NULL))
    )
    SELECT
      (SELECT coalesce(json_agg(found), '[]'::json) FROM found) AS students,
      (SELECT coalesce(json_agg(en), '[]'::json) FROM en) AS enrolments,
      (SELECT coalesce(json_agg(secs), '[]'::json) FROM secs) AS sections,
      (SELECT coalesce(json_agg(p), '[]'::json) FROM p) AS links,
      (SELECT coalesce(json_agg(gm), '[]'::json) FROM gm) AS guardians`;
  type Enrolled = { student_id: string; class_id: string | null; section_id: string | null; roll_no: number | null };
  const [out] = await tx.$queryRaw<{
    students: Omit<Row, "parents" | "class_id" | "section_id" | "roll_no" | "class_name" | "section_name">[];
    enrolments: Enrolled[];
    sections: { id: string; name: string; class_name: string | null }[];
    links: { student_id: string; guardian_id: string }[];
    guardians: { id: string; name: string; phone: string; alt: string | null }[];
  }[]>(query);

  const enrolled = new Map(out.enrolments.map((e) => [e.student_id, e]));
  const sections = new Map(out.sections.map((x) => [x.id, x]));
  const guardians = new Map(out.guardians.map((g) => [g.id, g]));
  const parents = new Map<string, Row["parents"]>();
  for (const l of out.links) {
    const g = guardians.get(l.guardian_id);
    if (g) parents.set(l.student_id, [...(parents.get(l.student_id) ?? []), { name: g.name, phone: g.phone, alt: g.alt }]);
  }
  return out.students.map((r) => {
    const e = enrolled.get(r.id);
    const sec = e?.section_id ? sections.get(e.section_id) : undefined;
    return { ...r, class_id: e?.class_id ?? null, section_id: e?.section_id ?? null, roll_no: e?.roll_no ?? null, class_name: sec?.class_name ?? null, section_name: sec?.name ?? null, parents: parents.get(r.id) ?? [] };
  });
}

const digitsOf = (p: string | null) => (p ?? "").replace(/\D/g, "");

/** The rows that really match, with how. */
function rank(q: ParsedQuery, rows: Row[], byParent: boolean): StudentHit[] {
  const hits: StudentHit[] = [];
  for (const r of rows) {
    const placed = r.class_name !== null && r.section_name !== null;
    const ranked = rankCandidate(q, {
      fullName: r.full_name,
      admissionNo: r.admission_no,
      rollNo: r.roll_no,
      rollLabel: placed ? sectionLabel(r.class_name!, r.section_name!) : null,
      parents: r.parents.map((p) => ({ name: p.name, phones: [digitsOf(p.phone), digitsOf(p.alt)].filter(Boolean) })),
    }, { byParent });
    if (!ranked) continue;
    hits.push({
      id: r.id, name: r.full_name, firstName: r.first_name, admissionNo: r.admission_no, status: r.status, archived: r.archived, photoFileId: r.photo_file_id,
      classSection: placed ? `${r.class_name} ${r.section_name}` : null,
      classId: r.class_id, sectionId: r.section_id, rollNo: r.roll_no,
      by: ranked.by, close: ranked.rank >= CLOSE_RANK, parent: ranked.parent, rank: ranked.rank,
    });
  }
  return hits;
}
