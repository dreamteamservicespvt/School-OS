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

/**
 * Translations of the ready texts (owner decision 10, 15 November 2026). Each one starts as a
 * draft: it is shown only to school staff in Settings, never put into a school's consent form
 * and never shown to parents, until the owner reads it (docs/qa/consent-drafts.md) and its
 * status is changed to "approved" here.
 */
export const DRAFT_STATUS = "draft-needs-owner-approval" as const;
export type ReadyTranslationStatus = typeof DRAFT_STATUS | "approved";
export type ReadyTranslation = { title: string; text: string; status: ReadyTranslationStatus };
export const READY_LANGUAGES = ["hi", "te"] as const;
export type ReadyLanguage = (typeof READY_LANGUAGES)[number];
export type ReadyText = { title: string; en: string; translations: Partial<Record<ReadyLanguage, ReadyTranslation>> };

/** Ready texts the school starts from (inferred), with their Hindi and Telugu translations. */
export const READY_TEXTS: Record<string, ReadyText> = {
  "data-processing": {
    title: "Use of my child's data",
    en: "I agree that {school} may keep and use my child's details (name, date of birth, class, attendance, marks, fees, health notes I give, and my contact details) to run the school: admission, teaching, exams, fees, transport, safety and messages to me. The details are kept safely in India, are seen only by school staff who need them, and are never sold or used for advertising. I can ask to see, correct or remove them, and I can withdraw this consent at any time by telling the school office.",
    translations: {
      hi: {
        status: DRAFT_STATUS,
        title: "मेरे बच्चे की जानकारी का इस्तेमाल",
        text: "मेरी सहमति है कि {school} मेरे बच्चे की जानकारी (नाम, जन्म तिथि, कक्षा, हाज़िरी, अंक, फ़ीस, सेहत के बारे में मेरी दी हुई जानकारी, और मेरे संपर्क की जानकारी) स्कूल चलाने के लिए रख सकता है और इस्तेमाल कर सकता है: दाख़िला, पढ़ाई, परीक्षा, फ़ीस, ट्रांसपोर्ट, सुरक्षा और मुझे संदेश भेजना। यह जानकारी भारत में सुरक्षित रखी जाती है, इसे स्कूल के केवल वही कर्मचारी देखते हैं जिन्हें इसकी ज़रूरत है, और इसे न कभी बेचा जाता है, न विज्ञापन के लिए इस्तेमाल किया जाता है। मैं यह जानकारी देखने, ठीक करवाने या हटवाने के लिए कह सकता/सकती हूँ, और स्कूल ऑफ़िस को बताकर यह सहमति कभी भी वापस ले सकता/सकती हूँ।",
      },
      te: {
        status: DRAFT_STATUS,
        title: "నా పిల్లల వివరాల వాడకం",
        text: "నా పిల్లల వివరాలను (పేరు, పుట్టిన తేదీ, తరగతి, హాజరు, మార్కులు, ఫీజులు, నేను ఇచ్చే ఆరోగ్య వివరాలు, నా కాంటాక్ట్ వివరాలు) {school} ఉంచుకుని, స్కూల్ నడపడానికి వాడుకోవచ్చని నేను అంగీకరిస్తున్నాను: అడ్మిషన్, పాఠాలు, పరీక్షలు, ఫీజులు, ట్రాన్స్‌పోర్ట్, భద్రత, నాకు మెసేజ్‌లు పంపడం. ఈ వివరాలను భారతదేశంలో భద్రంగా ఉంచుతారు, అవసరమైన స్కూల్ సిబ్బంది మాత్రమే వాటిని చూస్తారు, వాటిని ఎప్పుడూ అమ్మరు, ప్రకటనల కోసం వాడరు. వాటిని చూపించమని, సరిచేయమని లేదా తీసివేయమని నేను అడగవచ్చు; స్కూల్ ఆఫీసుకు చెప్పి ఈ అంగీకారాన్ని ఎప్పుడైనా వెనక్కి తీసుకోవచ్చు.",
      },
    },
  },
  photo: {
    title: "Photos of my child",
    en: "I agree that {school} may show photos and videos in which my child appears in the school gallery, in notices to parents and on the school's social media pages. I can withdraw this consent at any time; after that my child's photos will not be shared.",
    translations: {
      hi: {
        status: DRAFT_STATUS,
        title: "मेरे बच्चे की फ़ोटो",
        text: "मेरी सहमति है कि {school} ऐसी फ़ोटो और वीडियो, जिनमें मेरा बच्चा दिखता है, स्कूल की गैलरी में, अभिभावकों को भेजे जाने वाले नोटिस में और स्कूल के सोशल मीडिया पेजों पर दिखा सकता है। मैं यह सहमति कभी भी वापस ले सकता/सकती हूँ; उसके बाद मेरे बच्चे की फ़ोटो शेयर नहीं की जाएँगी।",
      },
      te: {
        status: DRAFT_STATUS,
        title: "నా పిల్లల ఫోటోలు",
        text: "నా పిల్లలు కనిపించే ఫోటోలు, వీడియోలను {school} స్కూల్ గ్యాలరీలో, తల్లిదండ్రులకు పంపే నోటీసుల్లో, స్కూల్ సోషల్ మీడియా పేజీల్లో చూపించవచ్చని నేను అంగీకరిస్తున్నాను. ఈ అంగీకారాన్ని నేను ఎప్పుడైనా వెనక్కి తీసుకోవచ్చు; ఆ తర్వాత నా పిల్లల ఫోటోలను షేర్ చేయరు.",
      },
    },
  },
  apaar: {
    title: "APAAR ID",
    en: "As the parent or guardian of my child, who is a minor, I agree that {school} may create or link my child's APAAR ID (Automated Permanent Academic Account Registry) and share the details the government asks for, only for that purpose.",
    translations: {
      hi: {
        status: DRAFT_STATUS,
        title: "APAAR ID",
        text: "अपने नाबालिग बच्चे के माता-पिता या अभिभावक के रूप में, मेरी सहमति है कि {school} मेरे बच्चे की APAAR ID (Automated Permanent Academic Account Registry) बना या लिंक कर सकता है, और सरकार जो जानकारी माँगती है, वह केवल इसी काम के लिए साझा कर सकता है।",
      },
      te: {
        status: DRAFT_STATUS,
        title: "APAAR ID",
        text: "మైనర్ అయిన నా పిల్లల తల్లిదండ్రులు లేదా సంరక్షకులుగా, {school} నా పిల్లల APAAR ID (Automated Permanent Academic Account Registry) తయారు చేయడానికి లేదా లింక్ చేయడానికి, ప్రభుత్వం అడిగే వివరాలను ఆ పని కోసం మాత్రమే పంచుకోవడానికి నేను అంగీకరిస్తున్నాను.",
      },
    },
  },
  "message-opt-in": {
    title: "Messages on WhatsApp and SMS",
    en: "I agree to receive school messages about my child (attendance, fees, notices and results) on WhatsApp and SMS at the number I have given.",
    translations: {
      hi: {
        status: DRAFT_STATUS,
        title: "WhatsApp और SMS पर संदेश",
        text: "मेरी सहमति है कि मेरे दिए हुए नंबर पर मुझे WhatsApp और SMS से मेरे बच्चे के बारे में स्कूल के संदेश (हाज़िरी, फ़ीस, नोटिस और रिज़ल्ट) मिलें।",
      },
      te: {
        status: DRAFT_STATUS,
        title: "WhatsApp, SMS లో మెసేజ్‌లు",
        text: "నేను ఇచ్చిన నంబర్‌కు WhatsApp, SMS లో నా పిల్లల గురించి స్కూల్ మెసేజ్‌లు (హాజరు, ఫీజులు, నోటీసులు, ఫలితాలు) రావడానికి నేను అంగీకరిస్తున్నాను.",
      },
    },
  },
};

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/** True while the school's English text is the ready text word for word. */
export function isReadyEnglish(consentType: string, schoolEnglish: string | undefined) {
  const ready = READY_TEXTS[consentType]?.en;
  return Boolean(ready && schoolEnglish && flat(schoolEnglish) === flat(ready));
}

/** The owner-approved ready translation of a type in a language; null for a draft or none. */
export function approvedReadyTranslation(consentType: string, lang: string): { title: string; text: string } | null {
  const tr = READY_TEXTS[consentType]?.translations[lang as ReadyLanguage];
  return tr && tr.status === "approved" ? { title: tr.title, text: tr.text } : null;
}

/**
 * The approved translation to show a parent for a school's saved text, only while the school's
 * English is still the ready text word for word (a translation of the ready text would not
 * match wording the school changed). Null for every draft.
 */
export function approvedReadyWording(consentType: string, schoolEnglish: string | undefined, lang: string) {
  return isReadyEnglish(consentType, schoolEnglish) ? approvedReadyTranslation(consentType, lang) : null;
}

/** Ready translations still waiting for the owner's approval, for school staff to read in Settings. */
export function readyTranslationDrafts(consentType: string) {
  const ready = READY_TEXTS[consentType];
  if (!ready) return [];
  return READY_LANGUAGES.flatMap((lang) => {
    const tr = ready.translations[lang];
    return tr && tr.status === DRAFT_STATUS ? [{ lang, name: LANGUAGE_NAMES[lang], title: tr.title, text: tr.text }] : [];
  });
}

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
