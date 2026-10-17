// Support Access (07-super-admin.md §3.4, Done when 5; gap G35):
// - a DREAM TEAM Support person asks one school, with a reason and how long;
// - only that school's School Admin or Principal allows or declines it, in Approvals;
// - nothing opens before Allow, and access ends by itself at the time given;
// - inside, they only look: changes, exports, prints and payment cancellation are
//   refused, restricted details and Salary Management stay hidden;
// - everything is in the school's Audit Log, marked "DREAM TEAM support (name)";
// - they see that one school only, through its own wall, and never become a school login.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
const head = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined), set: (name: string, value: string) => { jar.set(name, value); }, delete: (name: string) => { jar.delete(name); } }),
  headers: async () => new Headers({ "user-agent": "vitest", ...Object.fromEntries(head) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { ConsoleRole, SuperAdminUser } from "@prisma/client";
import { prisma, SUPPORT_LOGIN_ID, withConsole, withConsoleSchool, withSchool } from "@/lib/db";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/sessions";
import { hashPassword } from "@/lib/auth/password";
import { CONSOLE_COOKIE } from "@/lib/console/auth";
import { actorOf } from "@/lib/console/auth";
import { claimSupportTicket, requestSupportAccess, startSupportEntry } from "@/lib/console/support";
import { endExpiredSupport, endSupportByToken, findSupportEntry } from "@/lib/console/support-entry";
import { getCurrent, requireAction, requireCurrent, requirePage, SupportLookOnlyError } from "@/lib/current";
import { abilities } from "@/lib/students/access";
import { canSeeRestricted, viewerFor } from "@/lib/staff/access";
import { logExport } from "@/lib/exports";
import { SUPPORT_COOKIE, SUPPORT_PATH_HEADER, supportRefusal } from "@/lib/support-paths";
import { proxy } from "@/proxy";
import { endSupportAction, requestSupportAction, withdrawSupportAction } from "@/app/console/(app)/support/actions";
import { answerSupportAction, decideAction, endSupportNowAction } from "@/app/(school)/approvals/actions";
import { cancelPaymentAction } from "@/app/(school)/fee-management/payments/actions";
import { makeSchool, makeUser, PASSWORD } from "../helpers";

type School = Awaited<ReturnType<typeof makeSchool>>;
let school: School;
let other: School;
const team = {} as Record<ConsoleRole, SuperAdminUser>;
let admin: { id: string };
let principal: { id: string };
let accountant: { id: string };

const mobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };
const UID = /^[0-9a-f-]{36}$/i;

async function teamMember(role: ConsoleRole, name = `${role} Person`) {
  return withConsole(async (tx) => tx.superAdminUser.create({ data: { name: `${name} ${randomUUID().slice(0, 4)}`, phone: mobile(), role, status: "ACTIVE", passwordHash: await hashPassword(PASSWORD) } }));
}

/** Signs a DREAM TEAM person in to the console; returns their console session id. */
async function asConsole(u: SuperAdminUser) {
  const token = newToken();
  const s = await withConsole((tx) => tx.consoleSession.create({ data: { userId: u.id, tokenHash: hashToken(token), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60_000) } }));
  jar.clear();
  jar.set(CONSOLE_COOKIE, token);
  return s.id;
}

/** Signs a school person in (their school session cookie only). */
async function asSchool(userId: string, schoolId: string) {
  jar.clear();
  jar.set("sos_session", (await createSession(userId, schoolId, { userAgent: "test" })).token);
}

async function card(s: School) {
  await withConsoleSchool(s.id, (tx) => tx.consoleSchool.create({ data: { id: s.id, code: s.code, name: s.name, city: "Pune", state: "Maharashtra", status: "ACTIVE", statusSince: new Date(), startedAs: "ACTIVE" } }));
}

const requestOf = (id: string) => withConsole((tx) => tx.supportAccessRequest.findUniqueOrThrow({ where: { id } }));
const audit = (schoolId: string, action: string) => withSchool({ schoolId, userId: null }, (tx) => tx.auditLogEntry.findMany({ where: { action }, orderBy: { at: "asc" } }));

/** Asks, has the School Admin allow it, and opens it: the support browser's token, as /support/enter sets it. */
async function openSupport(by: SuperAdminUser, s: School = school, minutes = 60) {
  await asConsole(by);
  const asked = await requestSupportAccess(actorOf(by), s.id, { reason: "Fee structure is not saving", lengthMinutes: minutes });
  await asSchool(admin.id, s.id);
  expect(await answerSupportAction(asked.id, "allow", null)).toBeUndefined();
  const sessionId = await asConsole(by);
  const { ticket } = await startSupportEntry(actorOf(by), sessionId, asked.id);
  const claimed = await claimSupportTicket(ticket);
  expect(claimed).not.toBeNull();
  jar.clear();
  jar.set(SUPPORT_COOKIE, claimed!.token);
  return { id: asked.id, token: claimed!.token, sessionId };
}

beforeAll(async () => {
  school = await makeSchool("Support Sunrise School");
  other = await makeSchool("Support Other School");
  await card(school);
  await card(other);
  for (const r of ["OWNER", "ONBOARDING", "SUPPORT"] as ConsoleRole[]) team[r] = await teamMember(r);
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Anita Sharma" });
  principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Rakesh Rao" });
  accountant = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }], name: "Meena Iyer" });
  await makeUser({ schools: [{ id: other.id, roleKeys: ["school-admin"] }], name: "Other Admin" });
  // Records of the other school that support access to this school must never show.
  await withSchool({ schoolId: other.id, userId: null }, (tx) => tx.auditLogEntry.create({ data: { schoolId: other.id, action: "other school only", recordType: "Student", recordId: "x" } }));
});

beforeEach(() => { jar.clear(); head.clear(); });

// Other console tests count the active Owners; this file's team leaves when it is done.
afterAll(async () => {
  await withConsole((tx) => tx.superAdminUser.updateMany({ where: { id: { in: Object.values(team).map((u) => u.id) } }, data: { status: "DISABLED", disabledAt: new Date(), disabledReason: "test finished" } }));
});

describe("asking", () => {
  it("only Support and the Owner can ask; Onboarding is refused on the server", async () => {
    await asConsole(team.ONBOARDING);
    const r = (await requestSupportAction(null, form({ schoolId: school.id, reason: "Want to look around", lengthMinutes: "60" }))) as { ok: boolean; message?: string };
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/role cannot/i);
    expect(await withConsole((tx) => tx.supportAccessRequest.count({ where: { forSchoolId: school.id } }))).toBe(0);
  });

  it("needs a reason and one of the three lengths", async () => {
    await asConsole(team.SUPPORT);
    expect(((await requestSupportAction(null, form({ schoolId: school.id, reason: "x", lengthMinutes: "60" }))) as { ok: boolean }).ok).toBe(false);
    expect(((await requestSupportAction(null, form({ schoolId: school.id, reason: "Fee structure is not saving", lengthMinutes: "30" }))) as { ok: boolean }).ok).toBe(false);
  });

  it("puts the request in the school's Approvals for its School Admin and Principal, and in both logs; only one at a time", async () => {
    await asConsole(team.SUPPORT);
    const r = (await requestSupportAction(null, form({ schoolId: school.id, reason: "Fee structure is not saving", lengthMinutes: "240" }))) as { ok: boolean; message?: string };
    expect(r.ok, r.message).toBe(true);
    const req = await withConsole((tx) => tx.supportAccessRequest.findFirstOrThrow({ where: { forSchoolId: school.id, status: "WAITING" } }));
    expect(req.lengthMinutes).toBe(240);
    expect(req.requestedById).toBe(team.SUPPORT.id);
    const notes = await withSchool({ schoolId: school.id, userId: null }, (tx) => tx.notification.findMany({ where: { link: `/approvals?support=${req.id}` } }));
    expect(notes.map((n) => n.userLoginId).sort()).toEqual([admin.id, principal.id].sort());
    expect((await audit(school.id, "support access asked")).some((a) => a.recordId === req.id && a.actorNote?.includes(team.SUPPORT.name))).toBe(true);
    expect(await withConsole((tx) => tx.consoleActivityEntry.count({ where: { type: "support", forSchoolId: school.id } }))).toBeGreaterThan(0);
    // A second request while one waits is refused.
    const again = (await requestSupportAction(null, form({ schoolId: school.id, reason: "Another look please", lengthMinutes: "60" }))) as { ok: boolean; message?: string };
    expect(again.ok).toBe(false);
    expect(again.message).toMatch(/already waiting/);
    // Nothing opens before Allow (Done when 5).
    const sessionId = await asConsole(team.SUPPORT);
    await expect(startSupportEntry(actorOf(team.SUPPORT), sessionId, req.id)).rejects.toThrow(/not answered yet/);
    // Withdrawn, it leaves the school's Approvals.
    expect(((await withdrawSupportAction(null, form({ requestId: req.id }))) as { ok: boolean }).ok).toBe(true);
    expect((await requestOf(req.id)).status).toBe("ENDED");
    expect(await withSchool({ schoolId: school.id, userId: null }, (tx) => tx.notification.count({ where: { link: `/approvals?support=${req.id}`, doneAt: null } }))).toBe(0);
  });
});

describe("the school answers", () => {
  it("only its School Admin or Principal; never the Accountant, and never support itself", async () => {
    const asked = await requestSupportAccess(actorOf(team.SUPPORT), school.id, { reason: "Checking the fee settings", lengthMinutes: 60 });
    await asSchool(accountant.id, school.id);
    expect(await answerSupportAction(asked.id, "allow", null)).toMatch(/Only the School Admin or the Principal/);
    // Another school's admin cannot even find it.
    const otherAdmin = await makeUser({ schools: [{ id: other.id, roleKeys: ["school-admin"] }] });
    await asSchool(otherAdmin.id, other.id);
    expect(await answerSupportAction(asked.id, "allow", null)).toMatch(/not found/);
    expect((await requestOf(asked.id)).status).toBe("WAITING");
    // Decline needs a reason; then it can never be opened.
    await asSchool(principal.id, school.id);
    expect(await answerSupportAction(asked.id, "decline", "no")).toMatch(/at least 5 characters/);
    expect(await answerSupportAction(asked.id, "decline", "Please call the office first.")).toBeUndefined();
    const r = await requestOf(asked.id);
    expect(r.status).toBe("DECLINED");
    expect(r.declineReason).toBe("Please call the office first.");
    expect(r.decidedById).toBe(principal.id);
    expect((await audit(school.id, "support access declined")).some((a) => a.recordId === asked.id && a.userLoginId === principal.id)).toBe(true);
    const sessionId = await asConsole(team.SUPPORT);
    await expect(startSupportEntry(actorOf(team.SUPPORT), sessionId, asked.id)).rejects.toThrow(/no longer allowed/);
    // The person who asked is told.
    expect(await withConsole((tx) => tx.consoleNotification.count({ where: { userId: team.SUPPORT.id, text: { contains: "declined" } } }))).toBeGreaterThan(0);
  });
});

describe("inside the school, with access allowed", () => {
  it("opens only for the person who asked, with a one-time ticket", async () => {
    const asked = await requestSupportAccess(actorOf(team.SUPPORT), school.id, { reason: "Report card layout looks wrong", lengthMinutes: 60 });
    await asSchool(admin.id, school.id);
    expect(await answerSupportAction(asked.id, "allow", null)).toBeUndefined();
    const ownerSession = await asConsole(team.OWNER);
    await expect(startSupportEntry(actorOf(team.OWNER), ownerSession, asked.id)).rejects.toThrow(/who asked/);
    const sessionId = await asConsole(team.SUPPORT);
    const { ticket } = await startSupportEntry(actorOf(team.SUPPORT), sessionId, asked.id);
    const first = await claimSupportTicket(ticket);
    expect(first?.token).toBeTruthy();
    expect(await claimSupportTicket(ticket)).toBeNull();
    // School's End now: the token stops working at once.
    await asSchool(admin.id, school.id);
    expect(await endSupportNowAction(asked.id)).toBeUndefined();
    expect(await findSupportEntry(first!.token)).toBeNull();
    const r = await requestOf(asked.id);
    expect(r.status).toBe("ENDED");
    expect(r.endedHow).toBe("school");
  });

  it("sees that one school only, as nobody's login, with every page in its Audit Log", async () => {
    const s = await openSupport(team.SUPPORT);
    head.set(SUPPORT_PATH_HEADER, "/fee-management/structure");
    const current = await requireCurrent();
    expect(current.support?.requestId).toBe(s.id);
    expect(current.school.id).toBe(school.id);
    expect(current.user.id).toBe(SUPPORT_LOGIN_ID);
    expect(current.ctx.userId).toBe(SUPPORT_LOGIN_ID);
    expect(current.roles).toEqual([]);
    expect(current.schools.map((x) => x.id)).toEqual([school.id]);
    // The DREAM TEAM person is no User Login and holds no School Access.
    expect(await prisma.userLogin.count({ where: { OR: [{ id: SUPPORT_LOGIN_ID }, { phone: { contains: team.SUPPORT.phone.slice(-6) } }] } })).toBe(0);
    // Their reads go through this school's wall only.
    await withSchool(current.ctx, async (tx) => {
      expect((await tx.school.findMany()).map((x) => x.id)).toEqual([school.id]);
      expect((await tx.campus.findMany()).every((c) => c.schoolId === school.id)).toBe(true);
      expect(await tx.auditLogEntry.count({ where: { schoolId: other.id } })).toBe(0);
      expect(await tx.role.count({ where: { schoolId: other.id } })).toBe(0);
      expect(await tx.schoolAccess.count({ where: { userLoginId: SUPPORT_LOGIN_ID } })).toBe(0);
      // Console records stay invisible from inside the school.
      expect(await tx.supportAccessRequest.count()).toBe(0);
    });
    const looked = await audit(school.id, "support looked");
    const line = looked.find((a) => a.recordId === "/fee-management/structure");
    expect(line?.userLoginId).toBeNull();
    expect(line?.actorNote).toBe(`DREAM TEAM support (${team.SUPPORT.name})`);
    expect(await withConsole((tx) => tx.consoleActivityEntry.count({ where: { type: "support", actorId: team.SUPPORT.id, text: { contains: "/fee-management/structure" } } }))).toBe(1);
    await endSupportByToken(s.token);
  });

  it("refuses every change, export, print and payment cancellation, and writes the attempt down", async () => {
    const s = await openSupport(team.SUPPORT);
    for (const [module, action] of [["fee-management", "archive"], ["student-management", "edit"], ["fee-management", "export"], ["examination-results", "print"], ["settings", "edit"]] as const) {
      await expect(requireAction(module, action)).rejects.toBeInstanceOf(SupportLookOnlyError);
    }
    // Looking is allowed.
    expect((await requireAction("fee-management", "view")).current.support).toBeTruthy();
    // Cancelling a payment, through its own action.
    const cancel = (await cancelPaymentAction(null, form({ paymentId: randomUUID(), reason: "Wrong amount" }))) as { ok: boolean; message?: string };
    expect(cancel.ok).toBe(false);
    expect(cancel.message).toMatch(/DREAM TEAM support access/);
    // Deciding the school's own requests.
    expect(await decideAction(randomUUID(), "approve", null)).toMatch(/looking only/);
    // Answering or ending support from inside support.
    expect(await answerSupportAction(s.id, "allow", null)).toMatch(/Only the School Admin or the Principal/);
    // An export is never logged as made, even if some route reached it.
    const current = await requireCurrent();
    await expect(withSchool(current.ctx, (tx) => logExport(tx, current.ctx, { title: "Students", format: "csv", filters: "", rows: 1 }))).rejects.toThrow(/cannot export/);
    const refused = await audit(school.id, "support refused");
    expect(refused.filter((a) => a.recordId === s.id).length).toBeGreaterThanOrEqual(5);
    expect(refused.every((a) => a.userLoginId === null && a.actorNote?.startsWith("DREAM TEAM support ("))).toBe(true);
    await endSupportByToken(s.token);
  });

  it("never shows restricted details or Salary Management", async () => {
    const s = await openSupport(team.SUPPORT);
    const current = await requireCurrent();
    const a = abilities(current, { counsellingOn: true, counsellingRoles: ["principal", "school-admin"] });
    expect(a.seeRestricted).toBe(false);
    expect(a.seeCounselling).toBe(false);
    expect(a.seeCounsellingNotes).toBe(false);
    expect(canSeeRestricted(current.roles.map((r) => r.key))).toBe(false);
    const viewer = await withSchool(current.ctx, (tx) => viewerFor(tx, current.ctx, current));
    expect(viewer.restricted).toBe(false);
    expect(viewer.salary).toBe("none");
    await expect(requirePage("salary-management")).rejects.toThrow(/REDIRECT \/no-access/);
    expect(current.menu.some((m) => m.key === "salary-management")).toBe(false);
    await endSupportByToken(s.token);
  });

  it("ends by itself at the time given, and on End now from either side", async () => {
    const s = await openSupport(team.SUPPORT);
    expect(await getCurrent()).not.toBeNull();
    // The time given passes.
    await withConsole((tx) => tx.supportAccessRequest.update({ where: { id: s.id }, data: { endsAt: new Date(Date.now() - 1000) } }));
    expect(await getCurrent()).toBeNull();
    await expect(requireCurrent()).rejects.toThrow(/REDIRECT \/support\/left/);
    const r = await requestOf(s.id);
    expect(r.status).toBe("ENDED");
    expect(r.endedHow).toBe("time");
    expect((await audit(school.id, "support access ended")).some((a) => a.recordId === s.id && a.actorNote === "School OS (automatic)")).toBe(true);

    // The worker ends one nobody is using.
    const t = await openSupport(team.SUPPORT);
    await withConsole((tx) => tx.supportAccessRequest.update({ where: { id: t.id }, data: { endsAt: new Date(Date.now() - 1000) } }));
    expect(await endExpiredSupport()).toBeGreaterThanOrEqual(1);
    expect((await requestOf(t.id)).endedHow).toBe("time");

    // The support person's own End now.
    const u = await openSupport(team.SUPPORT);
    expect(await endSupportByToken(u.token)).not.toBeNull();
    expect((await requestOf(u.id)).endedHow).toBe("support");
    expect((await audit(school.id, "support access ended")).some((a) => a.recordId === u.id && a.actorNote === `DREAM TEAM support (${team.SUPPORT.name})`)).toBe(true);

    // End now from the console.
    const v = await openSupport(team.SUPPORT);
    await asConsole(team.OWNER);
    expect(((await endSupportAction(null, form({ requestId: v.id }))) as { ok: boolean }).ok).toBe(true);
    expect(await findSupportEntry(v.token)).toBeNull();
    expect((await requestOf(v.id)).endedHow).toBe("support");
  });

  it("stops when the DREAM TEAM person signs out of the console, or is disabled", async () => {
    const s = await openSupport(team.SUPPORT);
    expect(await findSupportEntry(s.token)).not.toBeNull();
    await withConsole((tx) => tx.consoleSession.update({ where: { id: s.sessionId }, data: { revokedAt: new Date(), revokedReason: "signed-out" } }));
    expect(await findSupportEntry(s.token)).toBeNull();
    // Signing back in to the console and opening it again works while the time lasts.
    const sessionId = await asConsole(team.SUPPORT);
    const { ticket } = await startSupportEntry(actorOf(team.SUPPORT), sessionId, s.id);
    const again = await claimSupportTicket(ticket);
    expect(await findSupportEntry(again!.token)).not.toBeNull();
    await endSupportByToken(again!.token);
  });

  it("a request to one school never opens another", async () => {
    const s = await openSupport(team.SUPPORT);
    const current = await requireCurrent();
    expect(current.schools).toHaveLength(1);
    await withSchool(current.ctx, async (tx) => {
      expect(await tx.school.findUnique({ where: { id: other.id } })).toBeNull();
    });
    // Nothing in the console lets the token reach another school's wall.
    expect((await findSupportEntry(s.token))?.schoolId).toBe(school.id);
    await endSupportByToken(s.token);
  });

  it("a made-up support cookie opens nothing", async () => {
    jar.set(SUPPORT_COOKIE, newToken());
    expect(await getCurrent()).toBeNull();
    await expect(requireCurrent()).rejects.toThrow(/REDIRECT \/support\/left/);
  });
});

describe("a support browser can only look (src/proxy.ts)", () => {
  const appDir = join(process.cwd(), "src", "app");
  const walk = (d: string, out: string[] = []): string[] => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p, out);
      else out.push(p.split("\\").join("/"));
    }
    return out;
  };
  const root = appDir.split("\\").join("/");
  const toPath = (f: string) => "/" + f.slice(root.length).replace(/\/(page|route)\.tsx?$/, "").split("/").filter((x) => x && !/^\(.*\)$/.test(x)).map((x) => (x.startsWith("[") ? "00000000-0000-4000-8000-000000000001" : x)).join("/");
  const files = walk(appDir).filter((f) => !f.includes("/_"));

  it("refuses every file, export and print route, and no page", () => {
    const routes = files.filter((f) => /\/route\.tsx?$/.test(f)).map(toPath).filter((p) => !p.startsWith("/console") && !p.startsWith("/support/") && !p.startsWith("/driver/"));
    const pages = files.filter((f) => /\/page\.tsx?$/.test(f)).map(toPath);
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.filter((p) => !supportRefusal("GET", p) && !["/api/v1/search", "/api/v1/me"].includes(p))).toEqual([]);
    expect(pages.filter((p) => supportRefusal("GET", p))).toEqual([]);
  });

  it("refuses every request that is not a page or a read, before any school code runs", async () => {
    const req = (path: string, method = "GET", extra: Record<string, string> = {}) => new NextRequest(`http://localhost${path}`, { method, headers: { cookie: `${SUPPORT_COOKIE}=${newToken()}`, ...extra } });
    expect(proxy(req("/fee-management/collect", "POST", { "next-action": "abc", "content-type": "text/plain" })).status).toBe(403);
    expect(proxy(req("/fee-management/reports/export?format=csv")).status).toBe(403);
    expect(proxy(req("/fee-management/payments/00000000-0000-4000-8000-000000000001/receipt")).status).toBe(403);
    expect(proxy(req("/api/v1/files/00000000-0000-4000-8000-000000000001")).status).toBe(403);
    const page = proxy(req("/fee-management/structure"));
    expect(page.status).toBe(200);
    expect(page.headers.get(`x-middleware-request-${SUPPORT_PATH_HEADER}`)).toBe("/fee-management/structure");
    // Ending it, and the console, still work.
    expect(proxy(req("/support/end", "POST")).status).toBe(200);
    expect(proxy(req("/console/support", "POST", { "next-action": "abc" })).status).toBe(200);
    // Without the support cookie nothing is refused.
    expect(proxy(new NextRequest("http://localhost/fee-management/collect", { method: "POST", headers: { "next-action": "abc" } })).status).toBe(200);
  });
});

describe("its record is the console's own", () => {
  it("is invisible from inside every school, and kept outside them", async () => {
    await withSchool({ schoolId: school.id, userId: admin.id }, async (tx) => {
      expect(await tx.supportAccessRequest.count()).toBe(0);
    });
    expect(await withConsole((tx) => tx.supportAccessRequest.count({ where: { forSchoolId: school.id } }))).toBeGreaterThan(0);
    expect(UID.test(SUPPORT_LOGIN_ID)).toBe(true);
  });
});
