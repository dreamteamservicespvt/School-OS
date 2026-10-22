"use server";

// Paper forms received, class by class (gap list G42). Recording a parent's
// signed paper form is Student Management's work (Consent Records live on the
// guardian there), so the role is checked against Student Management on the
// server, whichever page the person started from, after the Settings page
// check: the person must be able to open Data Backup & Security, as the page asks.

import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/current";
import { requireSettingsAction } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { formValues, type FormState } from "@/lib/forms";
import { RowProblem } from "@/lib/importer";
import { markPaperFormsReceived } from "@/lib/students/paper-consent";
import { sectionInCampus } from "@/lib/campus";
import "@/lib/import-registry";

const ID = /^[0-9a-f-]{36}$/i;
const PAGE = "data-security" as const;

export async function paperFormsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSettingsAction(PAGE, "view");
  const { current } = await requireAction("student-management", "create");
  const values = formValues(fd);
  const sectionId = values.sectionId ?? "";
  const consentType = values.consentType ?? "";
  const studentIds = fd.getAll("student").map(String).filter((x) => ID.test(x));
  const rawDate = values.formDate ?? "";
  const formDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? new Date(`${rawDate}T00:00:00Z`) : null;
  if (!ID.test(sectionId) || !consentType) return { ok: false, message: "Choose a class and a consent first.", values };
  if (!formDate || Number.isNaN(formDate.getTime())) return { ok: false, message: "Check the field marked below.", errors: { formDate: "Choose the date written on the forms." }, values };
  if (!studentIds.length) return { ok: false, message: "Tick the students whose signed forms you have.", values };
  try {
    const r = await withSchool(current.ctx, async (tx) => {
      const section = await tx.section.findFirst({ where: { id: sectionId, archivedAt: null, ...sectionInCampus(current) }, include: { schoolClass: true } });
      if (!section) throw new RowProblem("This class was not found.");
      return markPaperFormsReceived(tx, current.ctx, { sectionId, sectionLabel: `${section.schoolClass.name} ${section.name}`, consentType, formDate, studentIds, campusId: current.campusId });
    }, { timeout: 60_000 });
    revalidatePath("/settings/data-security/consent");
    const left = r.skipped ? ` ${r.skipped} left as they are: ${r.reasons.slice(0, 3).join(" ")}${r.reasons.length > 3 ? ` and ${r.reasons.length - 3} more.` : ""}` : "";
    return { ok: true, message: `${r.recorded} paper ${r.recorded === 1 ? "form" : "forms"} recorded, with your name.${left} To take them back, use Undo in Student Management, Import students, Import history.` };
  } catch (e) {
    if (e instanceof RowProblem) return { ok: false, message: e.message, values };
    throw e;
  }
}
