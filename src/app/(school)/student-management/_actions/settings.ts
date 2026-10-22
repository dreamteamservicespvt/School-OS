"use server";

// Student Settings (03 §6): one save per tab. Every change is audited with
// before and after values (saveStudentSettings). The promotion policy is saved
// as a new version, so past promotions keep the rules they used.

import { revalidatePath } from "next/cache";
import type { CertificateType } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { formValues, type FormState } from "@/lib/forms";
import { saveStudentSettings, savePolicy, type IdentifierType, type IncidentType, type SettingsChange } from "@/lib/students/settings";
import { BEHAVIOUR_KINDS, CERTIFICATE_LABEL, ID_CARD_FIELDS, LIST_COLUMNS, OPTIONAL_FORM_FIELDS, type BehaviourKind } from "@/lib/students/labels";
import { StudentProblem } from "@/lib/students/students";
import { BASE, attemptForm, studentAction } from "../_lib/page";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "type";
const on = (fd: FormData, k: string) => fd.get(k) === "on";
const lines = (v: FormDataEntryValue | null, max = 60) => [...new Set(String(v ?? "").split(/\r?\n/).map((l) => l.trim().slice(0, 120)).filter(Boolean))].slice(0, max);

type Errors = Record<string, string>;
const fail = (errors: Errors, values: Record<string, string>): FormState => ({ ok: false, message: Object.keys(errors).length === 1 ? Object.values(errors)[0] : `Please fix ${Object.keys(errors).length} things before saving.`, errors, values });

export async function saveSettingsAction(section: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await studentAction("edit", { manage: true });
  const values = formValues(fd);
  const errors: Errors = {};
  let change: SettingsChange = {};
  let policy: { yearId: string; passRequired: boolean; minAttendancePct: number | null; feeDuesAllowed: boolean; exceptionApproverRole: string } | null = null;

  if (section === "general") {
    const prefix = String(fd.get("admissionPrefix") ?? "").trim();
    const padding = Number(fd.get("admissionPadding"));
    if (prefix.length > 20 || /[^\w/\-]/.test(prefix)) errors.admissionPrefix = "Prefix can have up to 20 letters, digits, / or -.";
    if (!Number.isInteger(padding) || padding < 1 || padding > 8) errors.admissionPadding = "Digits in the running number must be 1 to 8.";
    const required = fd.getAll("requiredFields").map(String).filter((k) => OPTIONAL_FORM_FIELDS.some((f) => f.key === k));
    const columns = fd.getAll("listColumns").map(String).filter((k) => LIST_COLUMNS.some((c) => c.key === k));
    if (columns.length === 0) errors.listColumns = "Choose at least one column for the Student List.";
    const docs = lines(fd.get("requiredDocuments"), 30);
    change = { admissionPrefix: prefix, admissionUseYear: on(fd, "admissionUseYear"), admissionPadding: padding, admissionRestartYear: on(fd, "admissionRestartYear"), requiredFields: required, listColumns: columns, requiredDocuments: docs, studentLoginsOn: on(fd, "studentLoginsOn") };
  } else if (section === "identifiers") {
    const types: IdentifierType[] = [];
    const count = Math.min(40, Number(fd.get("rows") ?? 0) || 0);
    for (let i = 0; i <= count; i++) {
      const label = String(fd.get(`label_${i}`) ?? "").trim().slice(0, 60);
      if (!label || on(fd, `remove_${i}`)) continue;
      const level = fd.get(`level_${i}`) === "highly" ? "highly" : "restricted";
      let key = String(fd.get(`key_${i}`) ?? "") || slug(label);
      if (["aadhaar", "apaar", "pen"].includes(key)) { errors[`label_${i}`] = `${label} is already kept on every student.`; continue; }
      while (types.some((t) => t.key === key)) key = `${key}-2`;
      types.push({ key, label, level });
    }
    change = { identifierTypes: types };
  } else if (section === "promotion") {
    const yearId = String(fd.get("academicYearId") ?? "");
    const pct = String(fd.get("minAttendancePct") ?? "").trim();
    const role = String(fd.get("exceptionApproverRole") ?? "").trim();
    if (!isId(yearId)) errors.academicYearId = "Choose the year.";
    if (pct && (!/^\d{1,3}$/.test(pct) || Number(pct) > 100)) errors.minAttendancePct = "Minimum attendance is a whole number from 0 to 100, or empty for none.";
    if (!/^[a-z0-9-]{2,40}$/.test(role)) errors.exceptionApproverRole = "Choose who approves exceptions.";
    policy = { yearId, passRequired: on(fd, "passRequired"), minAttendancePct: pct ? Number(pct) : null, feeDuesAllowed: on(fd, "feeDuesAllowed"), exceptionApproverRole: role };
  } else if (section === "leaving") {
    const reasons = lines(fd.get("leavingReasons"), 30);
    if (reasons.length === 0) errors.leavingReasons = "Add at least one reason.";
    if (!reasons.some((r) => r.toLowerCase() === "other")) reasons.push("Other");
    change = { leavingReasons: reasons, alumniOn: on(fd, "alumniOn") };
  } else if (section === "certificates") {
    const types = Object.keys(CERTIFICATE_LABEL) as CertificateType[];
    const approval = fd.getAll("approvalCertificates").map(String).filter((t) => types.includes(t as CertificateType) && t !== "TC");
    const sigs: Record<string, string> = {};
    for (const t of types) { const v = String(fd.get(`sig_${t}`) ?? ""); if (isId(v)) sigs[t] = v; }
    change = { approvalCertificates: approval, defaultSignatories: sigs, qrOn: on(fd, "qrOn"), migrationOn: on(fd, "migrationOn"), digiLockerOn: on(fd, "digiLockerOn") };
  } else if (section === "id-cards") {
    const fields = fd.getAll("idCardFields").map(String).filter((k) => ID_CARD_FIELDS.some((f) => f.key === k));
    const per = Number(fd.get("idCardsPerPage"));
    const until = String(fd.get("idCardValidUntil") ?? "");
    if (!Number.isInteger(per) || per < 1 || per > 8) errors.idCardsPerPage = "Cards per page must be 1 to 8 (8 fit on A4).";
    if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) errors.idCardValidUntil = "Valid until is not a real date.";
    change = { idCardFields: fields, idCardsPerPage: per, idCardValidUntil: until ? new Date(`${until}T00:00:00Z`) : null, rfidOn: on(fd, "rfidOn") };
  } else if (section === "behaviour") {
    const types: IncidentType[] = [];
    const count = Math.min(60, Number(fd.get("rows") ?? 0) || 0);
    for (let i = 0; i <= count; i++) {
      const label = String(fd.get(`label_${i}`) ?? "").trim().slice(0, 60);
      if (!label || on(fd, `remove_${i}`)) continue;
      const kind = String(fd.get(`kind_${i}`) ?? "incident") as BehaviourKind;
      const pts = String(fd.get(`points_${i}`) ?? "0").trim() || "0";
      if (!BEHAVIOUR_KINDS.includes(kind)) { errors[`kind_${i}`] = `Choose the kind for ${label}.`; continue; }
      if (!/^-?\d{1,3}$/.test(pts)) { errors[`points_${i}`] = `Points for ${label} must be a whole number, for example 2 or -2.`; continue; }
      let key = String(fd.get(`key_${i}`) ?? "") || slug(label);
      while (types.some((t) => t.key === key)) key = `${key}-2`;
      types.push({ key, label, kind, points: Number(pts) });
    }
    if (types.length === 0) errors.label_0 = "Keep at least one incident type.";
    const roles = fd.getAll("counsellingRoles").map(String).filter((r) => /^[a-z0-9-]{2,40}$/.test(r));
    change = { incidentTypes: types, pointsOn: on(fd, "pointsOn"), counsellingOn: on(fd, "counsellingOn"), counsellingRoles: roles.length ? roles : ["counsellor"], careerOn: on(fd, "careerOn") };
  } else {
    return { ok: false, message: "This part of Student Settings was not found." };
  }
  if (Object.keys(errors).length) return fail(errors, values);

  const r = await attemptForm(values, async () => {
    await withSchool(current.ctx, async (tx) => {
      if (policy) {
        const year = await tx.academicYear.findFirst({ where: { id: policy.yearId, archivedAt: null, ...(current.campusId ? { campusId: current.campusId } : {}) } });
        if (!year) throw new StudentProblem("Choose the year.", "academicYearId");
        if (year.status === "CLOSED") return void (values.closed = "1");
        const { yearId, ...p } = policy;
        await savePolicy(tx, current.ctx, yearId, p);
      } else {
        if (section === "certificates") {
          const ids = Object.values(change.defaultSignatories ?? {});
          const found = await tx.signatory.count({ where: { id: { in: ids }, archivedAt: null } });
          if (found !== new Set(ids).size) throw new StudentProblem("A chosen signatory was not found. Choose again.");
        }
        await saveStudentSettings(tx, current.ctx, change, section);
      }
    });
    if (values.closed) return { ok: false, message: "That year is closed. Its promotion policy stays as it was.", values };
  });
  if (!r?.ok) return r;
  revalidatePath(`${BASE}`, "layout");
  return { ok: true, message: policy ? "Saved as a new version of the promotion policy. Past promotions keep the rules they used." : "Saved." };
}
