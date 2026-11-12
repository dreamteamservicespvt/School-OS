// The shared campus-scoped read layer (owner decision 2026-11-12, after audit
// runs 2 and 3 kept finding One-campus gaps: the campus filter was written by
// hand in each query).
//
// campusFilter(tx, model, who) gives the `where` piece that keeps a read of ANY
// record type to the person's campus, worked out once from the database
// schema:
//   - a record with its own campus (Student, Staff, Class, Academic Year...)
//     is matched on it;
//   - a record linked to a student, section, staff member or class is matched
//     through that link (Payment -> student, Attendance Correction -> section
//     -> class);
//   - a record that only holds the id (Fee Due's studentId, a Book Issue's
//     studentId or staffId) is matched on the ids of that campus's students,
//     staff, sections or classes.
// A record whose campus link is empty belongs to the whole school and stays
// visible (the same rule as campusAllows in ./campus.ts). For the whole
// school it is {}. campusWhere(model, who) is the same without the database,
// for record types that have a link (it throws for the id-only ones).
//
//   tx.bookIssue.findMany({ where: { AND: [await campusFilter(tx, "BookIssue", who), { returnedAt: null }] } })
//
// tests/campus-guard.test.ts fails when a list read of a campus-bearing record
// type is added without a campus filter.
import "server-only";

import { Prisma } from "@prisma/client";
import type { CampusLimit } from "./campus";
import type { Tx } from "./db";

type WhereOf<M extends Prisma.ModelName> = NonNullable<Prisma.TypeMap["model"][M]["operations"]["findMany"]["args"]["where"]>;

/** One step of the way from a record to its campus: a relation field, and whether it may be empty. */
export type CampusStep = { field: string; optional: boolean };
/** Records that hold a person's, section's or class's id with no link to it. */
export type CampusIdColumn = { field: string; of: "Student" | "Staff" | "Section" | "SchoolClass"; optional: boolean };

export type CampusWay =
  | { kind: "link"; steps: CampusStep[]; campusOptional: boolean; target: string }
  | { kind: "ids"; columns: CampusIdColumn[] };

type Model = (typeof Prisma.dmmf.datamodel.models)[number];
const MODELS = new Map<string, Model>(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));

// When a record links to several campus-bearing records, the person-and-class
// links decide (a Payment's campus is its student's, not its year's).
const PREFER = ["Student", "Section", "Staff", "SchoolClass"];
const ID_COLUMNS: Record<string, CampusIdColumn["of"]> = { studentId: "Student", staffId: "Staff", sectionId: "Section", classId: "SchoolClass", schoolClassId: "SchoolClass" };

function ownCampusField(m: Model | undefined) {
  return m?.fields.find((f) => f.name === "campusId" && f.kind === "scalar");
}

type Node = { model: string; steps: CampusStep[] };

/** The shortest links (up to 3 steps) from a record type to a record with its own campus. */
function linkWays(model: string): Node[] {
  let level: Node[] = [{ model, steps: [] }];
  for (let depth = 0; depth <= 3 && level.length; depth++) {
    const hits = level.filter((n) => ownCampusField(MODELS.get(n.model)));
    if (hits.length) return hits;
    const next: Node[] = [];
    for (const n of level) {
      for (const f of MODELS.get(n.model)!.fields) {
        // Only the record's own links (it holds the id), never lists of children.
        if (f.kind !== "object" || f.isList || !f.relationFromFields?.length) continue;
        if (f.type === model || n.steps.some((s) => s.field === f.name)) continue;
        next.push({ model: f.type, steps: [...n.steps, { field: f.name, optional: !f.isRequired }] });
      }
    }
    level = next;
  }
  return [];
}

const ways = new Map<string, CampusWay | null>();

/**
 * How a record type reaches its campus: its own campus, a link through a
 * student, section, staff member or class (shortest, required before
 * optional), the bare ids of those, or else a link through another record
 * (such as its academic year). Null when it has no campus: it belongs to the
 * whole school.
 */
export function campusWay(model: string): CampusWay | null {
  if (ways.has(model)) return ways.get(model)!;
  const m = MODELS.get(model);
  let way: CampusWay | null = null;
  if (m) {
    const firstType = (n: Node) => (n.steps.length ? m.fields.find((f) => f.name === n.steps[0].field)!.type : model);
    const rank = (n: Node) => (n.steps.some((s) => s.optional) ? 100 : 0) + (n.steps.length ? (PREFER.includes(firstType(n)) ? PREFER.indexOf(firstType(n)) : 10) : -1);
    const links = linkWays(model).sort((a, b) => rank(a) - rank(b));
    const viaPerson = links.find((n) => !n.steps.length || PREFER.includes(firstType(n)));
    const columns = m.fields
      .filter((f) => f.kind === "scalar" && ID_COLUMNS[f.name])
      // An id already used by a link is matched through the link.
      .filter((f) => !m.fields.some((r) => r.kind === "object" && r.relationFromFields?.includes(f.name)))
      .map((f) => ({ field: f.name, of: ID_COLUMNS[f.name], optional: !f.isRequired }))
      .sort((a, b) => PREFER.indexOf(a.of) - PREFER.indexOf(b.of));
    // A record that always names a student (or section) belongs to that one's campus
    // (a PTM note's teacher may be from another campus); otherwise any of its people decides.
    if (columns.length > 1 && !columns[0].optional) columns.splice(1);
    const pick = (n: Node): CampusWay => ({ kind: "link", steps: n.steps, campusOptional: !ownCampusField(MODELS.get(n.model))!.isRequired, target: n.model });
    if (viaPerson) way = pick(viaPerson);
    else if (columns.length) way = { kind: "ids", columns };
    else if (links.length) way = pick(links[0]);
  }
  ways.set(model, way);
  return way;
}

/** Does this record type belong to a campus (directly, through a link, or by a person's or section's id)? */
export function isCampusBearing(model: string): boolean {
  return campusWay(model) !== null;
}

function linkWhere(steps: CampusStep[], campusId: string, campusOptional: boolean): Record<string, unknown> {
  if (!steps.length) return campusOptional ? { OR: [{ campusId }, { campusId: null }] } : { campusId };
  const [first, ...rest] = steps;
  const inner = { [first.field]: linkWhere(rest, campusId, campusOptional) };
  // An empty link means the whole school (campusAllows): kept visible.
  return first.optional ? { OR: [inner, { [first.field]: null }] } : inner;
}

function wayOf(model: string): CampusWay {
  const way = campusWay(model);
  if (!way) throw new Error(`campusFilter: ${model} has no campus; it belongs to the whole school.`);
  return way;
}

/**
 * The `where` piece that keeps a read of `model` to the person's campus ({}
 * for the whole school), for record types with a link to their campus.
 * Throws for a record type with no campus, or one that holds only ids (use
 * campusFilter), so a wrong name is never silently "every campus".
 */
export function campusWhere<M extends Prisma.ModelName>(model: M, limit: CampusLimit | null | undefined): WhereOf<M> {
  const way = wayOf(model);
  if (way.kind !== "link") throw new Error(`campusWhere: ${model} holds only ids; use campusFilter(tx, "${model}", who).`);
  if (!limit?.campusId) return {} as WhereOf<M>;
  return linkWhere(way.steps, limit.campusId, way.campusOptional) as WhereOf<M>;
}

/** The ids of the campus's students, staff, sections or classes (every year). */
async function idsOf(tx: Tx, of: CampusIdColumn["of"], campusId: string): Promise<string[]> {
  const pick = { select: { id: true } } as const;
  if (of === "Student") return (await tx.student.findMany({ where: { campusId }, ...pick })).map((r) => r.id);
  if (of === "Staff") return (await tx.staff.findMany({ where: { campusId }, ...pick })).map((r) => r.id);
  if (of === "SchoolClass") return (await tx.schoolClass.findMany({ where: { campusId }, ...pick })).map((r) => r.id);
  return (await tx.section.findMany({ where: { schoolClass: { campusId } }, ...pick })).map((r) => r.id);
}

/** The `where` piece that keeps a read of any campus-bearing `model` to the person's campus ({} for the whole school). */
export async function campusFilter<M extends Prisma.ModelName>(tx: Tx, model: M, limit: CampusLimit | null | undefined): Promise<WhereOf<M>> {
  const way = wayOf(model);
  if (way.kind === "link") return campusWhere(model, limit);
  if (!limit?.campusId) return {} as WhereOf<M>;
  const or: Record<string, unknown>[] = [];
  for (const c of way.columns) or.push({ [c.field]: { in: await idsOf(tx, c.of, limit.campusId) } });
  // A record with none of its ids set belongs to the whole school (campusAllows).
  if (way.columns.every((c) => c.optional)) or.push(Object.fromEntries(way.columns.map((c) => [c.field, null])));
  return (or.length === 1 ? or[0] : { OR: or }) as WhereOf<M>;
}
