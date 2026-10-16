// What comes back from a school to the console: counts and setup progress
// only, never a student's name, a fee amount or a salary (07-super-admin.md §1,
// §3.3, §11). This is the only place the console's code reads inside a school,
// and it returns numbers, yes/no answers and the School Admins' own logins.
// The result is kept on the school's console card (Console School).
import "server-only";

import type { Prisma } from "@prisma/client";
import { withConsole, withSchool } from "../db";
import { creditBalances } from "../messaging/credits";
import { setupSteps } from "../dashboard/setup";
import { combineRoles } from "../permissions";
import { ALL_ROLE_TEMPLATES } from "../roles";
import type { ModuleKey } from "../modules";

/** Roles that count as a school's admin in the console: both can create the school's other logins. */
export const ADMIN_ROLE_KEYS = ["school-admin", "principal"] as const;

export type AdminLogin = {
  userLoginId: string;
  name: string;
  phone: string | null;
  email: string | null;
  roleKey: string;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  /** Has a live School Access here. */
  live: boolean;
  lastSignInAt: Date | null;
  hasPassword: boolean;
};

const ADMIN_PERMISSIONS = combineRoles(ALL_ROLE_TEMPLATES.filter((r) => r.key === "school-admin").map((r) => r.permissions));

/** The school's admins: everyone who ever had the School Admin or Principal role here. */
export async function schoolAdmins(schoolId: string): Promise<AdminLogin[]> {
  return withSchool({ schoolId, userId: null }, async (tx) => {
    const rows = await tx.schoolAccess.findMany({
      where: { schoolId, roles: { some: { role: { key: { in: [...ADMIN_ROLE_KEYS] } } } } },
      include: { roles: { include: { role: { select: { key: true } } } }, userLogin: true },
      orderBy: { createdAt: "asc" },
    });
    const byLogin = new Map<string, AdminLogin>();
    for (const a of rows) {
      const live = a.archivedAt === null;
      const prev = byLogin.get(a.userLoginId);
      if (prev && prev.live && !live) continue;
      const roleKey = a.roles.map((r) => r.role.key).find((k) => k === "school-admin") ?? "principal";
      const u = a.userLogin;
      byLogin.set(a.userLoginId, {
        userLoginId: u.id,
        name: u.displayName,
        phone: u.phone,
        email: u.email,
        roleKey: roleKey ?? "school-admin",
        status: !live || u.status === "DISABLED" || u.archivedAt ? "DISABLED" : u.status === "INVITED" ? "INVITED" : "ACTIVE",
        live,
        lastSignInAt: u.lastSignInAt,
        hasPassword: Boolean(u.passwordHash),
      });
    }
    return [...byLogin.values()];
  });
}

export type SchoolMeasure = Awaited<ReturnType<typeof measureSchool>>;

/** Counts one school and keeps them on its console card. */
export async function measureSchool(schoolId: string, now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const ctx = { schoolId, userId: null };
  const m = await withSchool(
    ctx,
    async (tx) => {
      const school = await tx.school.findUnique({
        where: { id: schoolId },
        select: { name: true, code: true, phone: true, email: true, address: true, board: true, city: true, state: true, schoolType: true, status: true },
      });
      if (!school) return null;
      const modules = await tx.schoolModule.findMany({ where: { isOn: true }, select: { moduleKey: true } });
      const modulesOn = new Set<ModuleKey>(modules.map((x) => x.moduleKey as ModuleKey));
      const [activeStudents, accessRows, campuses, credits, messagesThisMonth, messagesStuck, messagesFailed, jobsFailed, steps] = await Promise.all([
        tx.student.count({ where: { archivedAt: null, status: "ACTIVE" } }),
        tx.schoolAccess.findMany({ where: { archivedAt: null }, select: { userLoginId: true }, distinct: ["userLoginId"] }),
        tx.campus.count({ where: { archivedAt: null } }),
        creditBalances(tx, ctx),
        tx.messageRecipient.count({ where: { sentAt: { gte: monthStart } } }),
        tx.messageRecipient.count({ where: { status: "QUEUED", queuedAt: { lt: new Date(now.getTime() - 10 * 60_000) } } }),
        tx.messageRecipient.count({ where: { status: "FAILED", failedAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
        tx.backgroundJob.count({ where: { status: "failed", finishedAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
        setupSteps(tx, ctx, { permissions: ADMIN_PERMISSIONS, modulesOn }),
      ]);
      const dayStart = new Date(now.getTime() - 86_400_000);
      const byChannel = await tx.messageRecipient.groupBy({
        by: ["channel", "status"],
        where: { OR: [{ sentAt: { gte: dayStart } }, { status: "QUEUED", queuedAt: { lt: new Date(now.getTime() - 10 * 60_000) } }, { failedAt: { gte: dayStart } }] },
        _count: true,
      });
      const channelStats: Record<string, { sentToday: number; stuck: number; failed: number }> = {};
      for (const r of byChannel) {
        const c = (channelStats[r.channel] ??= { sentToday: 0, stuck: 0, failed: 0 });
        if (r.status === "QUEUED") c.stuck += r._count;
        else if (r.status === "FAILED") c.failed += r._count;
        else c.sentToday += r._count;
      }
      const ids = accessRows.map((a) => a.userLoginId);
      const last = ids.length
        ? await tx.userLogin.aggregate({ where: { id: { in: ids } }, _max: { lastSignInAt: true } })
        : { _max: { lastSignInAt: null } };
      return {
        school,
        activeStudents,
        staffLogins: ids.length,
        lastActivityAt: last._max.lastSignInAt,
        messagesThisMonth,
        creditsWhatsapp: credits.whatsapp,
        creditsSms: credits.sms,
        modulesOn: [...modulesOn],
        campuses,
        setup: steps.map((s) => ({ key: s.key, label: s.label, done: s.done, optional: Boolean(s.optional), skipped: s.skipped })),
        messagesStuck,
        messagesFailed,
        jobsFailed,
        channelStats,
      };
    },
    { timeout: 30_000 },
  );
  if (!m) return null;
  const admins = await schoolAdmins(schoolId);
  const first = admins.find((a) => a.status === "ACTIVE") ?? admins.find((a) => a.status === "INVITED") ?? null;
  const signedIn = admins.filter((a) => a.lastSignInAt);
  const setupDone = m.setup.filter((s) => s.done || s.skipped).length;

  await withConsole(async (tx) => {
    const card = await tx.consoleSchool.findUnique({ where: { id: schoolId } });
    if (!card) return;
    const data: Prisma.ConsoleSchoolUpdateInput = {
      // The school edits its own details in Settings once its admin has signed in; the console follows.
      ...(card.firstAdminSignInAt || signedIn.length
        ? { name: m.school.name, phone: m.school.phone, phoneDigits: m.school.phone ? m.school.phone.replace(/\D/g, "").slice(-10) : null, email: m.school.email, address: m.school.address, board: m.school.board, city: m.school.city ?? card.city, state: m.school.state ?? card.state, schoolType: m.school.schoolType ?? card.schoolType }
        : {}),
      status: m.school.status,
      activeStudents: m.activeStudents,
      staffLogins: m.staffLogins,
      lastActivityAt: m.lastActivityAt,
      messagesThisMonth: m.messagesThisMonth,
      creditsWhatsapp: m.creditsWhatsapp,
      creditsSms: m.creditsSms,
      modulesOn: m.modulesOn,
      campuses: m.campuses,
      setupDone,
      setupTotal: m.setup.length,
      setupSteps: m.setup,
      setupChangedAt: card.setupDone !== setupDone || !card.setupChangedAt ? now : card.setupChangedAt,
      messagesStuck: m.messagesStuck,
      messagesFailed: m.messagesFailed,
      jobsFailed: m.jobsFailed,
      channelStats: m.channelStats,
      adminName: first?.name ?? null,
      adminPhone: first?.phone ?? null,
      adminSignedIn: signedIn.length > 0,
      firstAdminSignInAt: card.firstAdminSignInAt ?? (signedIn.length ? signedIn.map((a) => a.lastSignInAt!).sort((a, b) => a.getTime() - b.getTime())[0] : null),
      measuredAt: now,
    };
    await tx.consoleSchool.update({ where: { id: schoolId }, data });
  });
  return { ...m, admins, setupDone };
}

/** Re-counts schools whose card is older than maxAgeMs (or never counted). */
export async function measureStale(maxAgeMs = 60 * 60_000, now = new Date(), limit = 50) {
  const stale = await withConsole((tx) =>
    tx.consoleSchool.findMany({
      where: { OR: [{ measuredAt: null }, { measuredAt: { lt: new Date(now.getTime() - maxAgeMs) } }] },
      select: { id: true },
      orderBy: { measuredAt: { sort: "asc", nulls: "first" } },
      take: limit,
    }),
  );
  for (const s of stale) {
    try {
      await measureSchool(s.id, now);
    } catch (e) {
      console.error(JSON.stringify({ level: "error", event: "console-measure-failed", school: s.id, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  return stale.length;
}
