// Notices (approval, Critical confirmation, schedule, expiry, read and seen
// counts) and Feedback & Queries (ticket numbers, internal notes never sent,
// escalation) from 11-communication.md.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import "@/lib/communication/handlers";
import "@/lib/communication/jobs";
import { decide } from "@/lib/approvals";
import { runDueJobs } from "@/lib/jobs";
import { expireNotices, markRead, saveNotice, archiveNotice, type NoticeInput } from "@/lib/communication/notices";
import { addInternalNote, escalateQueries, logQuery, pickUp, replyToQuery, setQueryStatus, QueryProblem } from "@/lib/communication/queries";
import { updateSettings } from "@/lib/messaging/settings";
import { makeCommSchool } from "./fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
let teacherCtx: { schoolId: string; userId: string };

beforeAll(async () => {
  s = await makeCommSchool();
  teacherCtx = { schoolId: s.school.id, userId: s.teacher.id };
});

const notice = (over: Partial<NoticeInput> = {}): NoticeInput => ({
  title: "Sports day",
  body: "Sports day is on Friday. Children should wear house colours.",
  attachmentFileIds: [],
  audience: { parents: true, students: false, staff: false, roleKeys: [], classIds: [], sectionIds: [s.a.id], campusIds: [] },
  priority: "NORMAL",
  channels: ["board", "parent-link", "whatsapp"],
  publishAt: null,
  expiresOn: null,
  askAck: false,
  ...over,
});

describe("notices", () => {
  it("needs a typed confirmation for Critical", async () => {
    await expect(withSchool(s.ctx, (tx) => saveNotice(tx, s.ctx, notice({ priority: "CRITICAL" }), { action: "publish", fullAccess: true, criticalConfirmed: false }))).rejects.toThrow(/Type CRITICAL/);
  });

  it("sends a teacher's notice to parents for approval, and publishes it with a message once approved", async () => {
    const saved = await withSchool(teacherCtx, (tx) => saveNotice(tx, teacherCtx, notice(), { action: "publish", fullAccess: false, criticalConfirmed: false }));
    expect(saved.outcome).toBe("approval");
    expect(saved.notice.status).toBe("WAITING_APPROVAL");
    await withSchool(s.ctx, (tx) => decide(tx, s.ctx, saved.notice.approvalId!, "approve", null));
    const n = await withSchool(s.ctx, (tx) => tx.notice.findUniqueOrThrow({ where: { id: saved.notice.id } }));
    expect(n.status).toBe("PUBLISHED");
    expect(n.messageId).not.toBeNull();
    expect(n.guardianCount).toBe(4); // both parents of Ravi, and the parents of Anil and Priya (5 A)
    // WhatsApp went to parents of 5 A, but not to the opted-out father.
    const names = await withSchool(s.ctx, (tx) => tx.messageRecipient.findMany({ where: { messageId: n.messageId! }, select: { name: true } }));
    expect(names.map((r) => r.name).sort()).toEqual(["Padma Reddy", "Srinivas Kumar"]);
  });

  it("schedules a notice for later and publishes it once at its time", async () => {
    const at = new Date(Date.now() + 60 * 60_000);
    const saved = await withSchool(s.ctx, (tx) => saveNotice(tx, s.ctx, notice({ title: "Later notice", channels: ["board"], publishAt: at }), { action: "publish", fullAccess: true, criticalConfirmed: false }));
    expect(saved.outcome).toBe("scheduled");
    await withSchool(s.ctx, (tx) => tx.backgroundJob.updateMany({ where: { schoolId: s.school.id, kind: "notice:publish" }, data: { runAfter: new Date(Date.now() - 1000) } }));
    await withSchool(s.ctx, (tx) => tx.notice.update({ where: { id: saved.notice.id }, data: { publishAt: new Date(Date.now() - 1000) } }));
    // Run every due job, not just the oldest few: other tests' due jobs share the queue.
    // Another test file may have claimed this one, so wait until it has finished.
    for (let i = 0; i < 100; i++) {
      const ran = await runDueJobs(50);
      const job = await withSchool(s.ctx, (tx) => tx.backgroundJob.findFirst({ where: { schoolId: s.school.id, kind: "notice:publish" }, select: { status: true } }));
      if (job?.status === "done") break;
      if (ran === 0) await new Promise((r) => setTimeout(r, 100));
    }
    const n =await withSchool(s.ctx, (tx) => tx.notice.findUniqueOrThrow({ where: { id: saved.notice.id } }));
    expect(n.status).toBe("PUBLISHED");
  });

  it("expires notices after their expiry date, and archives on request", async () => {
    const saved = await withSchool(s.ctx, (tx) => saveNotice(tx, s.ctx, notice({ title: "Old notice", channels: ["board"], expiresOn: new Date("2026-01-01") }), { action: "publish", fullAccess: true, criticalConfirmed: false }));
    expect(await withSchool(s.ctx, (tx) => expireNotices(tx, s.ctx))).toBeGreaterThanOrEqual(1);
    const n = await withSchool(s.ctx, (tx) => tx.notice.findUniqueOrThrow({ where: { id: saved.notice.id } }));
    expect(n.status).toBe("EXPIRED");
    await withSchool(s.ctx, (tx) => archiveNotice(tx, s.ctx, n.id));
    await expect(withSchool(s.ctx, (tx) => archiveNotice(tx, s.ctx, n.id))).rejects.toThrow(/already archived/);
  });

  it("records who read and acknowledged a notice", async () => {
    const saved = await withSchool(s.ctx, (tx) => saveNotice(tx, s.ctx, notice({ title: "Staff meeting", audience: { parents: false, students: false, staff: true, roleKeys: [], classIds: [], sectionIds: [], campusIds: [] }, channels: ["board", "app"], askAck: true }), { action: "publish", fullAccess: true, criticalConfirmed: false }));
    await withSchool(teacherCtx, (tx) => markRead(tx, teacherCtx, saved.notice.id, false));
    await withSchool(teacherCtx, (tx) => markRead(tx, teacherCtx, saved.notice.id, true));
    const ack = await withSchool(s.ctx, (tx) => tx.noticeAcknowledgement.findMany({ where: { noticeId: saved.notice.id } }));
    expect(ack).toHaveLength(1);
    expect(ack[0].acknowledgedAt).not.toBeNull();
  });
});

describe("queries", () => {
  it("gets a ticket number and owner; internal notes are never sent to the parent", async () => {
    const { query } = await withSchool(s.ctx, (tx) => logQuery(tx, s.ctx, { fromType: "guardian", fromId: s.father.id, fromName: null, fromPhone: null, aboutStudentId: s.ravi.id, type: "complaint", topicId: null, details: "The bus came late three days this week.", priority: "high", ownerId: s.teacher.id, departmentId: null, cameBy: "phone" }));
    expect(query.number).toMatch(/^Q-\d+/);
    expect(query.ownerId).toBe(s.teacher.id);
    expect(query.status).toBe("OPEN");
    await withSchool(s.ctx, (tx) => addInternalNote(tx, s.ctx, query.id, "Secret: driver was warned before."));
    await withSchool(s.ctx, (tx) => replyToQuery(tx, s.ctx, query.id, "We have spoken to the transport team.", "whatsapp"));
    const texts = await withSchool(s.ctx, (tx) => tx.messageRecipient.findMany({ where: { guardianId: s.father.id, message: { sourceType: "Query", sourceId: query.id } }, select: { text: true } }));
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.some((t) => t.text.includes("Secret"))).toBe(false);
    const after = await withSchool(s.ctx, (tx) => tx.query.findUniqueOrThrow({ where: { id: query.id } }));
    expect(after.status).toBe("IN_PROGRESS");
    await expect(withSchool(s.ctx, (tx) => setQueryStatus(tx, s.ctx, query.id, "RESOLVED", ""))).rejects.toThrow(QueryProblem);
    await withSchool(s.ctx, (tx) => setQueryStatus(tx, s.ctx, query.id, "RESOLVED", "Driver changed the route timing."));
  });

  it("needs an owner, and a department query can be picked up", async () => {
    const base = { fromType: "other" as const, fromId: null, fromName: "Walk-in visitor", fromPhone: "9876543210", aboutStudentId: null, type: "query" as const, topicId: null, details: "Asked about admission dates.", priority: "normal", cameBy: "visit" };
    await expect(withSchool(s.ctx, (tx) => logQuery(tx, s.ctx, { ...base, ownerId: null, departmentId: null }))).rejects.toThrow(/Choose who owns/);
    const dept = await withSchool(s.ctx, (tx) => tx.department.create({ data: { schoolId: s.school.id, name: `Office ${Date.now()}` } }));
    const { query } = await withSchool(s.ctx, (tx) => logQuery(tx, s.ctx, { ...base, ownerId: null, departmentId: dept.id }));
    await withSchool(teacherCtx, (tx) => pickUp(tx, teacherCtx, query.id));
    await expect(withSchool(s.ctx, (tx) => pickUp(tx, s.ctx, query.id))).rejects.toThrow(/already picked/);
  });

  it("escalates overdue queries when reply time limits are on", async () => {
    await withSchool(s.ctx, (tx) => updateSettings(tx, s.ctx, (v) => ({ ...v, queryTargets: { ...v.queryTargets, on: true, escalateToId: s.principal.id } })));
    const { query } = await withSchool(s.ctx, (tx) => logQuery(tx, s.ctx, { fromType: "guardian", fromId: s.mother.id, fromName: null, fromPhone: null, aboutStudentId: null, type: "query", topicId: null, details: "When is the PTM?", priority: "normal", ownerId: s.teacher.id, departmentId: null, cameBy: "phone" }));
    expect(query.dueBy).not.toBeNull();
    const later = new Date(Date.now() + 49 * 3600_000);
    expect(await withSchool(s.ctx, (tx) => escalateQueries(tx, s.ctx, later))).toBeGreaterThanOrEqual(1);
    const q = await withSchool(s.ctx, (tx) => tx.query.findUniqueOrThrow({ where: { id: query.id } }));
    expect(q.ownerId).toBe(s.principal.id);
    expect(q.escalatedAt).not.toBeNull();
    // Only once.
    expect(await withSchool(s.ctx, (tx) => escalateQueries(tx, s.ctx, later))).toBe(0);
  });
});
