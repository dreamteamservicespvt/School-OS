// Discussions (17 §2): class boards for questions and answers. A board has a
// title, an optional class and subject, a description, who can use it (staff
// and students, or staff only), and is active or not. Topics and replies are
// posted by staff and students; the board's owner or someone with Full reach
// moderates: pin, lock, or hide a post with a reason (hidden, never deleted).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { HomeworkProblem } from "./access";
import { requireDesk, requireYearOpen, shortSection, type HomeworkScope } from "./scope";

export const HIDE_REASONS = ["Not about the subject", "Unkind words", "Personal details shared", "Answers to a test"] as const;

/** The boards this person may see. Staff only boards stay hidden from students. */
export function boardWhere(s: HomeworkScope): Prisma.DiscussionBoardWhereInput {
  const base: Prisma.DiscussionBoardWhereInput = { archivedAt: null, OR: [{ academicYearId: null }, { academicYearId: s.yearId ?? undefined }] };
  if (s.level === "full") return base;
  if (s.level === "student") {
    // Their own section's boards, and boards for the whole school open to students.
    return { AND: [base, { audience: "all", visible: true, OR: [{ sectionId: s.student?.sectionId ?? "00000000-0000-0000-0000-000000000000" }, { sectionId: null }] }] };
  }
  const sections = s.sectionIds ?? [];
  return { AND: [base, { OR: [{ ownerId: s.ctx.userId ?? "" }, { sectionId: { in: sections } }, { sectionId: null, visible: true }] }] };
}

export type BoardInput = { title: string; sectionId: string | null; subjectId: string | null; description: string | null; audience: "all" | "staff"; active: boolean; visible: boolean };

function checkBoard(input: BoardInput) {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (!title) throw new HomeworkProblem("Give the board a title, like “Science · 7 A”.", "title");
  if (title.length > 120) throw new HomeworkProblem("The title can be at most 120 characters.", "title");
  if ((input.description ?? "").length > 600) throw new HomeworkProblem("The description can be at most 600 characters.", "description");
  return title;
}

export async function createBoard(tx: Tx, s: HomeworkScope, input: BoardInput) {
  requireDesk(s, "discussions");
  requireYearOpen(s);
  const title = checkBoard(input);
  if (input.sectionId && s.level === "own" && !(s.sectionIds ?? []).includes(input.sectionId)) throw new HomeworkProblem("Choose one of your own classes.", "sectionId");
  if (input.sectionId && input.subjectId && s.level === "own" && !s.pairs.some((p) => p.sectionId === input.sectionId && p.subjectId === input.subjectId) && !s.ctSections.includes(input.sectionId)) throw new HomeworkProblem("You do not teach this subject to that class.", "subjectId");
  if (!input.sectionId && input.audience === "all" && s.level === "own") throw new HomeworkProblem("A board for students needs a class. Choose the class, or make it for staff only.", "sectionId");
  const b = await tx.discussionBoard.create({
    data: { schoolId: s.ctx.schoolId, academicYearId: s.yearId, title, sectionId: input.sectionId, subjectId: input.sectionId ? input.subjectId : input.subjectId, description: input.description?.trim() || null, audience: input.audience, active: input.active, visible: input.visible, ownerId: s.ctx.userId, ownerName: s.name },
  });
  await writeAudit(tx, s.ctx, { action: "created", recordType: "Discussion Board", recordId: b.id, after: { title, audience: input.audience, active: input.active } });
  return b;
}

async function boardFor(tx: Tx, s: HomeworkScope, id: string) {
  const b = await tx.discussionBoard.findFirst({ where: { AND: [{ id }, boardWhere(s)] } });
  if (!b) throw new HomeworkProblem("This board was not found.");
  return b;
}

/** The board's owner, or someone with Full reach, moderates it. */
export const mayModerate = (s: HomeworkScope, b: { ownerId: string | null }) =>
  s.modes.discussions === "edit" && (s.level === "full" || (s.level === "own" && !!s.ctx.userId && b.ownerId === s.ctx.userId));

export async function editBoard(tx: Tx, s: HomeworkScope, id: string, input: BoardInput) {
  const b = await boardFor(tx, s, id);
  if (!mayModerate(s, b)) throw new HomeworkProblem("Only the board's owner can change it.");
  const title = checkBoard(input);
  await tx.discussionBoard.update({ where: { id }, data: { title, description: input.description?.trim() || null, audience: input.audience, active: input.active, visible: input.visible } });
  await writeAudit(tx, s.ctx, { action: "changed", recordType: "Discussion Board", recordId: id, before: { title: b.title, active: b.active, audience: b.audience }, after: { title, active: input.active, audience: input.audience } });
}

function canPost(s: HomeworkScope, b: { active: boolean; audience: string }) {
  if (!b.active) throw new HomeworkProblem("This board is not active. Posts can be read but not added.");
  if (s.level === "student" && b.audience !== "all") throw new HomeworkProblem("This board is for staff only.");
  if (s.level !== "student" && s.modes.discussions !== "edit") throw new HomeworkProblem("Your role reads the boards but does not post.");
}

/** Posts a topic (a question) on a board. */
export async function postTopic(tx: Tx, s: HomeworkScope, boardId: string, input: { title: string; body: string }) {
  const b = await boardFor(tx, s, boardId);
  canPost(s, b);
  const title = input.title.trim().replace(/\s+/g, " ");
  if (!title) throw new HomeworkProblem("Give the topic one short line, like “Q3 of exercise 4.2”.", "title");
  if (title.length > 160) throw new HomeworkProblem("The title can be at most 160 characters.", "title");
  if (input.body.length > 4000) throw new HomeworkProblem("Details can be at most 4,000 characters.", "body");
  const p = await tx.discussionPost.create({ data: { schoolId: s.ctx.schoolId, boardId, title, body: input.body.trim(), authorId: s.ctx.userId, authorName: s.student?.name ?? s.name, authorIsStaff: s.level !== "student" } });
  await writeAudit(tx, s.ctx, { action: "posted", recordType: "Discussion Post", recordId: p.id, after: { board: b.title, title } });
  if (s.level === "student" && b.ownerId) await notify(tx, s.ctx, { to: b.ownerId, type: "discussion-topic", text: `${s.student?.name ?? "A student"} asked in ${b.title}: ${title}`, link: `/homework-learning/discussions?board=${b.id}&topic=${p.id}`, groupKey: `discussion:${b.id}`, mergedText: (n) => `${n} new questions in ${b.title}` });
  return p;
}

export async function reply(tx: Tx, s: HomeworkScope, topicId: string, body: string) {
  const t = await tx.discussionPost.findFirst({ where: { id: topicId, topicId: null } });
  if (!t) throw new HomeworkProblem("This topic was not found.");
  const b = await boardFor(tx, s, t.boardId);
  canPost(s, b);
  if (t.hiddenAt) throw new HomeworkProblem("This topic is hidden, so it cannot get replies.");
  if (t.locked) throw new HomeworkProblem("Replies are locked on this topic.");
  const text = body.trim();
  if (!text) throw new HomeworkProblem("Type your reply.", "body");
  if (text.length > 2000) throw new HomeworkProblem("A reply can be at most 2,000 characters.", "body");
  const p = await tx.discussionPost.create({ data: { schoolId: s.ctx.schoolId, boardId: t.boardId, topicId, body: text, authorId: s.ctx.userId, authorName: s.student?.name ?? s.name, authorIsStaff: s.level !== "student" } });
  await tx.discussionPost.update({ where: { id: topicId }, data: { updatedAt: new Date() } });
  await writeAudit(tx, s.ctx, { action: "replied", recordType: "Discussion Post", recordId: p.id, after: { topic: t.title } });
  if (t.authorId && t.authorId !== s.ctx.userId) await notify(tx, s.ctx, { to: t.authorId, type: "discussion-reply", text: `${s.student?.name ?? s.name} replied to “${t.title}”.`, link: `/homework-learning/discussions?board=${b.id}&topic=${t.id}`, groupKey: `discussion-reply:${t.id}`, mergedText: (n) => `${n} replies to “${t.title}”` });
  return p;
}

/** Pin, lock, hide (with a reason) or unhide a post. Board owner or Full reach only. */
export async function moderate(tx: Tx, s: HomeworkScope, postId: string, what: "pin" | "unpin" | "lock" | "unlock" | "hide" | "unhide", reason = "") {
  const p = await tx.discussionPost.findFirst({ where: { id: postId } });
  if (!p) throw new HomeworkProblem("This post was not found.");
  const b = await boardFor(tx, s, p.boardId);
  if (!mayModerate(s, b)) throw new HomeworkProblem("Only the board's owner, or someone who runs Discussions for the whole school, can moderate this board.");
  if ((what === "pin" || what === "unpin" || what === "lock" || what === "unlock") && p.topicId) throw new HomeworkProblem("Only topics can be pinned or locked.");
  if (what === "hide" && !reason.trim()) throw new HomeworkProblem("Choose why it is hidden. The class sees the reason.", "reason");
  const data: Prisma.DiscussionPostUpdateInput =
    what === "pin" ? { pinned: true } : what === "unpin" ? { pinned: false } : what === "lock" ? { locked: true } : what === "unlock" ? { locked: false }
      : what === "hide" ? { hiddenAt: new Date(), hiddenReason: reason.trim().slice(0, 120), hiddenById: s.ctx.userId } : { hiddenAt: null, hiddenReason: null, hiddenById: null };
  await tx.discussionPost.update({ where: { id: postId }, data });
  await writeAudit(tx, s.ctx, { action: what === "hide" ? "hidden" : what === "unhide" ? "unhidden" : what, recordType: "Discussion Post", recordId: postId, before: { pinned: p.pinned, locked: p.locked, hidden: !!p.hiddenAt }, after: { reason: what === "hide" ? reason.trim() : null } });
  return p;
}

export type BoardRow = { id: string; title: string; sectionLabel: string | null; subject: string | null; audience: string; active: boolean; visible: boolean; ownerId: string | null; ownerName: string; topics: number; posts: number; description: string | null };

export async function listBoards(tx: Tx, s: HomeworkScope): Promise<BoardRow[]> {
  const boards = await tx.discussionBoard.findMany({ where: boardWhere(s), orderBy: [{ createdAt: "asc" }] });
  if (!boards.length) return [];
  const [counts, sections, subjects] = await Promise.all([
    tx.discussionPost.groupBy({ by: ["boardId", "topicId"], where: { boardId: { in: boards.map((b) => b.id) } }, _count: true }),
    tx.section.findMany({ where: { id: { in: boards.map((b) => b.sectionId).filter((x): x is string => !!x) } }, include: { schoolClass: { select: { name: true } } } }),
    tx.subject.findMany({ where: { id: { in: boards.map((b) => b.subjectId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
  ]);
  const sec = new Map(sections.map((x) => [x.id, shortSection(x.schoolClass.name, x.name)]));
  const sub = new Map(subjects.map((x) => [x.id, x.name]));
  return boards.map((b) => {
    const mine = counts.filter((c) => c.boardId === b.id);
    return {
      id: b.id, title: b.title, sectionLabel: b.sectionId ? sec.get(b.sectionId) ?? null : null, subject: b.subjectId ? sub.get(b.subjectId) ?? null : null,
      audience: b.audience, active: b.active, visible: b.visible, ownerId: b.ownerId, ownerName: b.ownerName, description: b.description,
      topics: mine.filter((c) => c.topicId === null).reduce((a, c) => a + c._count, 0), posts: mine.reduce((a, c) => a + c._count, 0),
    };
  });
}

/** Topics of a board, pinned first, newest activity next. Students see hidden posts only as "Hidden by the teacher". */
export async function boardTopics(tx: Tx, s: HomeworkScope, boardId: string) {
  const b = await boardFor(tx, s, boardId);
  const topics = await tx.discussionPost.findMany({ where: { boardId, topicId: null }, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }] });
  const replies = await tx.discussionPost.groupBy({ by: ["topicId"], where: { boardId, topicId: { in: topics.map((t) => t.id) }, hiddenAt: null }, _count: true });
  const n = new Map(replies.map((r) => [r.topicId, r._count]));
  return { board: b, topics: topics.map((t) => ({ ...t, replies: n.get(t.id) ?? 0 })) };
}

export async function topicThread(tx: Tx, s: HomeworkScope, topicId: string) {
  const t = await tx.discussionPost.findFirst({ where: { id: topicId, topicId: null } });
  if (!t) return null;
  const b = await boardFor(tx, s, t.boardId);
  const replies = await tx.discussionPost.findMany({ where: { topicId }, orderBy: { createdAt: "asc" } });
  return { board: b, topic: t, replies };
}
