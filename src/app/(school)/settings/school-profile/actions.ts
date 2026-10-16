"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { flash } from "@/lib/flash";
import { formValues, optionalDate, optionalText, parseForm, text, type FormState } from "@/lib/forms";
import { formatDate } from "@/lib/format";
import {
  addCampus, archiveCampus, editCampus, makeMainCampus, removeLogo, restoreCampus, saveBoard, saveCompliance, saveDetails, saveLogo, saveRegion,
  BOARDS, HEX, checkGstin, boardDefaultsWords,
} from "@/lib/settings/school-profile";
import { editDocument, setDocumentArchived, setVerified, shareDocument, uploadDocument, uploadVersion } from "@/lib/settings/vault";
import { asFormState, runSettings } from "../run";

const PAGE = "school-profile" as const;

const PATH = "/settings/school-profile";

const phone = z.string().trim().transform((v) => v.replace(/[^\d+]/g, "")).refine((v) => {
  const d = v.replace(/^\+?91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
  return /^\d{10}$/.test(d);
}, { message: "Phone number must have 10 digits, like 9876543210 or 040 2345 6789." }).transform((v) => v.replace(/^\+?91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, ""));

const detailsSchema = z.object({
  name: text("School name", 150),
  address: text("Address", 500),
  phone,
  email: z.string().trim().min(1, "Email is needed.").refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Email does not look right. It should be like office@school.edu.in.").transform((v) => v.toLowerCase()),
  website: optionalText("Website address", 200).refine((v) => v === null || /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v.replace(/^https?:\/\//i, "")), "Website address should be like www.sunriseschool.edu.in."),
  affiliationNumber: optionalText("Affiliation number", 60),
  gstin: optionalText("GSTIN", 20).transform((v) => (v ? v.toUpperCase().replace(/\s+/g, "") : null)).superRefine((v, c) => {
    const p = v ? checkGstin(v) : null;
    if (p) c.addIssue({ code: "custom", message: p });
  }),
  brandColor: z.string().trim().refine((v) => v === "" || HEX.test(v), "Pick a colour, or type it like #1d4ed8.").transform((v) => (v ? v.toLowerCase() : null)),
});

export async function saveDetailsAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(detailsSchema, fd);
  if (!parsed.ok) return parsed.state;
  const r = await runSettings(PAGE, "edit", (tx, current) => saveDetails(tx, current.ctx, parsed.data));
  if (r.ok) revalidatePath("/", "layout");
  return asFormState(r, formValues(fd), r.ok && r.data ? "School details saved." : "Nothing changed.");
}

export async function saveLogoAction(_: FormState, fd: FormData): Promise<FormState> {
  const file = fd.get("logo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a PNG or JPG file for the logo.", errors: { logo: "Choose a PNG or JPG file for the logo." } };
  const r = await runSettings(PAGE, "edit", (tx, current) => saveLogo(tx, current.ctx, file));
  revalidatePath(PATH);
  if (!r.ok) return { ok: false, message: r.message, errors: { logo: r.message } };
  return { ok: true, message: "Logo saved. It now shows on screens, receipts and certificates." };
}

export async function removeLogoAction(): Promise<string | void> {
  const r = await runSettings(PAGE, "edit", (tx, current) => removeLogo(tx, current.ctx));
  if (!r.ok) return r.message;
  await flash({ message: "Logo removed. Upload a new one any time." });
  revalidatePath(PATH);
}

const boardSchema = z.object({
  board: z.string().refine((v) => BOARDS.some((b) => b.value === v), "Choose the board."),
  twoBoards: z.string().optional(),
  secondBoard: z.string().optional(),
});

export async function saveBoardAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(boardSchema, fd);
  if (!parsed.ok) return parsed.state;
  const second = parsed.data.twoBoards === "on" ? parsed.data.secondBoard || null : null;
  if (parsed.data.twoBoards === "on" && !second) return { ok: false, message: "Choose the second board.", errors: { secondBoard: "Choose the second board." }, values: formValues(fd) };
  const r = await runSettings(PAGE, "edit", (tx, current) => saveBoard(tx, current.ctx, { board: parsed.data.board, secondBoard: second }));
  return asFormState(r, formValues(fd), r.ok && r.data ? `Board saved. ${boardDefaultsWords(parsed.data.board)} The modules offer these; each can still be changed there.` : "Nothing changed.");
}

export async function saveRegionAction(_: FormState, fd: FormData): Promise<FormState> {
  const languages = fd.getAll("languages").map(String);
  const defaultLanguage = String(fd.get("defaultLanguage") ?? "");
  const timeZone = String(fd.get("timeZone") ?? "");
  const r = await runSettings(PAGE, "edit", (tx, current) => saveRegion(tx, current.ctx, { languages, defaultLanguage, timeZone }));
  if (r.ok) revalidatePath("/", "layout");
  return asFormState(r, formValues(fd), r.ok && r.data ? "Language and region saved." : "Nothing changed.");
}

const complianceSchema = z.object({
  udiseCode: optionalText("UDISE+ code", 20).refine((v) => v === null || /^\d{11}$/.test(v), "UDISE+ code has 11 digits."),
  boardSchoolCode: optionalText("Board school code", 30),
  registrationNumber: optionalText("Registration number", 60),
  panNumber: optionalText("PAN", 10).transform((v) => (v ? v.toUpperCase() : null)).refine((v) => v === null || /^[A-Z]{5}\d{4}[A-Z]$/.test(v), "PAN should be like ABCDE1234F."),
});

export async function saveComplianceAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(complianceSchema, fd);
  if (!parsed.ok) return parsed.state;
  const r = await runSettings(PAGE, "edit", (tx, current) => saveCompliance(tx, current.ctx, parsed.data));
  return asFormState(r, formValues(fd), r.ok && r.data ? "Board compliance details saved." : "Nothing changed.");
}

// ---------------------------------------------------------------- Campuses

const campusSchema = z.object({
  id: z.string().optional(),
  name: text("Campus name", 100),
  address: optionalText("Address", 500),
  phone: z.string().trim().transform((v) => v.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "")).refine((v) => v === "" || v.length === 10, "Phone number must have 10 digits.").transform((v) => v || null),
  headName: optionalText("Campus head", 100),
});

export async function saveCampusAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(campusSchema, fd);
  if (!parsed.ok) return parsed.state;
  const { id, ...input } = parsed.data;
  const r = await runSettings(PAGE, id ? "edit" : "create", async (tx, current) => (id ? editCampus(tx, current.ctx, id, input) : addCampus(tx, current.ctx, input)));
  if (r.ok) {
    await flash({ message: id ? `${input.name} saved.` : `${input.name} added.` });
    revalidatePath(PATH);
  }
  return asFormState(r, formValues(fd), "Saved.");
}

export async function campusAction(id: string, what: "main" | "archive" | "restore"): Promise<string | void> {
  const r = await runSettings(PAGE, what === "archive" ? "archive" : "edit", async (tx, current) => {
    if (what === "main") return makeMainCampus(tx, current.ctx, id).then(() => null);
    if (what === "archive") return archiveCampus(tx, current.ctx, id);
    return restoreCampus(tx, current.ctx, id);
  });
  if (!r.ok) return r.message;
  await flash({ message: what === "main" ? "Main campus changed." : what === "archive" ? `${r.data?.name} archived. Its records stay and it can be restored.` : `${r.data?.name} restored.` });
  revalidatePath(PATH);
}

// ---------------------------------------------------------------- Documents

const docSchema = z.object({
  id: z.string().optional(),
  docType: z.string().min(1, "Choose the document type."),
  title: text("Title", 150),
  issuedOn: optionalDate("Issue date"),
  expiresOn: optionalDate("Expiry date"),
});

export async function saveDocumentAction(_: FormState, fd: FormData): Promise<FormState> {
  const visibleTo = fd.getAll("visibleTo").map(String);
  const typed = { ...formValues(fd), visibleTo: visibleTo.join(",") };
  const parsed = parseForm(docSchema, fd);
  if (!parsed.ok) return { ...parsed.state, values: typed };
  const { id, ...rest } = parsed.data;
  const file = fd.get("file");
  if (!id && (!(file instanceof File) || file.size === 0)) return { ok: false, message: "Choose the file to upload.", errors: { file: "Choose the file to upload." }, values: typed };
  const r = await runSettings(PAGE, id ? "edit" : "create", async (tx, current) => {
    const keys = current.roles.map((x) => x.key);
    if (id) return editDocument(tx, current.ctx, keys, id, { ...rest, visibleTo });
    return uploadDocument(tx, current.ctx, { ...rest, visibleTo, file: file as File });
  });
  if (r.ok) {
    await flash({ message: id ? `${rest.title} saved.` : `${rest.title} uploaded.${rest.expiresOn ? ` You will be reminded 30 days before it expires on ${formatDate(rest.expiresOn)}.` : ""}` });
    revalidatePath(PATH);
  }
  return asFormState(r, typed, "Saved.");
}

export async function uploadVersionAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ id: z.string().min(1), issuedOn: optionalDate("Issue date"), expiresOn: optionalDate("Expiry date") }), fd);
  if (!parsed.ok) return parsed.state;
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose the file to upload.", errors: { file: "Choose the file to upload." }, values: formValues(fd) };
  const r = await runSettings(PAGE, "edit", (tx, current) => uploadVersion(tx, current.ctx, current.roles.map((x) => x.key), parsed.data.id, { file, issuedOn: parsed.data.issuedOn, expiresOn: parsed.data.expiresOn }));
  if (r.ok) {
    await flash({ message: `Version ${r.data} uploaded. The older versions are kept. Mark it verified once checked.` });
    revalidatePath(PATH);
  }
  return asFormState(r, formValues(fd), "Uploaded.");
}

export async function documentAction(id: string, what: "verify" | "unverify" | "archive" | "restore"): Promise<string | void> {
  const r = await runSettings(PAGE, what === "archive" ? "archive" : "edit", async (tx, current) => {
    const keys = current.roles.map((x) => x.key);
    if (what === "verify" || what === "unverify") return setVerified(tx, current.ctx, keys, id, what === "verify").then(() => null);
    return setDocumentArchived(tx, current.ctx, keys, id, what === "archive");
  });
  if (!r.ok) return r.message;
  const words = { verify: "Marked verified.", unverify: "Marked not verified.", archive: `${r.data?.title} archived. Its files are kept and it can be restored.`, restore: `${r.data?.title} restored.` };
  await flash({ message: words[what] });
  revalidatePath(PATH);
}

export type ShareState = { ok: boolean; message: string; link?: string; until?: string } | null;

export async function shareDocumentAction(_: ShareState, fd: FormData): Promise<ShareState> {
  const id = String(fd.get("id") ?? "");
  const days = Number(fd.get("days") ?? 7);
  const r = await runSettings(PAGE, "view", (tx, current) => shareDocument(tx, current.ctx, current.roles.map((x) => x.key), id, days));
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, message: `This link works until ${formatDate(r.data.expires, r.current.school.timeZone)}. Anyone with the link can open the document, so share it only with the right people.`, link: r.data.link, until: r.data.expires.toISOString() };
}
