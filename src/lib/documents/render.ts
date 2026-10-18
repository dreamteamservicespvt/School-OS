// Turns a document design and the record's merge fields into a printable HTML
// page. No outside requests: logo, photos, signatures, QR codes and barcodes
// are inline, so htmlToPdf can print it. Every value is escaped.

import { esc } from "../pdf";
import { formatDate, formatRupees } from "../format";
import { barcodeSvg } from "./barcode";
import { qrSvg } from "./qr";
import { rupeesInWords } from "./words";
import { CARD_SIZES, type DesignOptions } from "./designs-shared";
import { allFields, type DocType, type TableColumn } from "./types";

export type FieldValue = string | number | Date | null | undefined;

/** What a module passes to print one document. */
export type DocumentData = {
  /** Merge fields by key, e.g. { student_name: "Aarav Sharma", receipt_no: "SPS/2026/00123" }. */
  fields: Record<string, FieldValue>;
  /** Money lines: receipts, invoices and salary slips (kind is for salary slips). */
  lines?: { label: string; amountPaise: bigint | number; note?: string; kind?: "earning" | "deduction" }[];
  /** Rows of the exam or marks table (admit card, report card), keyed by the document's columns. */
  rows?: Record<string, FieldValue>[];
  /** Columns for this record's table instead of the document's own (e.g. one column per exam on a term report card). */
  columns?: TableColumn[];
  /** More tables after the main one, e.g. co-scholastic grades on a report card. */
  extraTables?: { title: string; columns: TableColumn[]; rows: Record<string, FieldValue>[] }[];
  /** Blank signature lines before the signatories, e.g. "Student" and "Class teacher" on an admit card. */
  signLines?: string[];
  /** Student or staff photo (a Stored File id). */
  photoFileId?: string | null;
  /** What the QR code holds, e.g. a link to check the certificate. Defaults to the document's number. */
  verifyText?: string | null;
  /** The campus, for its name and address on the document. */
  campusId?: string | null;
};

export type Branding = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  affiliationNumber: string | null;
  board: string | null;
  code: string;
  gstin: string | null;
  brandColor: string | null;
  campusName: string | null;
  campusAddress: string | null;
  academicYear: string | null;
  timeZone: string;
};

export type Assets = {
  logo: string | null;
  background: string | null;
  /** Stored File id to a data: URI. */
  images: Map<string, string>;
};

export type SignatoryView = { name: string; title: string; image: string | null };

export type RenderInput = {
  type: DocType;
  base: string;
  options: DesignOptions;
  branding: Branding;
  signatories: SignatoryView[];
  assets: Assets;
  records: DocumentData[];
};

const BASE_STYLE: Record<string, { font: string; accent: string; align: "center" | "left"; border: string }> = {
  classic: { font: 'Georgia, "Noto Serif", "Times New Roman", serif', accent: "#7A1F1F", align: "center", border: "double" },
  modern: { font: 'Arial, "Noto Sans", Helvetica, sans-serif', accent: "#1D4ED8", align: "left", border: "none" },
  cbse: { font: '"Times New Roman", "Noto Serif", serif', accent: "#1A365D", align: "center", border: "solid" },
};

function show(v: FieldValue, tz: string): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return formatDate(v, tz);
  return String(v);
}

/** The merge values for one record: school fields, then the record's own, then words made from gender. */
export function mergeValues(type: DocType, branding: Branding, data: DocumentData): Record<string, string> {
  const tz = branding.timeZone;
  const values: Record<string, string> = {
    school_name: branding.name,
    school_address: branding.address ?? "",
    school_phone: branding.phone ?? "",
    school_email: branding.email ?? "",
    school_website: branding.website ?? "",
    affiliation_number: branding.affiliationNumber ?? "",
    board: branding.board ?? "",
    school_code: branding.code,
    gstin: branding.gstin ?? "",
    campus_name: branding.campusName ?? "",
    academic_year: branding.academicYear ?? "",
    today: formatDate(new Date(), tz),
  };
  for (const [k, v] of Object.entries(data.fields)) values[k] = show(v, tz);
  const g = (values.gender ?? "").toLowerCase();
  const male = g.startsWith("m") || g === "boy";
  const female = g.startsWith("f") || g === "girl";
  values.son_daughter ||= male ? "son" : female ? "daughter" : "son/daughter";
  values.his_her ||= male ? "his" : female ? "her" : "his/her";
  values.he_she ||= male ? "he" : female ? "she" : "he/she";
  if (type.family === "money" && data.lines?.length && !values.net_pay_words) {
    values.amount_in_words = rupeesInWords(totals(type, data).net);
    values.net_pay_words = values.amount_in_words;
  }
  return values;
}

/** Fills {{merge_field}} markers with escaped values. A word at the start of a sentence gets a capital letter. */
export function mergeText(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (_m, key: string, offset: number, whole: string) => {
    let v = values[key] ?? "";
    const before = whole.slice(0, offset).trimEnd();
    if (v && (before === "" || /[.!?:\n]$/.test(before))) v = v.charAt(0).toUpperCase() + v.slice(1);
    return esc(v);
  });
}

function paragraphs(text: string) {
  return text.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

function totals(type: DocType, data: DocumentData) {
  const lines = data.lines ?? [];
  const sum = (ls: typeof lines) => ls.reduce((s, l) => s + Number(l.amountPaise), 0);
  if (type.key === "salary-slip") {
    const earnings = sum(lines.filter((l) => l.kind !== "deduction"));
    const deductions = sum(lines.filter((l) => l.kind === "deduction"));
    return { earnings, deductions, net: earnings - deductions };
  }
  const total = sum(lines);
  return { earnings: total, deductions: 0, net: total };
}

function labelOf(type: DocType, key: string) {
  return allFields(type).find((x) => x.key === key)?.label ?? key;
}

function header(input: RenderInput, values: Record<string, string>, compact = false) {
  const { branding, options, assets } = input;
  const style = BASE_STYLE[input.base] ?? BASE_STYLE.classic;
  const logo = options.showLogo && assets.logo ? `<img class="logo" src="${assets.logo}" alt="">` : "";
  const note = options.headerNote ? `<div class="note">${mergeText(options.headerNote, values)}</div>` : "";
  const lines = [branding.campusName && branding.campusAddress ? `${branding.campusName}, ${branding.campusAddress}` : branding.address, [branding.phone, branding.email, branding.website].filter(Boolean).join(" · ")].filter(Boolean);
  return `<header class="head ${style.align} ${compact ? "compact" : ""}">
    ${logo}
    <div class="who">
      <div class="school">${esc(branding.name)}</div>
      ${note}
      ${lines.map((l) => `<div class="addr">${esc(l)}</div>`).join("")}
    </div>
  </header>`;
}

function signatures(sigs: SignatoryView[]) {
  if (!sigs.length) return "";
  return `<div class="sigs">${sigs.map((s) => `<div class="sig">
      <div class="sigimg">${s.image ? `<img src="${s.image}" alt="">` : ""}</div>
      <div class="sigline">${esc(s.name)}</div><div class="sigtitle">${esc(s.title)}</div>
    </div>`).join("")}</div>`;
}

function codeBlock(input: RenderInput, values: Record<string, string>, data: DocumentData, size = "22mm") {
  const text = data.verifyText ?? (input.type.codeField ? values[input.type.codeField] : "");
  const out: string[] = [];
  if (input.options.showQr && text) out.push(`<div class="qr">${qrSvg(text, size)}</div>`);
  if (input.options.showBarcode && text) out.push(`<div class="bar">${barcodeSvg(text)}<div class="bartext">${esc(text)}</div></div>`);
  return out.join("");
}

/** A number or code with no spaces (admission number, phone, date): printed whole, never broken across lines. */
export const keptWhole = (v: string) => v.length <= 24 && !/\s/.test(v) && /\d/.test(v);

function infoGrid(input: RenderInput, values: Record<string, string>, keys: string[]) {
  const shown = keys.filter((k) => values[k]);
  if (!shown.length) return "";
  return `<dl class="info">${shown.map((k) => `<div${keptWhole(values[k]) ? ` class="whole"` : ""}><dt>${esc(labelOf(input.type, k))}</dt><dd>${esc(values[k])}</dd></div>`).join("")}</dl>`;
}

function moneyPage(input: RenderInput, data: DocumentData, values: Record<string, string>) {
  const { type, options } = input;
  const lines = data.lines ?? [];
  const t = totals(type, data);
  let table: string;
  if (type.key === "salary-slip") {
    const earn = lines.filter((l) => l.kind !== "deduction");
    const ded = lines.filter((l) => l.kind === "deduction");
    const rows = Math.max(earn.length, ded.length);
    table = `<table class="lines two"><thead><tr><th>Earnings</th><th class="r">Amount</th><th>Deductions</th><th class="r">Amount</th></tr></thead><tbody>
      ${Array.from({ length: rows }, (_, i) => `<tr><td>${esc(earn[i]?.label ?? "")}</td><td class="r">${earn[i] ? esc(formatRupees(earn[i].amountPaise)) : ""}</td><td>${esc(ded[i]?.label ?? "")}</td><td class="r">${ded[i] ? esc(formatRupees(ded[i].amountPaise)) : ""}</td></tr>`).join("")}
      <tr class="sum"><td>Gross pay</td><td class="r">${esc(formatRupees(t.earnings))}</td><td>Total deductions</td><td class="r">${esc(formatRupees(t.deductions))}</td></tr>
      </tbody></table>
      <div class="total"><span>Net pay</span><strong>${esc(formatRupees(t.net))}</strong></div>`;
  } else {
    const hasNote = lines.some((l) => l.note);
    table = `<table class="lines"><thead><tr><th class="n">#</th><th>Particulars</th>${hasNote ? "<th>Details</th>" : ""}<th class="r">Amount</th></tr></thead><tbody>
      ${lines.map((l, i) => `<tr><td class="n">${i + 1}</td><td>${esc(l.label)}</td>${hasNote ? `<td>${esc(l.note ?? "")}</td>` : ""}<td class="r">${esc(formatRupees(l.amountPaise))}</td></tr>`).join("")}
      </tbody></table>
      <div class="total"><span>${type.key === "fee-receipt" ? "Total received" : "Total"}</span><strong>${esc(formatRupees(t.net))}</strong></div>`;
  }
  return `${header(input, values)}
    <h1 class="title">${mergeText(options.title, values)}</h1>
    ${infoGrid(input, values, options.fields)}
    ${table}
    <p class="words">${esc(values.amount_in_words ?? "")}</p>
    ${options.body ? `<div class="body small">${paragraphs(mergeText(options.body, values))}</div>` : ""}
    <div class="endrow">${codeBlock(input, values, data, "18mm")}${signatures(input.signatories)}</div>
    ${options.footer ? `<footer class="foot">${mergeText(options.footer, values)}</footer>` : ""}`;
}

function letterPage(input: RenderInput, data: DocumentData, values: Record<string, string>) {
  const { type, options } = input;
  const numberKey = ["tc_no", "certificate_no", "letter_no"].find((k) => values[k]);
  const table = options.table.length
    ? `<table class="rows">${options.table.map((k, i) => `<tr><td class="n">${i + 1}.</td><td class="lbl">${esc(labelOf(type, k))}</td><td>${esc(values[k] ?? "")}</td></tr>`).join("")}</table>`
    : "";
  return `${header(input, values)}
    <div class="refline"><span>${numberKey ? `No. ${esc(values[numberKey])}` : ""}</span><span>Date: ${esc(values.today)}</span></div>
    ${options.title ? `<h1 class="title underline">${mergeText(options.title, values)}</h1>` : ""}
    <div class="body">${paragraphs(mergeText(options.body, values))}</div>
    ${table}
    <div class="endrow">${codeBlock(input, values, data)}${signatures(input.signatories)}</div>
    ${options.footer ? `<footer class="foot">${mergeText(options.footer, values)}</footer>` : ""}`;
}

function photoOf(input: RenderInput, data: DocumentData, values: Record<string, string>) {
  const src = data.photoFileId ? input.assets.images.get(data.photoFileId) : null;
  const name = values.student_name || values.staff_name || values.visitor_name || "";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return src ? `<img class="photo" src="${src}" alt="">` : `<div class="photo ph">${esc(initials)}</div>`;
}

function card(input: RenderInput, data: DocumentData, values: Record<string, string>) {
  const { options, type, branding, assets } = input;
  const name = values.student_name || values.staff_name || values.visitor_name || values.member_name || "";
  const bg = assets.background ? `background-image:url('${assets.background}');background-size:cover;` : "";
  const footer = [options.card.showYear && branding.academicYear ? `Year ${branding.academicYear}` : "", options.card.validUntil ? `Valid until ${esc(options.card.validUntil)}` : ""].filter(Boolean).join(" · ");
  return `<div class="card ${options.card.orientation}" style="background-color:${options.card.background};${bg}">
    <div class="cardhead">${options.showLogo && assets.logo ? `<img src="${assets.logo}" alt="">` : ""}<div><div class="cs">${esc(branding.name)}</div><div class="ct">${mergeText(options.title, values)}</div></div></div>
    <div class="cardbody">
      ${type.key === "library-card" ? "" : photoOf(input, data, values)}
      <div class="cardinfo">
        <div class="cname">${esc(name)}</div>
        ${options.fields.filter((k) => values[k]).map((k) => `<div class="cf"><span>${esc(labelOf(type, k))}</span> ${esc(values[k])}</div>`).join("")}
      </div>
      ${options.showQr ? codeBlock({ ...input, options: { ...options, showBarcode: false } }, values, data, "14mm") : ""}
    </div>
    ${options.showBarcode ? `<div class="cardbar">${codeBlock({ ...input, options: { ...options, showQr: false } }, values, data)}</div>` : ""}
    <div class="cardfoot">${esc([branding.phone, branding.website].filter(Boolean).join(" · "))}${footer ? `<span>${footer}</span>` : ""}</div>
  </div>`;
}

function tableHtml(cols: TableColumn[], rows: Record<string, FieldValue>[], tz: string) {
  const cls = (c: TableColumn) => (c.align === "right" ? "r" : c.align === "center" ? "c" : "");
  return `<table class="lines"><thead><tr>${cols.map((c) => `<th class="${cls(c)}">${esc(c.label)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${cls(c)}">${esc(show(r[c.key], tz))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function tablePage(input: RenderInput, data: DocumentData, values: Record<string, string>) {
  const { type, options } = input;
  const cols = data.columns ?? type.columns ?? [];
  const rows = data.rows ?? [];
  const tz = input.branding.timeZone;
  const extra = (data.extraTables ?? []).filter((t) => t.rows.length).map((t) => `<h2 class="sub">${esc(t.title)}</h2>${tableHtml(t.columns, t.rows, tz)}`).join("");
  const lines = (data.signLines ?? []).map((l) => `<div class="sig"><div class="sigimg"></div><div class="sigline">${esc(l)}</div></div>`).join("");
  const summary = type.family === "report"
    ? `<div class="chips">${["total_marks", "percentage", "overall_grade", "rank", "result", "attendance"].filter((k) => values[k] && !options.fields.includes(k)).map((k) => `<div><span>${esc(labelOf(type, k))}</span><strong>${esc(values[k])}</strong></div>`).join("")}</div>`
    : "";
  return `${header(input, values, true)}
    <h1 class="title">${mergeText(options.title, values)}</h1>
    <div class="withphoto">${infoGrid(input, values, options.fields)}${photoOf(input, data, values)}</div>
    ${tableHtml(cols, rows, tz)}
    ${summary}
    ${extra}
    ${options.body ? `<div class="body small">${paragraphs(mergeText(options.body, values))}</div>` : ""}
    <div class="endrow">${codeBlock(input, values, data, "18mm")}${lines ? `<div class="sigs">${lines}</div>` : ""}${signatures(input.signatories)}</div>
    ${options.footer ? `<footer class="foot">${mergeText(options.footer, values)}</footer>` : ""}`;
}

/** The page sizes htmlToPdf should print with. */
export function pageSize(input: Pick<RenderInput, "type" | "options">) {
  if (input.type.family === "card") return { format: "A4" as const, margin: "10mm" };
  return { format: input.options.paper, margin: input.options.paper === "A5" ? "8mm" : "12mm" };
}

export function renderHtml(input: RenderInput): string {
  const { type, options, branding, assets } = input;
  const style = BASE_STYLE[input.base] ?? BASE_STYLE.classic;
  const accent = options.accent || branding.brandColor || style.accent;
  const size = CARD_SIZES.find((s) => s.key === options.card.size) ?? CARD_SIZES[0];
  const [cw, ch] = options.card.orientation === "portrait" ? [size.h, size.w] : [size.w, size.h];
  const pages = type.family === "card"
    ? [`<div class="sheet" style="grid-template-columns:repeat(${options.card.perRow}, ${cw}mm)">${input.records.map((r) => card(input, r, mergeValues(type, branding, r))).join("")}</div>`]
    : input.records.map((r) => {
        const values = mergeValues(type, branding, r);
        const inner = type.family === "money" ? moneyPage(input, r, values) : type.family === "letter" ? letterPage(input, r, values) : tablePage(input, r, values);
        return `<section class="page">${options.watermark && assets.logo ? `<img class="wm" src="${assets.logo}" alt="">` : ""}${inner}</section>`;
      });

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(type.label)}</title><style>
    @page { size: ${type.family === "card" ? "A4" : options.paper}; }
    *{box-sizing:border-box} html,body{margin:0;padding:0}
    body{font-family:${style.font};color:#111;font-size:${options.paper === "A5" && type.family !== "card" ? "9.5pt" : "11pt"};line-height:1.45;--accent:${accent}}
    .page{position:relative;min-height:100%;padding:${style.border === "none" ? "0" : "6mm"};${style.border === "none" ? "" : `border:${style.border === "double" ? "4px double" : "1.5px solid"} var(--accent);`}page-break-after:always;break-after:page}
    .page:last-child{page-break-after:auto;break-after:auto}
    .wm{position:absolute;left:50%;top:50%;width:90mm;transform:translate(-50%,-50%);opacity:.07;pointer-events:none}
    .head{display:flex;align-items:center;gap:5mm;padding-bottom:3mm;margin-bottom:4mm;border-bottom:2px solid var(--accent)}
    .head.center{justify-content:center;text-align:center}
    .head.left{justify-content:flex-start;text-align:left;${input.base === "modern" ? "border-bottom:0;background:var(--accent);color:#fff;padding:4mm 5mm;border-radius:2mm" : ""}}
    .head .logo{height:${input.base === "modern" ? "16mm" : "20mm"};width:auto;max-width:30mm;object-fit:contain}
    .head.compact .logo{height:14mm}
    .school{font-size:${input.base === "modern" ? "17pt" : "19pt"};font-weight:700;letter-spacing:.2px;${input.base === "modern" ? "" : "color:var(--accent)"}}
    .note{font-size:9pt;font-weight:600}.addr{font-size:9pt;opacity:.85}
    .title{font-size:14pt;text-align:center;margin:3mm 0 4mm;letter-spacing:.5px;text-transform:uppercase;color:var(--accent)}
    .title.underline{text-decoration:underline;text-underline-offset:4px}
    .refline{display:flex;justify-content:space-between;font-size:10pt;margin-bottom:2mm}
    .body p{margin:0 0 3mm;text-align:justify}.body.small{font-size:9.5pt;margin-top:3mm}
    .info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.5mm 6mm;margin:0 0 4mm;padding:3mm 4mm;border:1px solid #ccc;border-radius:1.5mm;flex:1}
    .info div{display:flex;gap:2mm}.info dt{min-width:32mm;color:#555}.info dd{margin:0;font-weight:600;min-width:0;overflow-wrap:anywhere}
    .info div.whole{flex-wrap:wrap}.info div.whole dd{white-space:nowrap;overflow-wrap:normal}
    .withphoto{display:flex;gap:4mm;align-items:flex-start}
    table{width:100%;border-collapse:collapse}
    .lines th,.lines td{border:1px solid #bbb;padding:1.8mm 2.5mm;text-align:left;vertical-align:top}
    .lines th{background:color-mix(in srgb,var(--accent) 12%,#fff);font-weight:700}
    .lines .r{text-align:right}.lines .c{text-align:center}.lines .n{width:9mm;text-align:center}
    .lines tr.sum td{font-weight:700;background:#f6f6f6}
    .total{display:flex;justify-content:flex-end;gap:6mm;margin-top:2mm;font-size:12pt}.total strong{min-width:32mm;text-align:right}
    .words{font-style:italic;margin:2mm 0}
    .rows td{padding:1.6mm 2mm;border-bottom:1px dotted #999;vertical-align:top}.rows .n{width:8mm}.rows .lbl{width:62mm;color:#333}
    h2.sub{font-size:11pt;margin:4mm 0 1.5mm;color:var(--accent)}
    .chips{display:flex;flex-wrap:wrap;gap:3mm;margin:4mm 0}.chips div{border:1px solid #ccc;border-radius:1.5mm;padding:2mm 3mm}.chips span{display:block;font-size:8.5pt;color:#555}
    .endrow{display:flex;justify-content:space-between;align-items:flex-end;gap:6mm;margin-top:10mm;break-inside:avoid}
    .sigs{display:flex;gap:10mm;margin-left:auto}.sig{text-align:center;min-width:38mm}
    .sigimg{height:14mm;display:flex;align-items:flex-end;justify-content:center}.sigimg img{max-height:14mm;max-width:40mm}
    .sigline{border-top:1px solid #333;padding-top:1mm;font-weight:600}.sigtitle{font-size:9pt;color:#444}
    .qr svg{display:block}.bar{width:50mm}.bartext{font-size:8pt;text-align:center;letter-spacing:1px}
    .foot{margin-top:6mm;padding-top:2mm;border-top:1px solid #ccc;font-size:8.5pt;color:#555;text-align:center}
    .photo{width:24mm;height:30mm;object-fit:cover;border:1px solid #999;border-radius:1mm;flex:none}
    .photo.ph{display:flex;align-items:center;justify-content:center;background:#eef;font-weight:700;font-size:14pt;color:#556}
    .sheet{display:grid;gap:6mm;justify-content:center}
    .card{width:${cw}mm;height:${ch}mm;border:1px solid #999;border-radius:3mm;overflow:hidden;display:flex;flex-direction:column;font-family:${BASE_STYLE.modern.font};font-size:7pt;line-height:1.25;break-inside:avoid}
    .cardhead{display:flex;align-items:center;gap:2mm;background:var(--accent);color:#fff;padding:1.8mm 2.5mm}
    .cardhead img{height:7mm;width:auto;background:#fff;border-radius:1mm;padding:.4mm}.cs{font-weight:700;font-size:8pt}.ct{font-size:6.5pt;opacity:.9;text-transform:uppercase;letter-spacing:.4px}
    .cardbody{flex:1;display:flex;gap:2.5mm;padding:2mm 2.5mm;align-items:flex-start}
    .card.portrait .cardbody{flex-direction:column;align-items:center;text-align:center}
    .card .photo{width:18mm;height:22mm}.card.portrait .photo{width:22mm;height:27mm}
    .cardinfo{flex:1;min-width:0}.cname{font-weight:700;font-size:9pt;margin-bottom:.8mm;color:var(--accent)}
    .cf span{color:#555}.cardbar{padding:0 2.5mm}.cardbar .bar{width:100%}
    .cardfoot{display:flex;justify-content:space-between;gap:2mm;padding:1mm 2.5mm;border-top:1px solid var(--accent);font-size:6pt;color:#333}
  </style></head><body>${pages.join("")}</body></html>`;
}

/** Sample merge values and rows from the document type, for previews. */
export function sampleData(type: DocType): DocumentData {
  const fields: Record<string, string> = {};
  for (const x of type.fields) fields[x.key] = x.sample;
  return { fields, lines: type.sampleLines, rows: type.sampleRows };
}
