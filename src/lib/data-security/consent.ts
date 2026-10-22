// Consent texts (decided 9 October 2026, D8a): each consent type has its
// current wording and every earlier version. A change makes a new version;
// a Consent Record keeps the version the guardian agreed to, so past records
// never change (04-data-model.md rule 33).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";

export const CONSENT_TYPES = [
  { key: "data-processing", label: "Use of the child's data (DPDP Act 2023)", askedDefault: true },
  { key: "photo", label: "Photos in the gallery and on social media", askedDefault: true },
  { key: "apaar", label: "APAAR ID", askedDefault: false },
  { key: "message-opt-in", label: "Messages on WhatsApp and SMS", askedDefault: false },
] as const;

export const LANGUAGE_NAMES: Record<string, string> = { en: "English", hi: "Hindi", te: "Telugu", ta: "Tamil", kn: "Kannada", ml: "Malayalam", mr: "Marathi", bn: "Bengali" };

/** Ready texts the school starts from (inferred). */
export const READY_TEXTS: Record<string, { title: string; en: string }> = {
  "data-processing": {
    title: "Use of my child's data",
    en: "I agree that {school} may keep and use my child's details (name, date of birth, class, attendance, marks, fees, health notes I give, and my contact details) to run the school: admission, teaching, exams, fees, transport, safety and messages to me. The details are kept safely in India, are seen only by school staff who need them, and are never sold or used for advertising. I can ask to see, correct or remove them, and I can withdraw this consent at any time by telling the school office.",
  },
  photo: {
    title: "Photos of my child",
    en: "I agree that {school} may show photos and videos in which my child appears in the school gallery, in notices to parents and on the school's social media pages. I can withdraw this consent at any time; after that my child's photos will not be shared.",
  },
  apaar: {
    title: "APAAR ID",
    en: "As the parent or guardian of my child, who is a minor, I agree that {school} may create or link my child's APAAR ID (Automated Permanent Academic Account Registry) and share the details the government asks for, only for that purpose.",
  },
  "message-opt-in": {
    title: "Messages on WhatsApp and SMS",
    en: "I agree to receive school messages about my child (attendance, fees, notices and results) on WhatsApp and SMS at the number I have given.",
  },
};

export class ConsentProblem extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
  }
}

export function consentLabel(key: string) {
  return CONSENT_TYPES.find((c) => c.key === key)?.label ?? key.replace(/^custom-/, "").replace(/-/g, " ");
}

/** Every consent type with its current text and earlier versions, newest first. */
export async function consentTexts(tx: Tx) {
  const rows = await tx.consentText.findMany({ orderBy: [{ consentType: "asc" }, { version: "desc" }] });
  const custom = [...new Set(rows.map((r) => r.consentType))].filter((k) => !CONSENT_TYPES.some((c) => c.key === k));
  return [...CONSENT_TYPES.map((c) => c.key as string), ...custom].map((key) => {
    const versions = rows.filter((r) => r.consentType === key);
    return { key, label: consentLabel(key), current: versions.find((v) => v.isCurrent) ?? null, versions };
  });
}

export type ConsentInput = { consentType: string; title: string; text: Record<string, string>; askedOnAdmission: boolean };

/**
 * Saves a new version of a consent text. The previous version stays as it
 * was; records already given keep pointing at it. Nothing is ever edited.
 */
export async function saveConsentText(tx: Tx, ctx: SchoolContext, input: ConsentInput, languages: string[]) {
  let type = input.consentType.trim();
  if (!type) throw new ConsentProblem("Choose a consent type.", "consentType");
  if (type.startsWith("new:")) {
    const name = type.slice(4).trim();
    if (name.length < 3) throw new ConsentProblem("Name the new consent type in a few words.", "newType");
    type = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}`;
  }
  const title = input.title.trim();
  if (!title) throw new ConsentProblem("Title is needed.", "title");
  if (title.length > 120) throw new ConsentProblem("Title can be at most 120 characters.", "title");
  const text: Record<string, string> = {};
  for (const lang of languages) {
    const t = (input.text[lang] ?? "").trim();
    if (t.length > 5000) throw new ConsentProblem(`The ${LANGUAGE_NAMES[lang] ?? lang} text can be at most 5,000 characters.`, `text_${lang}`);
    if (t) text[lang] = t;
  }
  const first = languages[0] ?? "en";
  if (!text[first] || text[first].length < 30) throw new ConsentProblem(`Write the consent in ${LANGUAGE_NAMES[first] ?? first}, in at least one full sentence.`, `text_${first}`);

  const current = await tx.consentText.findFirst({ where: { consentType: type, isCurrent: true } });
  if (current && JSON.stringify(current.text) === JSON.stringify(text) && current.title === title && current.askedOnAdmission === input.askedOnAdmission) {
    throw new ConsentProblem("Nothing changed, so no new version was made.");
  }
  const last = await tx.consentText.findFirst({ where: { consentType: type }, orderBy: { version: "desc" }, select: { version: true } });
  await tx.consentText.updateMany({ where: { consentType: type, isCurrent: true }, data: { isCurrent: false } });
  const row = await tx.consentText.create({
    data: { schoolId: ctx.schoolId, consentType: type, title, version: (last?.version ?? 0) + 1, text: text as Prisma.InputJsonValue, askedOnAdmission: input.askedOnAdmission, isCurrent: true, createdById: ctx.userId },
  });
  await writeAudit(tx, ctx, {
    action: "consent-text-saved",
    recordType: "Consent Text",
    recordId: row.id,
    before: current ? { version: current.version, title: current.title, text: current.text as Prisma.InputJsonValue } : null,
    after: { consentType: type, version: row.version, title, text: text as Prisma.InputJsonValue, askedOnAdmission: input.askedOnAdmission },
  });
  return row;
}
