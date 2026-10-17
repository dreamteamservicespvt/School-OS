"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSettingsAction } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { formValues, type FormState } from "@/lib/forms";
import { DOCUMENT_TYPES, FileProblem, SHEET_TYPES, saveFile } from "@/lib/files";
import { importKind, undoImport } from "@/lib/importer";
import { requestDataExport } from "@/lib/data-security/data-export";
import { startImport } from "@/lib/data-security/imports";
import { mayImport } from "@/lib/move-in/service";
import { PrivacyProblem, personTypesFor, requestDeletion, setRetention, DELETION_PARTS, type DeletionPart } from "@/lib/data-security/privacy";
import { ConsentProblem, saveConsentText } from "@/lib/data-security/consent";
import { TWO_STEP_FEATURE } from "@/lib/data-security/alerts";
import { DecisionProblem } from "@/lib/approvals";

const BASE = "/settings/data-security";
const PAGE = "data-security" as const;

export async function requestExportAction(): Promise<string | void> {
  const { current } = await requireSettingsAction(PAGE, "export");
  const { already } = await withSchool(current.ctx, (tx) => requestDataExport(tx, current.ctx, current.permissions));
  await flash({ message: already ? "Your full data export is already being prepared. You will get a notification when it is ready." : "Preparing your full data export. You will get a notification with the download link when it is ready, usually within a few minutes." });
  revalidatePath(BASE);
}

export async function setTwoStepAction(on: boolean): Promise<string | void> {
  const { current } = await requireSettingsAction(PAGE, "edit");
  await withSchool(current.ctx, async (tx) => {
    const before = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: current.ctx.schoolId, featureKey: TWO_STEP_FEATURE } } });
    await tx.schoolFeature.upsert({
      where: { schoolId_featureKey: { schoolId: current.ctx.schoolId, featureKey: TWO_STEP_FEATURE } },
      create: { schoolId: current.ctx.schoolId, featureKey: TWO_STEP_FEATURE, isOn: on },
      update: { isOn: on },
    });
    await writeAudit(tx, current.ctx, { action: "feature-switched", recordType: "School Feature", recordId: null, before: { feature: TWO_STEP_FEATURE, isOn: before?.isOn ?? false }, after: { feature: TWO_STEP_FEATURE, isOn: on } });
  });
  await flash({ message: on ? "Two-step login is on. People in roles that need it will be asked for a one-time code at their next sign-in." : "Two-step login is off. Everyone signs in with a password only." });
  revalidatePath(BASE);
}

// Imports

export async function uploadImportFile(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireSettingsAction(PAGE, "create");
  const kind = String(fd.get("kind") ?? "");
  if (!importKind(kind)) return { ok: false, message: "Choose what you are importing.", errors: { kind: "Choose what you are importing." } };
  if (!mayImport(current.permissions, kind, "create", current.modulesOn)) return { ok: false, message: "Your role cannot add these records. Ask your School Admin.", errors: { kind: "Your role cannot add these records." }, values: { kind } };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a CSV or Excel file to upload.", errors: { file: "Choose a CSV or Excel file to upload." }, values: { kind } };
  let id: string;
  try {
    const saved = await withSchool(current.ctx, (tx) => saveFile(tx, current.ctx, { file, purpose: "import", allowed: SHEET_TYPES }));
    id = saved.id;
  } catch (e) {
    const message = e instanceof FileProblem ? e.message : "The file did not upload. Try again.";
    return { ok: false, message, errors: { file: message }, values: { kind } };
  }
  redirect(`${BASE}/imports/new?kind=${encodeURIComponent(kind)}&file=${id}&step=match`);
}

export async function startImportAction(kind: string, fileId: string, match: Record<string, number>): Promise<string | void> {
  const { current } = await requireSettingsAction(PAGE, "create");
  const k = importKind(kind);
  if (!k) return "This import is not known.";
  if (!mayImport(current.permissions, kind, "create", current.modulesOn)) return "Your role cannot add these records. Ask your School Admin.";
  const missing = k.columns.filter((c) => c.required && match[c.key] === undefined).map((c) => c.label);
  if (missing.length) return `Match a column for ${missing.join(", ")} first.`;
  await withSchool(current.ctx, (tx) => startImport(tx, current.ctx, { kind, fileId, match }));
  await flash({ message: `${k.label} import started. The good rows are being imported now; you will get a notification when it is done.`, link: { href: `${BASE}/imports`, label: "See import history" } });
  redirect(`${BASE}/imports`);
}

export async function undoImportAction(batchId: string): Promise<string | void> {
  const { current } = await requireSettingsAction(PAGE, "archive");
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) return "This import was not found.";
  try {
    await withSchool(current.ctx, async (tx) => {
      const batch = await tx.importBatch.findUnique({ where: { id: batchId }, select: { kind: true } });
      if (!batch) throw new Error("This import cannot be undone: it was not found.");
      if (!mayImport(current.permissions, batch.kind, "archive", current.modulesOn)) throw new Error("This import cannot be undone by your role. Ask your School Admin.");
      await undoImport(tx, current.ctx, batchId);
    }, { timeout: 60_000 });
  } catch (e) {
    return e instanceof Error && /already undone|cannot be undone/.test(e.message) ? e.message : "The import could not be undone. Nothing was changed. Try again.";
  }
  revalidatePath(`${BASE}/imports`);
}

// Privacy

export async function saveRetentionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireSettingsAction(PAGE, "edit");
  const values = formValues(fd);
  const errors: Record<string, string> = {};
  let changed = 0;
  try {
    await withSchool(current.ctx, async (tx) => {
      for (const [key, raw] of Object.entries(values)) {
        if (!key.startsWith("keep_")) continue;
        const type = key.slice(5);
        const v = raw.trim();
        const months = v === "forever" ? null : v === "" ? undefined : Number(v);
        if (months === undefined || (months !== null && !Number.isFinite(months))) { errors[type] = "Choose how long to keep these."; continue; }
        try {
          if (await setRetention(tx, current.ctx, type, months)) changed++;
        } catch (e) {
          if (e instanceof PrivacyProblem) errors[type] = e.message;
          else throw e;
        }
      }
      if (Object.keys(errors).length) throw new PrivacyProblem("not saved");
    });
  } catch (e) {
    if (e instanceof PrivacyProblem) return { ok: false, message: Object.keys(errors).length === 1 ? Object.values(errors)[0] : `Please fix ${Object.keys(errors).length} things. Nothing was saved.`, errors, values };
    throw e;
  }
  revalidatePath(`${BASE}/privacy`);
  return { ok: true, message: changed ? `Saved. ${changed} period${changed === 1 ? "" : "s"} changed.` : "Nothing changed." };
}

export async function requestDeletionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireSettingsAction(PAGE, "create");
  const values = formValues(fd);
  const personType = values.personType === "guardian" || values.personType === "staff" ? values.personType : "student";
  if (!personTypesFor(current.permissions).includes(personType)) return { ok: false, message: "Your role cannot see these records, so it cannot ask for them to be removed.", values };
  const all = values.scopeAll === "all";
  const parts = DELETION_PARTS.map((p) => p.key).filter((k) => fd.get(`part_${k}`) === "on") as DeletionPart[];
  if (!all && parts.length === 0) return { ok: false, message: "Choose what to remove.", errors: { scope: "Choose what to remove." }, values };
  const proof = fd.get("proof");
  try {
    await withSchool(current.ctx, async (tx) => {
      let proofFileId: string | null = null;
      if (proof instanceof File && proof.size > 0) proofFileId = (await saveFile(tx, current.ctx, { file: proof, purpose: "deletion-proof", allowed: DOCUMENT_TYPES })).id;
      await requestDeletion(tx, current.ctx, { personType, personId: values.personId ?? "", scope: all ? "all" : parts, reason: values.reason ?? "", askedBy: values.askedBy ?? "", proofFileId });
    });
  } catch (e) {
    if (e instanceof PrivacyProblem || e instanceof FileProblem || e instanceof DecisionProblem) {
      const field = e instanceof PrivacyProblem ? e.field : e instanceof FileProblem ? "proof" : undefined;
      return { ok: false, message: e.message, errors: field ? { [field]: e.message } : undefined, values };
    }
    if (e instanceof Error && /Nobody else can approve/.test(e.message)) return { ok: false, message: e.message, values };
    throw e;
  }
  await flash({ message: "Deletion request sent to Approvals. Nothing is removed until it is approved.", link: { href: "/approvals", label: "Open Approvals" } });
  redirect(`${BASE}/privacy#deletion`);
}

// Consent

export async function saveConsentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireSettingsAction(PAGE, "edit");
  const values = formValues(fd);
  const languages = await withSchool(current.ctx, async (tx) => (await tx.school.findUnique({ where: { id: current.ctx.schoolId }, select: { languages: true, defaultLanguage: true } })));
  const langs = [...new Set([languages?.defaultLanguage ?? "en", ...(languages?.languages ?? ["en"])])];
  const text: Record<string, string> = {};
  for (const l of langs) text[l] = values[`text_${l}`] ?? "";
  const consentType = values.consentType === "new" ? `new:${values.newType ?? ""}` : values.consentType ?? "";
  try {
    const row = await withSchool(current.ctx, (tx) => saveConsentText(tx, current.ctx, { consentType, title: values.title ?? "", text, askedOnAdmission: values.askedOnAdmission === "on" }, langs));
    await flash({ message: row.version === 1 ? `Version 1 saved. Guardians are asked for it from now on.` : `Version ${row.version} saved. Guardians who agreed earlier keep the version they agreed to.` });
  } catch (e) {
    if (e instanceof ConsentProblem) return { ok: false, message: e.message, errors: e.field ? { [e.field]: e.message } : undefined, values };
    throw e;
  }
  redirect(`${BASE}/consent`);
}
