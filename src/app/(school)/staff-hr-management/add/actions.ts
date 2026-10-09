"use server";

import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { parseForm, type FormState } from "@/lib/forms";
import { IMAGE_TYPES, saveFile } from "@/lib/files";
import { MODULE_KEYS } from "@/lib/modules";
import type { AccessLevel } from "@/lib/roles";
import { file, problemState, str, UUID_RE, FieldProblem } from "@/lib/staff/act";
import { HrOnlyError } from "@/lib/staff/access";
import { detailsSchema } from "@/lib/staff/schemas";
import { createStaff, findDuplicates, type AllocationPick, type Duplicate } from "@/lib/staff/staff";
import { markHired } from "@/lib/staff/talent";
import { flash } from "@/lib/flash";

/** Step 1 check before moving on: every field, and the duplicate warning (P3). */
export async function checkDetails(_: FormState<{ duplicates: Duplicate[] }>, fd: FormData): Promise<FormState<{ duplicates: Duplicate[] }>> {
  const { current, reach } = await requireAction("staff-hr-management", "create");
  if (reach !== "all") return problemState(new HrOnlyError("adding staff")) as FormState<{ duplicates: Duplicate[] }>;
  const parsed = parseForm(detailsSchema, fd);
  if (!parsed.ok) return parsed.state as FormState<{ duplicates: Duplicate[] }>;
  const photo = file(fd, "photo");
  if (photo && photo.size > 2 * 1024 * 1024) return { ok: false, message: `The photo is ${(photo.size / 1024 / 1024).toFixed(1)} MB. Photos can be at most 2 MB.`, errors: { photo: "Photos can be at most 2 MB." } };
  const duplicates = await withSchool(current.ctx, (tx) => findDuplicates(tx, current.ctx, { phone: parsed.data.phone, email: parsed.data.email }));
  return { ok: true, data: { duplicates } };
}

export type Created = { staffId: string; staffCode: string; name: string; username: string | null; inviteLink: string | null; roles: string[]; allocated: number; phone: string; email: string | null };

/** Create staff: details, login and roles, classes and subjects, saved together. */
export async function createStaffAction(_: FormState<Created>, fd: FormData): Promise<FormState<Created>> {
  const { current, reach } = await requireAction("staff-hr-management", "create");
  try {
    if (reach !== "all") throw new HrOnlyError("adding staff");
    const parsed = parseForm(detailsSchema, fd);
    if (!parsed.ok) return { ...parsed.state, data: undefined, message: `Step 1: ${parsed.state.message}` };
    const d = parsed.data;

    const giveLogin = str(fd, "giveLogin") === "on";
    const roleKeys = fd.getAll("roleKeys").map(String).filter(Boolean);
    const exceptions: Record<string, AccessLevel> = {};
    for (const key of MODULE_KEYS) {
      const v = str(fd, `perm:${key}`);
      if (["full", "view", "own", "none"].includes(v)) exceptions[key] = v as AccessLevel;
    }
    if (giveLogin && roleKeys.length === 0) throw new FieldProblem("Step 2: choose at least one role, or switch off the login.", "roleKeys");

    const allocations: AllocationPick[] = fd.getAll("alloc").map(String).map((v) => v.split(":")).filter(([a, b]) => UUID_RE.test(a ?? "") && UUID_RE.test(b ?? "")).map(([sectionId, subjectId]) => ({ sectionId, subjectId }));
    const applicationId = str(fd, "applicationId");

    const result = await withSchool(current.ctx, async (tx) => {
      const photo = file(fd, "photo");
      let photoFileId: string | null = null;
      if (photo) {
        if (photo.size > 2 * 1024 * 1024) throw new FieldProblem("Photos can be at most 2 MB.", "photo");
        photoFileId = (await saveFile(tx, current.ctx, { file: photo, purpose: "staff-photo", allowed: IMAGE_TYPES, maxImageWidth: 600 })).id;
      }
      const r = await createStaff(tx, current.ctx, { ...d, gender: d.gender ?? null, bloodGroup: d.bloodGroup ?? null, photoFileId },
        giveLogin ? { roleKeys, username: str(fd, "username") || null, exceptions, campusId: str(fd, "accessCampusId") || null } : null,
        allocations, { allowDuplicate: str(fd, "allowDuplicate") === "on" });
      if (UUID_RE.test(applicationId)) await markHired(tx, current.ctx, applicationId, r.staff.id);
      return r;
    }, { timeout: 30_000 });
    await flash({ message: `${result.staff.fullName} added as ${result.staff.staffCode}.`, link: { href: `/staff-hr-management/${result.staff.id}`, label: "Open profile" } });
    return {
      ok: true,
      message: `${result.staff.fullName} added.`,
      data: { staffId: result.staff.id, staffCode: result.staff.staffCode, name: result.staff.fullName, username: result.username, inviteLink: result.inviteLink, roles: result.roleNames, allocated: result.allocated, phone: result.staff.phone, email: result.staff.email },
    };
  } catch (e) {
    return problemState(e, fd) as FormState<Created>;
  }
}
