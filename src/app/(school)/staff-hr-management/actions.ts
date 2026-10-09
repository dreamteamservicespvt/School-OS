"use server";

import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { act, FieldProblem, optionalId, str, UUID_RE } from "@/lib/staff/act";
import { HrOnlyError } from "@/lib/staff/access";
import type { FormState } from "@/lib/forms";

function ids(fd: FormData) {
  const list = fd.getAll("ids").map(String).filter((v) => UUID_RE.test(v));
  if (list.length === 0) throw new FieldProblem("Select at least one staff member.");
  if (list.length > 500) throw new FieldProblem("Select at most 500 staff at a time.");
  return [...new Set(list)];
}

/** Bulk: change department (P11), with a result summary. */
export async function bulkChangeDepartment(_: FormState<unknown>, fd: FormData) {
  const { current, reach } = await requireAction("staff-hr-management", "edit");
  return act(fd, async () => {
    if (reach !== "all") throw new HrOnlyError("bulk changes");
    const list = ids(fd);
    const departmentId = optionalId(fd, "departmentId");
    return withSchool(current.ctx, async (tx) => {
      const dept = departmentId ? await tx.department.findFirst({ where: { id: departmentId, archivedAt: null } }) : null;
      if (departmentId && !dept) throw new FieldProblem("Choose a department.", "departmentId");
      const staff = await tx.staff.findMany({ where: { id: { in: list }, archivedAt: null } });
      let changed = 0;
      for (const s of staff) {
        if (s.departmentId === (dept?.id ?? null)) continue;
        await tx.staff.update({ where: { id: s.id }, data: { departmentId: dept?.id ?? null, updatedById: current.user.id } });
        await writeAudit(tx, current.ctx, { action: "changed", recordType: "Staff", recordId: s.id, before: { departmentId: s.departmentId }, after: { departmentId: dept?.id ?? null } });
        changed++;
      }
      return { changed, skipped: staff.length - changed, name: dept?.name ?? "no department" };
    });
  }, (r) => `${r.changed} moved to ${r.name}${r.skipped ? `, ${r.skipped} skipped: already there` : ""}.`);
}

/**
 * Bulk: send a message to staff. Staff with a login get it in School OS
 * (Notifications). SMS and WhatsApp go through Communication.
 */
export async function bulkMessage(_: FormState<unknown>, fd: FormData) {
  const { current, reach } = await requireAction("staff-hr-management", "edit");
  return act(fd, async () => {
    if (reach !== "all") throw new HrOnlyError("messages to staff");
    const list = ids(fd);
    const text = str(fd, "text");
    if (text.length < 3) throw new FieldProblem("Type the message.", "text");
    if (text.length > 500) throw new FieldProblem("A message can be at most 500 characters.", "text");
    return withSchool(current.ctx, async (tx) => {
      const staff = await tx.staff.findMany({ where: { id: { in: list }, archivedAt: null }, select: { id: true, userLoginId: true } });
      let sent = 0;
      for (const s of staff) {
        if (!s.userLoginId) continue;
        await notify(tx, current.ctx, { to: s.userLoginId, type: "staff-message", text: `${current.user.displayName}: ${text}`, link: `/staff-hr-management/${s.id}` });
        sent++;
      }
      // messaging: SMS / WhatsApp copies to staff phones go through Communication's sendMessage once it exists.
      await writeAudit(tx, current.ctx, { action: "messaged", recordType: "Staff", recordId: null, after: { staff: staff.length, sent, text } });
      return { sent, skipped: staff.length - sent };
    });
  }, (r) => `Message sent to ${r.sent} staff in School OS${r.skipped ? `, ${r.skipped} skipped: no login yet` : ""}.`);
}
