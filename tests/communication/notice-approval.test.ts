// Notice approval before publishing (11-communication.md, Notice Board; gap
// list G41). A teacher writes notices for their own sections; the school's
// notice approval rule (Message Settings, default: notices to parents) sends
// them to Approvals, and approving publishes them. The rule applies to
// everyone except the people who decide notice requests themselves (the
// Principal by default). Everything here goes through the server actions.
import { beforeAll, describe, expect, it, vi } from "vitest";

let token: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "sos_session" && token ? { name, value: token } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { createSession } from "@/lib/auth/sessions";
import { withSchool } from "@/lib/db";
import { updateSettings } from "@/lib/messaging/settings";
import { makeUser } from "../helpers";
import { makeCommSchool } from "./fixture";

type School = Awaited<ReturnType<typeof makeCommSchool>>;
let s: School;
let admin: { id: string };
let accountant: { id: string };
const sys = () => ({ schoolId: s.school.id, userId: null });

async function signIn(userId: string) {
  token = (await createSession(userId, s.school.id, { userAgent: "test" })).token;
}

type NoticeForm = { title?: string; parents?: boolean; students?: boolean; staff?: boolean; sectionIds?: string[]; classIds?: string[]; priority?: string; criticalWord?: string; intent?: "publish" | "draft"; id?: string; keepFiles?: string[] };
function noticeForm(o: NoticeForm = {}) {
  const f = new FormData();
  if (o.id) f.set("id", o.id);
  f.set("title", o.title ?? "Sports day");
  f.set("body", "Sports day is on Friday. Children should wear house colours.");
  if (o.parents ?? true) f.set("parents", "on");
  if (o.students) f.set("students", "on");
  if (o.staff) f.set("staff", "on");
  for (const id of o.sectionIds ?? [s.a.id]) f.append("sectionIds", id);
  for (const id of o.classIds ?? []) f.append("classIds", id);
  for (const id of o.keepFiles ?? []) f.append("keepFiles", id);
  f.set("priority", o.priority ?? "NORMAL");
  f.append("channels", "board");
  f.append("channels", "parent-link");
  if (o.criticalWord) f.set("criticalWord", o.criticalWord);
  f.set("intent", o.intent ?? "publish");
  return f;
}

/** Saves through the action; a saved notice redirects to its page, so the id comes back from there. */
async function save(o: NoticeForm = {}): Promise<{ id: string } | { problem: string }> {
  const { saveNoticeAction } = await import("@/app/(school)/communication/notices/actions");
  try {
    const r = await saveNoticeAction(null, noticeForm(o));
    return { problem: r?.message ?? "no answer" };
  } catch (e) {
    const m = /^REDIRECT \/communication\/notices\/([0-9a-f-]{36})$/.exec((e as Error).message);
    if (!m) throw e;
    return { id: m[1] };
  }
}
const savedId = (r: { id: string } | { problem: string }) => {
  if (!("id" in r)) throw new Error(`Not saved: ${r.problem}`);
  return r.id;
};
const notice = (id: string) => withSchool(sys(), (tx) => tx.notice.findUniqueOrThrow({ where: { id } }));
const noticeCount = () => withSchool(sys(), (tx) => tx.notice.count({ where: { schoolId: s.school.id } }));

beforeAll(async () => {
  s = await makeCommSchool();
  admin = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["school-admin"] }], name: "Admin Person" });
  accountant = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["accountant"] }], name: "Accountant Person" });
});

describe("a class teacher's notice to their section's parents", () => {
  it("can open New notice, which offers only their own sections", async () => {
    await signIn(s.teacher.id);
    const Page = (await import("@/app/(school)/communication/notices/new/page")).default;
    await expect(Page()).resolves.toBeTruthy();
    const { commPage } = await import("@/lib/communication/access");
    const { noticeFormData } = await import("@/app/(school)/communication/notices/form-data");
    const data = await noticeFormData(await commPage("create"), null);
    expect(data.classes.flatMap((c) => c.sections.map((x) => x.id))).toEqual([s.a.id]);
    expect(data).toMatchObject({ staffAllowed: false, wholeSchool: false, criticalAllowed: false, needsApproval: { parents: true, all: false } });
  });

  it("goes to Approvals for the Principal, and is published once approved (decided on a cold server)", async () => {
    await signIn(s.teacher.id);
    const id = savedId(await save());
    const n = await notice(id);
    expect(n.status).toBe("WAITING_APPROVAL");
    const approval = await withSchool(sys(), (tx) => tx.approval.findUniqueOrThrow({ where: { id: n.approvalId! } }));
    expect(approval).toMatchObject({ type: "notice", recordType: "Notice", recordId: id, askedById: s.teacher.id, currentApproverRole: "principal", status: "WAITING" });
    // Nothing reaches parents while it waits.
    expect(n.publishedAt).toBeNull();

    await signIn(s.principal.id);
    vi.resetModules();
    const { decideAction } = await import("@/app/(school)/approvals/actions");
    expect(await decideAction(approval.id, "approve", null)).toBeUndefined();
    const after = await notice(id);
    expect(after.status).toBe("PUBLISHED");
    expect(after.guardianCount).toBe(4); // both parents of Ravi, and the parents of Anil and Priya (5 A)
  });

  it("goes back to Draft when the Principal sends it back, and the teacher can change and send it again", async () => {
    await signIn(s.teacher.id);
    const id = savedId(await save({ title: "Picnic" }));
    const n = await notice(id);
    await signIn(s.principal.id);
    const { decideAction } = await import("@/app/(school)/approvals/actions");
    expect(await decideAction(n.approvalId!, "ask-change", "Please add the time.")).toBeUndefined();
    expect(await notice(id)).toMatchObject({ status: "DRAFT", approvalId: null });

    // Someone else with their own scope (the Accountant writes to parents of the whole school) cannot change it.
    await signIn(accountant.id);
    expect(await save({ id, title: "Picnic at 10" })).toEqual({ problem: "You can change only notices you wrote." });
    await signIn(s.teacher.id);
    expect(savedId(await save({ id, title: "Picnic at 10" }))).toBe(id);
    expect(await notice(id)).toMatchObject({ title: "Picnic at 10", status: "WAITING_APPROVAL" });
  });

  it("is refused for another section, a whole class, staff, or Critical, and nothing is saved", async () => {
    await signIn(s.teacher.id);
    const before = await noticeCount();
    expect(await save({ sectionIds: [s.b.id] })).toEqual({ problem: "You can send notices only to your own sections. Other classes are not offered." });
    expect(await save({ sectionIds: [], classIds: [s.cls.id] })).toEqual({ problem: "Choose your own sections, not whole classes." });
    expect(await save({ staff: true })).toEqual({ problem: "Your role cannot send notices to staff. Ask the office." });
    expect(await save({ priority: "CRITICAL", criticalWord: "CRITICAL" })).toEqual({ problem: "Only the office can mark a notice Critical. Choose Normal or High." });
    expect(await noticeCount()).toBe(before);
  });

  it("cannot keep another notice's attachments", async () => {
    await signIn(s.teacher.id);
    const fileId = await withSchool(sys(), async (tx) => (await tx.storedFile.create({ data: { schoolId: s.school.id, fileName: "staff-salaries.pdf", contentType: "application/pdf", sizeBytes: 10, storageKey: `test/${crypto.randomUUID()}`, purpose: "staff-document" } })).id);
    const id = savedId(await save({ title: "With a file", intent: "draft", keepFiles: [fileId] }));
    expect((await notice(id)).attachmentFileIds).toEqual([]);
  });

  it("archives only notices they wrote", async () => {
    await signIn(s.principal.id);
    const principals = savedId(await save({ title: "From the Principal", intent: "draft" }));
    await signIn(s.teacher.id);
    const own = savedId(await save({ title: "Own draft", intent: "draft" }));
    const { archiveNoticeAction } = await import("@/app/(school)/communication/notices/actions");
    expect(await archiveNoticeAction(principals)).toBe("You can archive only notices you wrote.");
    expect(await archiveNoticeAction(own)).toBeUndefined();
    expect((await notice(own)).status).toBe("ARCHIVED");
    expect((await notice(principals)).status).toBe("DRAFT");
  });
});

describe("the rule applies to everyone except those who approve notices", () => {
  it("the Principal's notice to parents is published at once", async () => {
    await signIn(s.principal.id);
    const n = await notice(savedId(await save({ title: "From the Principal, published" })));
    expect(n).toMatchObject({ status: "PUBLISHED", approvalId: null });
  });

  it("the School Admin's notice to parents goes to the Principal", async () => {
    await signIn(admin.id);
    const n = await notice(savedId(await save({ title: "From the office" })));
    expect(n.status).toBe("WAITING_APPROVAL");
    const approval = await withSchool(sys(), (tx) => tx.approval.findUniqueOrThrow({ where: { id: n.approvalId! } }));
    expect(approval).toMatchObject({ askedById: admin.id, currentApproverRole: "principal" });
  });

  it("follows Message Settings: none publishes at once; all sends even a notice to students for approval", async () => {
    const pctx = { schoolId: s.school.id, userId: s.principal.id };
    await withSchool(pctx, (tx) => updateSettings(tx, pctx, (v) => ({ ...v, noticeApproval: "none" })));
    await signIn(s.teacher.id);
    expect((await notice(savedId(await save({ title: "No approval needed" })))).status).toBe("PUBLISHED");

    await withSchool(pctx, (tx) => updateSettings(tx, pctx, (v) => ({ ...v, noticeApproval: "all" })));
    expect((await notice(savedId(await save({ title: "For students", parents: false, students: true })))).status).toBe("WAITING_APPROVAL");
    // The Principal still needs nobody's approval.
    await signIn(s.principal.id);
    expect((await notice(savedId(await save({ title: "For students too", parents: false, students: true })))).status).toBe("PUBLISHED");
    await withSchool(pctx, (tx) => updateSettings(tx, pctx, (v) => ({ ...v, noticeApproval: "parents" })));
  });
});
