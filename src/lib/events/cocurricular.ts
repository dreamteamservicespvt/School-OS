// Co-curricular & Sports (18 §2): activities and achievements with
// participation and achievement certificates, activity credits (optional),
// houses with house points and the leaderboard, clubs with members and
// meetings, and sports teams with training attendance, fixtures and fitness
// records. Achievements, houses, clubs and the credits total also show on the
// Student Profile. Changes to points and credits always carry a reason and
// are kept (18 §5); nothing is deleted.
import "server-only";

import type { Achievement, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { assertYearOpen } from "../academic/years";
import { formatNumber, nextNumber } from "../sequences";
import { sendMessage, MessagingProblem } from "../messaging";

/** The certificate message: {child} and {certificate} are filled per child. */
export const certificateText = (school: string) => `Dear Parent, congratulations! {child} has been given {certificate}. The printed certificate comes home with the class teacher. - ${school}`;
import { EventsProblem } from "./problem";
import { creditsFor, eventsSettings } from "./settings";
import { placeOrder, placesOf } from "./places";
import { dayOf, dmy, isoOf } from "./words";

export const HOUSE_COLOURS = [
  { value: "info", label: "Blue" },
  { value: "ok", label: "Green" },
  { value: "warn", label: "Yellow" },
  { value: "bad", label: "Red" },
  { value: "brand", label: "Royal blue" },
] as const;
export const isHouseColour = (v: string) => HOUSE_COLOURS.some((c) => c.value === v);

export const LEVEL_TONE: Record<string, "neutral" | "info" | "brand" | "ok"> = { School: "neutral", District: "info", State: "brand", National: "ok" };

export const FIXTURE_RESULTS = [
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
  { value: "DRAW", label: "Draw" },
  { value: "PLACED", label: "Placed" },
] as const;
export const GROUNDS = [
  { value: "HOME", label: "Home" },
  { value: "AWAY", label: "Away" },
  { value: "NEUTRAL", label: "Neutral venue" },
] as const;

const clean = (v: string) => v.trim().replace(/\s+/g, " ");

/** The school year a date falls in (open for changes). */
export async function yearOf(tx: Tx, iso: string, field = "date") {
  const y = await tx.academicYear.findFirst({ where: { archivedAt: null, startDate: { lte: dayOf(iso) }, endDate: { gte: dayOf(iso) } } });
  if (!y) throw new EventsProblem("Pick a date inside the school year.", field);
  await assertYearOpen(tx, y.id);
  return y;
}

/** Students studying this year among these ids. */
async function studying(tx: Tx, yearId: string, studentIds: string[]) {
  if (!studentIds.length) return new Set<string>();
  const rows = await tx.enrolment.findMany({ where: { studentId: { in: studentIds }, academicYearId: yearId, archivedAt: null, status: "STUDYING" }, select: { studentId: true } });
  return new Set(rows.map((r) => r.studentId));
}

async function schoolName(tx: Tx, ctx: SchoolContext) {
  return (await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { name: true } }))?.name ?? "School";
}

/* ---------- Achievements, certificates and activity credits ---------- */

export type AchievementInput = {
  studentIds: string[];
  activity: string;
  kind: string;
  level: string;
  position: string | null;
  won: boolean;
  date: string;
  eventId?: string | null;
  teamId?: string | null;
  certificate: boolean;
};

/** Records participation or a result for one or many students (a whole team or class at once). */
export async function recordAchievements(tx: Tx, ctx: SchoolContext, input: AchievementInput, today: string) {
  const activity = clean(input.activity);
  if (activity.length < 3) throw new EventsProblem("Name the activity or competition.", "activity");
  if (activity.length > 120) throw new EventsProblem("The activity can be at most 120 characters.", "activity");
  const s = await eventsSettings(tx, ctx);
  if (!s.levels.includes(input.level)) throw new EventsProblem("Choose the level.", "level");
  if (!s.activityKinds.includes(input.kind)) throw new EventsProblem("Choose what kind of activity it is.", "kind");
  if (input.date > today) throw new EventsProblem("The date cannot be in the future. Record it on or after the day.", "date");
  const position = input.position ? clean(input.position).slice(0, 60) : null;
  const wanted = [...new Set(input.studentIds)];
  if (!wanted.length) throw new EventsProblem("Choose the students.", "studentIds");
  if (wanted.length > 300) throw new EventsProblem("Record at most 300 students at once.", "studentIds");
  const year = await yearOf(tx, input.date);
  const ok = await studying(tx, year.id, wanted);
  const missing = wanted.filter((x) => !ok.has(x));
  if (missing.length) throw new EventsProblem(missing.length === wanted.length ? "These students are not studying in the school in that year." : `${missing.length} of the chosen students were not studying in that year. Take them off and try again.`, "studentIds");
  if (input.teamId && !(await tx.sportsTeam.findFirst({ where: { id: input.teamId, archivedAt: null } }))) throw new EventsProblem("This team was not found.", "teamId");
  const credits = creditsFor(s, input.level, input.won);
  const made: Achievement[] = [];
  for (const studentId of wanted) {
    const a = await tx.achievement.create({
      data: {
        schoolId: ctx.schoolId, academicYearId: year.id, studentId, activity, kind: input.kind, level: input.level, position: position ?? (input.won ? null : "Took part"), won: input.won,
        date: dayOf(input.date), eventId: input.eventId ?? null, teamId: input.teamId ?? null, createdById: ctx.userId,
      },
    });
    if (credits > 0) {
      await tx.activityCreditEntry.create({ data: { schoolId: ctx.schoolId, academicYearId: year.id, studentId, achievementId: a.id, points: credits, reason: `${activity} (${input.level.toLowerCase()} level${input.won ? ", result" : ", taking part"})`, date: dayOf(input.date), givenById: ctx.userId } });
    }
    made.push(a);
  }
  await writeAudit(tx, ctx, { action: "recorded", recordType: "Achievement", recordId: made[0].id, after: { activity, level: input.level, position, students: made.length, credits: credits || null } });
  let told = 0;
  if (input.certificate) told = (await issueCertificates(tx, ctx, made.map((m) => m.id))).told;
  return { made, credits, told };
}

/** A certificate's kind in Settings, Document Designs. */
export const certificateKind = (a: Pick<Achievement, "won">) => (a.won ? "achievement-certificate" : "participation-certificate");

/** Gives each achievement its certificate number (once) and tells the parents. */
export async function issueCertificates(tx: Tx, ctx: SchoolContext, achievementIds: string[], opts: { tell?: boolean } = {}) {
  const rows = await tx.achievement.findMany({ where: { id: { in: achievementIds }, archivedAt: null } });
  if (!rows.length) throw new EventsProblem("Choose the achievements.");
  const todo = rows.filter((r) => !r.certificateNo);
  if (!todo.length) throw new EventsProblem(rows.length === 1 ? "This certificate is already issued. Print it again from the list." : "These certificates are already issued.");
  const now = new Date();
  const year = now.getUTCFullYear();
  for (const a of todo) {
    const n = await nextNumber(tx, ctx, `achievement-certificate:${year}`);
    await tx.achievement.update({ where: { id: a.id }, data: { certificateNo: formatNumber(`CC/${year}/`, n), certificateAt: now, certificateById: ctx.userId } });
  }
  let told = 0;
  if (opts.tell !== false) {
    const school = await schoolName(tx, ctx);
    const students = await tx.student.findMany({ where: { id: { in: todo.map((t) => t.studentId) } }, select: { id: true, firstName: true } });
    const perStudent = Object.fromEntries(todo.map((a) => [a.studentId, { certificate: `${a.won ? "an achievement" : "a participation"} certificate for ${a.activity}${a.position && a.won ? ` (${a.position})` : ""}`, child: students.find((s) => s.id === a.studentId)?.firstName ?? "your child" }]));
    try {
      const r = await sendMessage(tx, ctx, {
        to: { guardiansOf: [...new Set(todo.map((t) => t.studentId))] }, channels: "preferred",
        text: certificateText(school),
        perStudent, trigger: "Certificate issued", source: { type: "Achievement", id: todo[0].id },
      });
      told = r.people;
    } catch (e) {
      // The certificate is issued either way; it can be printed from the list.
      if (!(e instanceof MessagingProblem)) throw e;
    }
  }
  await writeAudit(tx, ctx, { action: "certificates-issued", recordType: "Achievement", recordId: todo[0].id, after: { count: todo.length, parentsTold: told } });
  return { issued: todo.length, told };
}

/** Takes an achievement off the record (kept, archived) with a reason; its credits are reversed with the same reason. */
export async function archiveAchievement(tx: Tx, ctx: SchoolContext, achievementId: string, reason: string, today: string) {
  const a = await tx.achievement.findFirst({ where: { id: achievementId, archivedAt: null } });
  if (!a) throw new EventsProblem("This achievement was not found.");
  await assertYearOpen(tx, a.academicYearId);
  const why = clean(reason);
  if (why.length < 5) throw new EventsProblem("Give a reason, in a few words.", "reason");
  await tx.achievement.update({ where: { id: a.id }, data: { archivedAt: new Date(), archiveReason: why } });
  const given = await tx.activityCreditEntry.aggregate({ where: { achievementId: a.id }, _sum: { points: true } });
  const back = given._sum.points ?? 0;
  if (back) await tx.activityCreditEntry.create({ data: { schoolId: ctx.schoolId, academicYearId: a.academicYearId, studentId: a.studentId, achievementId: a.id, points: -back, reason: `Reversed: ${why}`, date: dayOf(today), givenById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Achievement", recordId: a.id, before: { activity: a.activity, level: a.level }, after: { reason: why, creditsReversed: back || null } });
  return { a, back };
}

/** Corrects a student's activity credits by hand: a reason is needed and the history is kept. */
export async function correctCredits(tx: Tx, ctx: SchoolContext, studentId: string, points: number, reason: string, today: string) {
  if (!Number.isInteger(points) || points === 0) throw new EventsProblem("Enter a whole number of credits, like 5 or -5.", "points");
  if (Math.abs(points) > 500) throw new EventsProblem("Change at most 500 credits at once.", "points");
  const why = clean(reason);
  if (why.length < 5) throw new EventsProblem("Give a reason, in a few words.", "reason");
  const s = await eventsSettings(tx, ctx);
  if (!s.creditsOn) throw new EventsProblem("Activity credits are off. Switch them on in Events Settings.");
  const year = await yearOf(tx, today);
  if (!(await studying(tx, year.id, [studentId])).size) throw new EventsProblem("This student is not studying in the school this year.", "studentId");
  const total = (await creditTotals(tx, [studentId], year.id)).get(studentId) ?? 0;
  if (total + points < 0) throw new EventsProblem(`The student has ${total} credits. You can take away at most ${total}.`, "points");
  const e = await tx.activityCreditEntry.create({ data: { schoolId: ctx.schoolId, academicYearId: year.id, studentId, points, reason: why, date: dayOf(today), givenById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "credits-corrected", recordType: "Activity Credit Entry", recordId: e.id, before: { total }, after: { total: total + points, points, reason: why } });
  return { total: total + points, points };
}

/** Each student's activity credits total for the year. */
export async function creditTotals(tx: Tx, studentIds: string[], yearId: string) {
  if (!studentIds.length) return new Map<string, number>();
  const rows = await tx.activityCreditEntry.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds }, academicYearId: yearId }, _sum: { points: true } });
  return new Map(rows.map((r) => [r.studentId, r._sum.points ?? 0]));
}

/* ---------- Houses ---------- */

export async function saveHouse(tx: Tx, ctx: SchoolContext, input: { id?: string | null; name: string; colour: string; captainStudentId: string | null }) {
  const name = clean(input.name);
  if (name.length < 2 || name.length > 40) throw new EventsProblem("Give the house a name of 2 to 40 characters.", "name");
  if (!isHouseColour(input.colour)) throw new EventsProblem("Choose the colour.", "colour");
  const same = await tx.house.findFirst({ where: { archivedAt: null, name: { equals: name, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (same) throw new EventsProblem(`There is already a house called ${same.name}.`, "name");
  if (input.captainStudentId && !(await tx.student.findFirst({ where: { id: input.captainStudentId, archivedAt: null } }))) throw new EventsProblem("Choose the captain.", "captainStudentId");
  if (input.id) {
    const before = await tx.house.findFirst({ where: { id: input.id, archivedAt: null } });
    if (!before) throw new EventsProblem("This house was not found.");
    const h = await tx.house.update({ where: { id: before.id }, data: { name, colour: input.colour, captainStudentId: input.captainStudentId } });
    await writeAudit(tx, ctx, { action: "changed", recordType: "House", recordId: h.id, before: { name: before.name, colour: before.colour, captain: before.captainStudentId }, after: { name, colour: input.colour, captain: input.captainStudentId } });
    return h;
  }
  if ((await tx.house.count({ where: { archivedAt: null } })) >= 12) throw new EventsProblem("A school can have at most 12 houses.");
  const order = await tx.house.count();
  const h = await tx.house.create({ data: { schoolId: ctx.schoolId, name, colour: input.colour, captainStudentId: input.captainStudentId, sortOrder: order } });
  await writeAudit(tx, ctx, { action: "created", recordType: "House", recordId: h.id, after: { name, colour: input.colour } });
  return h;
}

/** Each student's house this year. */
export async function housesOf(tx: Tx, yearId: string, studentIds?: string[]) {
  const rows = await tx.houseMember.findMany({ where: { academicYearId: yearId, archivedAt: null, ...(studentIds ? { studentId: { in: studentIds } } : {}) }, select: { studentId: true, houseId: true } });
  return new Map(rows.map((r) => [r.studentId, r.houseId]));
}

/**
 * Puts students in houses for the year: "turn" gives every student without a
 * house one in turn, by class, section and roll number; "hand" moves the
 * chosen students to one house (the old place is kept, archived).
 */
export async function assignHouses(tx: Tx, ctx: SchoolContext, input: { mode: "turn" } | { mode: "hand"; houseId: string; studentIds: string[] }, today: string) {
  const year = await yearOf(tx, today);
  const houses = await tx.house.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } });
  if (!houses.length) throw new EventsProblem("Add the houses first, in Events Settings.", undefined, { href: "/events-calendar/settings", label: "Open Events Settings" });
  const current = await housesOf(tx, year.id);
  if (input.mode === "turn") {
    const enrol = await tx.enrolment.findMany({ where: { academicYearId: year.id, archivedAt: null, status: "STUDYING" }, select: { studentId: true } });
    const todo = enrol.map((e) => e.studentId).filter((s) => !current.has(s));
    if (!todo.length) throw new EventsProblem("Every student already has a house this year.");
    const places = await placesOf(tx, todo, year.id);
    todo.sort((a, b) => placeOrder(places.get(a), places.get(b)));
    // Start with the house that has fewest students, so houses stay even.
    const counts = houses.map((h) => [...current.values()].filter((x) => x === h.id).length);
    let i = counts.indexOf(Math.min(...counts));
    await tx.houseMember.createMany({ data: todo.map((studentId) => ({ schoolId: ctx.schoolId, academicYearId: year.id, houseId: houses[i++ % houses.length].id, studentId, assignedById: ctx.userId })) });
    await writeAudit(tx, ctx, { action: "houses-assigned", recordType: "House", recordId: houses[0].id, after: { students: todo.length, how: "in turn by class and roll" } });
    return { assigned: todo.length, house: null };
  }
  const house = houses.find((h) => h.id === input.houseId);
  if (!house) throw new EventsProblem("Choose the house.", "houseId");
  const wanted = [...new Set(input.studentIds)];
  if (!wanted.length) throw new EventsProblem("Choose the students.", "studentIds");
  const ok = await studying(tx, year.id, wanted);
  const moving = wanted.filter((s) => ok.has(s) && current.get(s) !== house.id);
  if (!moving.length) throw new EventsProblem(`These students are already in ${house.name}.`, "studentIds");
  await tx.houseMember.updateMany({ where: { academicYearId: year.id, studentId: { in: moving }, archivedAt: null }, data: { archivedAt: new Date() } });
  await tx.houseMember.createMany({ data: moving.map((studentId) => ({ schoolId: ctx.schoolId, academicYearId: year.id, houseId: house.id, studentId, assignedById: ctx.userId })) });
  await writeAudit(tx, ctx, { action: "houses-assigned", recordType: "House", recordId: house.id, after: { students: moving.length, how: "by hand" } });
  return { assigned: moving.length, house };
}

/** Adds or takes away house points: a reason is needed and every change is kept. */
export async function addHousePoints(tx: Tx, ctx: SchoolContext, houseId: string, points: number, reason: string, today: string) {
  if (!Number.isInteger(points) || points === 0) throw new EventsProblem("Enter a whole number, like 10 or -10.", "points");
  if (Math.abs(points) > 1000) throw new EventsProblem("Change at most 1,000 points at once.", "points");
  const why = clean(reason);
  if (why.length < 3) throw new EventsProblem("Give a reason.", "reason");
  if (why.length > 160) throw new EventsProblem("The reason can be at most 160 characters.", "reason");
  const house = await tx.house.findFirst({ where: { id: houseId, archivedAt: null } });
  if (!house) throw new EventsProblem("Choose the house.", "houseId");
  const year = await yearOf(tx, today);
  const e = await tx.housePointsEntry.create({ data: { schoolId: ctx.schoolId, academicYearId: year.id, houseId, points, reason: why, date: dayOf(today), givenById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "points", recordType: "House", recordId: houseId, after: { house: house.name, points, reason: why } });
  return { entry: e, house };
}

/** The leaderboard: each house's points this year, students and captain, highest first. */
export async function leaderboard(tx: Tx, yearId: string) {
  const houses = await tx.house.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } });
  const [pts, members] = await Promise.all([
    tx.housePointsEntry.groupBy({ by: ["houseId"], where: { academicYearId: yearId }, _sum: { points: true } }),
    tx.houseMember.groupBy({ by: ["houseId"], where: { academicYearId: yearId, archivedAt: null }, _count: { _all: true } }),
  ]);
  const captains = await tx.student.findMany({ where: { id: { in: houses.map((h) => h.captainStudentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } });
  const places = await placesOf(tx, captains.map((c) => c.id), yearId);
  return houses.map((h) => {
    const c = captains.find((x) => x.id === h.captainStudentId);
    return { ...h, points: pts.find((p) => p.houseId === h.id)?._sum.points ?? 0, students: members.find((m) => m.houseId === h.id)?._count._all ?? 0, captain: c ? `${c.fullName}${places.get(c.id) ? `, ${places.get(c.id)!.label.replace(/^Class /, "")}` : ""}` : null };
  }).sort((a, b) => b.points - a.points || a.sortOrder - b.sortOrder);
}

/* ---------- Clubs and sports teams ---------- */

export async function saveClub(tx: Tx, ctx: SchoolContext, input: { id?: string | null; name: string; inChargeId: string | null; meets: string | null }) {
  const name = clean(input.name);
  if (name.length < 2 || name.length > 60) throw new EventsProblem("Give the club a name of 2 to 60 characters.", "name");
  if (input.inChargeId && !(await tx.staff.findFirst({ where: { id: input.inChargeId, archivedAt: null } }))) throw new EventsProblem("Choose the in-charge.", "inChargeId");
  const meets = input.meets ? clean(input.meets).slice(0, 60) : null;
  const same = await tx.club.findFirst({ where: { archivedAt: null, name: { equals: name, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (same) throw new EventsProblem(`There is already a club called ${same.name}.`, "name");
  if (input.id) {
    const before = await tx.club.findFirst({ where: { id: input.id, archivedAt: null } });
    if (!before) throw new EventsProblem("This club was not found.");
    const c = await tx.club.update({ where: { id: before.id }, data: { name, inChargeId: input.inChargeId, meets } });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Club", recordId: c.id, before: { name: before.name, meets: before.meets }, after: { name, meets } });
    return c;
  }
  const c = await tx.club.create({ data: { schoolId: ctx.schoolId, name, inChargeId: input.inChargeId, meets } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Club", recordId: c.id, after: { name, meets } });
  return c;
}

export async function saveTeam(tx: Tx, ctx: SchoolContext, input: { id?: string | null; name: string; sport: string; coachId: string | null; coachName: string | null }) {
  const name = clean(input.name);
  if (name.length < 2 || name.length > 60) throw new EventsProblem("Give the team a name of 2 to 60 characters, like “Under-14 Cricket, boys”.", "name");
  const sport = clean(input.sport);
  if (sport.length < 2 || sport.length > 40) throw new EventsProblem("Enter the sport.", "sport");
  if (input.coachId && !(await tx.staff.findFirst({ where: { id: input.coachId, archivedAt: null } }))) throw new EventsProblem("Choose the coach.", "coachId");
  const coachName = !input.coachId && input.coachName ? clean(input.coachName).slice(0, 60) : null;
  if (!input.coachId && !coachName) throw new EventsProblem("Choose the coach, or type a visiting coach's name.", "coachId");
  if (input.id) {
    const before = await tx.sportsTeam.findFirst({ where: { id: input.id, archivedAt: null } });
    if (!before) throw new EventsProblem("This team was not found.");
    const t = await tx.sportsTeam.update({ where: { id: before.id }, data: { name, sport, coachId: input.coachId, coachName } });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Sports Team", recordId: t.id, before: { name: before.name, sport: before.sport }, after: { name, sport } });
    return t;
  }
  const t = await tx.sportsTeam.create({ data: { schoolId: ctx.schoolId, name, sport, coachId: input.coachId, coachName } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Sports Team", recordId: t.id, after: { name, sport } });
  return t;
}

/** Archives a club or team (kept with its history). */
export async function archiveGroup(tx: Tx, ctx: SchoolContext, kind: "club" | "team", id: string) {
  if (kind === "club") {
    const c = await tx.club.findFirst({ where: { id, archivedAt: null } });
    if (!c) throw new EventsProblem("This club was not found.");
    await tx.club.update({ where: { id }, data: { archivedAt: new Date() } });
    await writeAudit(tx, ctx, { action: "archived", recordType: "Club", recordId: id, before: { name: c.name } });
    return c.name;
  }
  const t = await tx.sportsTeam.findFirst({ where: { id, archivedAt: null } });
  if (!t) throw new EventsProblem("This team was not found.");
  await tx.sportsTeam.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Sports Team", recordId: id, before: { name: t.name } });
  return t.name;
}

/** Current members (student ids) of a club or team this year. */
export async function membersOf(tx: Tx, kind: "club" | "team", groupId: string, yearId: string) {
  const rows = kind === "club"
    ? await tx.clubMember.findMany({ where: { clubId: groupId, academicYearId: yearId, archivedAt: null }, select: { studentId: true } })
    : await tx.teamMember.findMany({ where: { teamId: groupId, academicYearId: yearId, archivedAt: null }, select: { studentId: true } });
  return rows.map((r) => r.studentId);
}

async function groupName(tx: Tx, kind: "club" | "team", id: string) {
  const g = kind === "club" ? await tx.club.findFirst({ where: { id, archivedAt: null } }) : await tx.sportsTeam.findFirst({ where: { id, archivedAt: null } });
  if (!g) throw new EventsProblem(kind === "club" ? "This club was not found." : "This team was not found.");
  return g.name;
}

export async function addMembers(tx: Tx, ctx: SchoolContext, kind: "club" | "team", groupId: string, studentIds: string[], today: string) {
  const name = await groupName(tx, kind, groupId);
  const year = await yearOf(tx, today);
  const wanted = [...new Set(studentIds)];
  if (!wanted.length) throw new EventsProblem("Choose the students.", "studentIds");
  const ok = await studying(tx, year.id, wanted);
  const have = new Set(await membersOf(tx, kind, groupId, year.id));
  const add = wanted.filter((s) => ok.has(s) && !have.has(s));
  if (!add.length) throw new EventsProblem("These students are already members.", "studentIds");
  const data = add.map((studentId) => ({ schoolId: ctx.schoolId, academicYearId: year.id, studentId, addedById: ctx.userId }));
  if (kind === "club") await tx.clubMember.createMany({ data: data.map((d) => ({ ...d, clubId: groupId })) });
  else await tx.teamMember.createMany({ data: data.map((d) => ({ ...d, teamId: groupId })) });
  await writeAudit(tx, ctx, { action: "members-added", recordType: kind === "club" ? "Club" : "Sports Team", recordId: groupId, after: { students: add.length } });
  return { added: add.length, name };
}

export async function removeMember(tx: Tx, ctx: SchoolContext, kind: "club" | "team", groupId: string, studentId: string, today: string) {
  const name = await groupName(tx, kind, groupId);
  const year = await yearOf(tx, today);
  const where = { academicYearId: year.id, studentId, archivedAt: null };
  const n = kind === "club"
    ? (await tx.clubMember.updateMany({ where: { ...where, clubId: groupId }, data: { archivedAt: new Date() } })).count
    : (await tx.teamMember.updateMany({ where: { ...where, teamId: groupId }, data: { archivedAt: new Date() } })).count;
  if (!n) throw new EventsProblem("This student is not a member.");
  await writeAudit(tx, ctx, { action: "member-removed", recordType: kind === "club" ? "Club" : "Sports Team", recordId: groupId, after: { studentId } });
  return { name };
}

/** Records a club meeting or a team's training with who came. */
export async function recordSession(tx: Tx, ctx: SchoolContext, kind: "club" | "team", groupId: string, input: { date: string; presentIds: string[]; topic?: string | null; startMin?: number | null; venue?: string | null }, today: string) {
  const name = await groupName(tx, kind, groupId);
  if (input.date > today) throw new EventsProblem("Attendance is marked on the day or after it.", "date");
  const year = await yearOf(tx, input.date);
  const members = await membersOf(tx, kind, groupId, year.id);
  if (!members.length) throw new EventsProblem(`${name} has no members yet. Add members first.`);
  const present = [...new Set(input.presentIds)].filter((s) => members.includes(s));
  if (kind === "club") {
    const m = await tx.clubMeeting.create({ data: { schoolId: ctx.schoolId, clubId: groupId, date: dayOf(input.date), topic: input.topic ? clean(input.topic).slice(0, 120) : null, memberIds: members, presentIds: present, recordedById: ctx.userId } });
    await writeAudit(tx, ctx, { action: "meeting", recordType: "Club", recordId: groupId, after: { date: dmy(input.date), present: present.length, of: members.length } });
    return { id: m.id, present: present.length, of: members.length, name };
  }
  const t = await tx.trainingSession.create({ data: { schoolId: ctx.schoolId, teamId: groupId, date: dayOf(input.date), startMin: input.startMin ?? null, venue: input.venue ? clean(input.venue).slice(0, 80) : null, memberIds: members, presentIds: present, recordedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "training", recordType: "Sports Team", recordId: groupId, after: { date: dmy(input.date), present: present.length, of: members.length } });
  return { id: t.id, present: present.length, of: members.length, name };
}

/** Players who missed the last three trainings in a row. */
export function missedInARow(sessions: { memberIds: string[]; presentIds: string[] }[], n = 3) {
  const last = sessions.slice(0, n);
  if (last.length < n) return [];
  const all = new Set(last.flatMap((s) => s.memberIds));
  return [...all].filter((id) => last.every((s) => s.memberIds.includes(id) && !s.presentIds.includes(id)));
}

/* ---------- Fixtures and fitness ---------- */

export async function saveFixture(tx: Tx, ctx: SchoolContext, input: { id?: string | null; teamId: string | null; title: string; date: string; startMin: number | null; venue: string | null; ground: string }) {
  const title = clean(input.title);
  if (title.length < 3 || title.length > 120) throw new EventsProblem("Say who is playing, like “Under-17 Football vs Delhi Public School”.", "title");
  if (!GROUNDS.some((g) => g.value === input.ground)) throw new EventsProblem("Choose home or away.", "ground");
  if (input.teamId && !(await tx.sportsTeam.findFirst({ where: { id: input.teamId, archivedAt: null } }))) throw new EventsProblem("Choose the team.", "teamId");
  await yearOf(tx, input.date);
  const data = { teamId: input.teamId, title, date: dayOf(input.date), startMin: input.startMin, venue: input.venue ? clean(input.venue).slice(0, 80) : null, ground: input.ground };
  if (input.id) {
    const before = await tx.fixture.findFirst({ where: { id: input.id, archivedAt: null } });
    if (!before) throw new EventsProblem("This fixture was not found.");
    const f = await tx.fixture.update({ where: { id: before.id }, data });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Fixture", recordId: f.id, before: { title: before.title, date: dmy(isoOf(before.date)) }, after: { title, date: dmy(input.date) } });
    return f;
  }
  const f = await tx.fixture.create({ data: { schoolId: ctx.schoolId, ...data, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Fixture", recordId: f.id, after: { title, date: dmy(input.date) } });
  return f;
}

export async function recordResult(tx: Tx, ctx: SchoolContext, fixtureId: string, result: string, score: string | null, today: string) {
  const f = await tx.fixture.findFirst({ where: { id: fixtureId, archivedAt: null } });
  if (!f) throw new EventsProblem("This fixture was not found.");
  if (isoOf(f.date) > today) throw new EventsProblem(`The result is recorded on or after the day, ${dmy(isoOf(f.date))}.`);
  if (!FIXTURE_RESULTS.some((r) => r.value === result)) throw new EventsProblem("Choose the result.", "result");
  const s = score ? clean(score).slice(0, 80) : null;
  const u = await tx.fixture.update({ where: { id: f.id }, data: { result, score: s } });
  await writeAudit(tx, ctx, { action: "result", recordType: "Fixture", recordId: f.id, before: { result: f.result, score: f.score }, after: { result, score: s } });
  return u;
}

export type FitnessInput = { studentId: string; date: string; heightCm: number | null; weightKg: number | null; runSeconds: number | null; reachCm: number | null; note: string | null };

export async function recordFitness(tx: Tx, ctx: SchoolContext, input: FitnessInput, today: string) {
  if (input.date > today) throw new EventsProblem("The test date cannot be in the future.", "date");
  const year = await yearOf(tx, input.date);
  if (!(await studying(tx, year.id, [input.studentId])).size) throw new EventsProblem("Choose a student studying this year.", "studentId");
  const range = (v: number | null, lo: number, hi: number, field: string, words: string) => {
    if (v != null && (Number.isNaN(v) || v < lo || v > hi)) throw new EventsProblem(words, field);
  };
  range(input.heightCm, 60, 220, "heightCm", "Height is in cm, from 60 to 220.");
  range(input.weightKg, 10, 150, "weightKg", "Weight is in kg, from 10 to 150.");
  range(input.runSeconds, 60, 1200, "run", "Enter the 600 m run time like 2:45.");
  range(input.reachCm, -30, 60, "reachCm", "Sit-and-reach is in cm, from -30 to 60.");
  if ([input.heightCm, input.weightKg, input.runSeconds, input.reachCm].every((v) => v == null)) throw new EventsProblem("Enter at least one test result.", "heightCm");
  const r = await tx.fitnessRecord.create({ data: { schoolId: ctx.schoolId, academicYearId: year.id, studentId: input.studentId, date: dayOf(input.date), heightCm: input.heightCm, weightKg: input.weightKg, runSeconds: input.runSeconds, reachCm: input.reachCm, note: input.note ? clean(input.note).slice(0, 200) : null, recordedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "recorded", recordType: "Fitness Record", recordId: r.id, after: { date: dmy(input.date), height: input.heightCm, weight: input.weightKg, run: input.runSeconds, reach: input.reachCm } });
  return r;
}

/** BMI from height (cm) and weight (kg), one decimal. */
export const bmi = (h: number | null, w: number | null) => (h && w ? Math.round((w / ((h / 100) * (h / 100))) * 10) / 10 : null);
/** "2:45" from seconds. */
export const runWords = (s: number | null) => (s == null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

export type AchievementWhere = Prisma.AchievementWhereInput;
