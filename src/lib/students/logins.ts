// Student logins (optional; Student Settings "Student logins"). A login is
// made with the Student role (Homework & Learning only). Nobody types or sees
// a student's password: each student gets a set-password link, which the
// school shares by CSV (or WhatsApp, SMS or email through Communication).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { INVITE_VALID_MS } from "../auth/invites";
import { hashToken, newToken } from "../auth/tokens";
import { getStudentSettings } from "./settings";
import { StudentProblem } from "./students";
import { schoolRole } from "../school-roles";

export type LoginLine = { studentId: string; fullName: string; admissionNo: string; username: string; link: string; isNew: boolean };

/** "cems-2026-0180": the school code once, even when the admission number already starts with it. */
export function usernameFor(code: string, admissionNo: string) {
  const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const c = slug(code), a = slug(admissionNo);
  return a === c || a.startsWith(`${c}-`) ? a : slug(`${c}-${a}`);
}

/** Makes a login for each student without one, or a fresh set-password link for those who have one. */
export async function generateLogins(tx: Tx, ctx: SchoolContext, studentIds: string[], origin: string): Promise<LoginLine[]> {
  const settings = await getStudentSettings(tx, ctx);
  if (!settings.studentLoginsOn) throw new StudentProblem("Student logins are switched off (Student Settings, Student logins).");
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId } });
  const role = await schoolRole(tx, ctx, { where: { key: "student", archivedAt: null } });
  if (!role) throw new StudentProblem("The Student role is missing. Set it up in Settings, Users & Permissions (the School Admin can).");
  if (!role.isEnabled) await tx.role.update({ where: { id: role.id }, data: { isEnabled: true } });
  const lines: LoginLine[] = [];
  for (const id of studentIds) {
    const s = await tx.student.findFirst({ where: { id, archivedAt: null } });
    if (!s) continue;
    const token = newToken();
    const invite = { inviteTokenHash: hashToken(token), inviteExpiresAt: new Date(Date.now() + INVITE_VALID_MS) };
    let isNew = false;
    let username: string;
    if (s.userLoginId) {
      const u = await tx.userLogin.update({ where: { id: s.userLoginId }, data: invite });
      username = u.username;
    } else {
      username = usernameFor(school.code, s.admissionNo);
      const clash = await tx.userLogin.findUnique({ where: { username } });
      if (clash) username = `${username}-${s.id.slice(0, 4)}`;
      const u = await tx.userLogin.create({ data: { username, displayName: s.fullName, status: "INVITED", ...invite } });
      await tx.schoolAccess.create({ data: { schoolId: ctx.schoolId, userLoginId: u.id, scope: "OWN", roles: { create: [{ roleId: role.id, schoolId: ctx.schoolId }] } } });
      await tx.student.update({ where: { id: s.id }, data: { userLoginId: u.id } });
      isNew = true;
    }
    lines.push({ studentId: s.id, fullName: s.fullName, admissionNo: s.admissionNo, username, link: `${origin}/invite/${token}`, isNew });
  }
  await writeAudit(tx, ctx, { action: "student-logins", recordType: "User Login", recordId: null, after: { students: lines.length, newLogins: lines.filter((l) => l.isNew).length } });
  return lines;
}

export function loginsCsv(lines: LoginLine[]) {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return "﻿" + ["Student,Admission number,Username,Set-password link (works for 7 days)", ...lines.map((l) => [l.fullName, l.admissionNo, l.username, l.link].map(q).join(","))].join("\r\n") + "\r\n";
}
