"use server";

import { redirect } from "next/navigation";
import { requireConsoleAction, ConsoleDenied } from "@/lib/console/current";
import { addSchool, cityCode, ConsoleProblem, findDuplicates, findExistingLogin, schoolInitials } from "@/lib/console/schools";
import { withConsole } from "@/lib/db";
import { flash } from "@/lib/flash";
import { formValues, type FormState } from "@/lib/forms";
import { revalidatePath } from "next/cache";

export type AddWarnings = {
  sameName: { id: string; name: string; city: string | null; addedOn: string } | null;
  samePhone: { id: string; name: string; city: string | null } | null;
  existing: { name: string; schoolName: string | null; sameGroup: boolean; groupName: string | null } | null;
  code: string | null;
};

/** The warnings Add School shows while typing: same name and city, same phone, a mobile that already has a login. */
export async function checkAddSchool(input: { name: string; city: string; phone: string; mobile: string; groupId: string | null }): Promise<AddWarnings> {
  await requireConsoleAction("add");
  const name = String(input.name ?? "").slice(0, 160);
  const city = String(input.city ?? "").slice(0, 80);
  const [dups, existing] = await Promise.all([findDuplicates({ name, city, phone: input.phone }), findExistingLogin(input.mobile)]);
  let code: string | null = null;
  if (name.trim() && city.trim()) {
    const prefix = `${schoolInitials(name)}-${cityCode(city)}-`;
    const taken = await withConsole((tx) => tx.consoleSchool.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } }));
    const nums = taken.map((t) => Number(t.code.slice(prefix.length))).filter((n) => Number.isFinite(n));
    code = `${prefix}${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
  }
  const where = existing?.schools[0] ?? null;
  const inGroup = existing && input.groupId ? existing.schools.find((s) => s.groupId === input.groupId) ?? null : null;
  return {
    sameName: dups.sameName ? { id: dups.sameName.id, name: dups.sameName.name, city: dups.sameName.city, addedOn: dups.sameName.createdAt.toISOString().slice(0, 10) } : null,
    samePhone: dups.samePhone ? { id: dups.samePhone.id, name: dups.samePhone.name, city: dups.samePhone.city } : null,
    existing: existing ? { name: existing.login.displayName, schoolName: (inGroup ?? where)?.name ?? null, sameGroup: Boolean(inGroup), groupName: (inGroup ?? where)?.groupName ?? null } : null,
    code,
  };
}

export async function addSchoolAction(_p: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  let made: { schoolId: string } | null = null;
  try {
    const c = await requireConsoleAction("add");
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    const approx = s("approxStudents").replace(/\D/g, "");
    const group = s("group");
    const r = await addSchool(c.actor, {
      name: s("name"), city: s("city"), state: s("state"), board: s("board"), schoolType: s("schoolType"), phone: s("phone"), email: s("email") || null,
      approxStudents: approx ? Math.min(Number(approx), 100_000) : null,
      groupId: group && group !== "none" && group !== "new" ? group : null,
      newGroupName: group === "new" ? s("newGroupName") : null,
      adminName: s("adminName"), adminMobile: s("adminMobile"), adminEmail: s("adminEmail") || null,
      adminRole: s("adminRole") === "principal" ? "principal" : "school-admin",
      channels: fd.getAll("channels").map(String),
      startAs: s("startAs") === "ACTIVE" ? "ACTIVE" : "TRIAL",
      planKey: s("planKey") === "complete" ? "complete" : "essential",
      hostel: s("hostel") === "on",
      optionalOn: fd.getAll("optionalOn").map(String),
    });
    await flash({ message: `${r.name} added. School code ${r.code}.`, tone: "success" });
    revalidatePath("/console", "layout");
    made = { schoolId: r.schoolId };
  } catch (e) {
    if (e instanceof ConsoleProblem) return { ok: false, message: e.message, errors: e.field ? { [e.field]: e.message } : undefined, values };
    if (e instanceof ConsoleDenied) return { ok: false, message: e.message, values };
    throw e;
  }
  redirect(`/console/schools/new/done?id=${made.schoolId}`);
}
