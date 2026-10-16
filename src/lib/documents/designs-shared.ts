// Design choices shared by the server and the design editor in the browser:
// the ready designs, ID card sizes, the options a design holds and their
// defaults. Saving and loading designs is in ./designs.ts.

import { z } from "zod";
import type { DocType } from "./types";

export const BASES = [
  { key: "classic", label: "Classic", about: "Serif letters, a centred heading and a double border. Suits certificates." },
  { key: "modern", label: "Modern", about: "Clean letters, the heading on the left and a coloured band." },
  { key: "cbse", label: "Board format", about: "Formal, with the affiliation number and school code under the name, as boards expect." },
] as const;
export type BaseKey = (typeof BASES)[number]["key"];

export const CARD_SIZES = [
  { key: "cr80", label: "Credit card (86 × 54 mm)", w: 85.6, h: 54 },
  { key: "large", label: "Large (100 × 70 mm)", w: 100, h: 70 },
  { key: "mini", label: "Mini (70 × 45 mm)", w: 70, h: 45 },
] as const;

const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Colour must look like #1D4ED8.");
const uuid = z.string().uuid();

export const optionsSchema = z.object({
  title: z.string().trim().max(80, "Title can be at most 80 characters."),
  accent: z.union([hex, z.literal("")]),
  showLogo: z.boolean(),
  watermark: z.boolean(),
  headerNote: z.string().trim().max(160, "The line under the school name can be at most 160 characters."),
  fields: z.array(z.string().max(60)).max(30),
  body: z.string().max(4000, "The text can be at most 4,000 characters."),
  table: z.array(z.string().max(60)).max(40),
  footer: z.string().trim().max(300, "The footer can be at most 300 characters."),
  signatoryIds: z.array(uuid).max(3, "Choose at most 3 signatories."),
  paper: z.enum(["A4", "A5"]),
  showQr: z.boolean(),
  showBarcode: z.boolean(),
  card: z.object({
    size: z.enum(["cr80", "large", "mini"]),
    orientation: z.enum(["landscape", "portrait"]),
    background: hex,
    backgroundFileId: uuid.nullable(),
    perRow: z.number().int().min(1).max(5),
    validUntil: z.string().trim().max(40),
    showYear: z.boolean(),
  }),
});

export type DesignOptions = z.infer<typeof optionsSchema>;

/** The ready design's starting point for a document. */
export function defaultOptions(t: DocType, base: BaseKey = "classic"): DesignOptions {
  return {
    title: t.title,
    accent: "",
    showLogo: true,
    watermark: base === "classic" && t.family === "letter",
    headerNote: base === "cbse" ? "Affiliated to {{board}}, Affiliation No. {{affiliation_number}} · School code {{school_code}}" : "",
    fields: [...t.defaultFields],
    body: t.defaultBody ?? "",
    table: [...(t.defaultTable ?? [])],
    footer: t.family === "money" ? "This is a computer-made document." : "",
    signatoryIds: [],
    paper: t.defaultPaper,
    showQr: Boolean(t.codeField) && t.family !== "money",
    showBarcode: t.key === "library-card",
    card: { size: "cr80", orientation: t.key === "student-id-card" ? "portrait" : "landscape", background: "#FFFFFF", backgroundFileId: null, perRow: 2, validUntil: "", showYear: true },
  };
}

/** Fills anything missing in a saved design from the defaults, so old versions keep working after new options are added. */
export function withDefaults(t: DocType, base: string, saved: unknown): DesignOptions {
  const d = defaultOptions(t, (BASES.some((b) => b.key === base) ? base : "classic") as BaseKey);
  const s = (saved ?? {}) as Partial<DesignOptions>;
  const merged = { ...d, ...s, card: { ...d.card, ...(s.card ?? {}) } };
  const parsed = optionsSchema.safeParse(merged);
  return parsed.success ? parsed.data : d;
}

