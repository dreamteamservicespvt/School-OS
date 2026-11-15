// WhatsApp cards (docs/design/whatsapp-messages.md): every WhatsApp template
// can be a small card with a HEADER (one emoji and a few words, or the fee
// receipt PDF as a document), the BODY (the template's own words), a FOOTER
// (the school's name, written in when the template is sent for approval,
// because a footer cannot hold a blank) and BUTTONS (a link to the parent's own
// Parent Link, receipt or invite, a fixed School OS page, or the school's
// phone). Quick-reply buttons are phase 2: a tap could not be received yet
// (the shared webhook), so there is no such button here.
//
// A link button reads the value of one blank, which sits alone on the LAST
// lines of the body ("{parent_link}"): that line is kept in Message History and
// in test mode, but it is not part of the words sent to WhatsApp, which carries
// the link as the button instead. So the messages that fill {parent_link} keep
// making each parent's link (src/lib/parent-link/blank.ts, message-links.ts).
//
// Plain functions with no database, so screens and tests can use them too.

/** The blanks in a text, in order (the same as variablesIn in ./blanks.ts, kept here so the two files do not import each other). */
function variablesIn(text: string): string[] {
  const seen: string[] = [];
  for (const m of text.matchAll(/\{([a-z_]+)\}/g)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

/** A document header is the fee receipt PDF; `text` is the header used when the PDF sample cannot be given to WhatsApp. */
export type CardHeader = { type: "text"; text: string } | { type: "document"; source: "receipt"; text?: string };
/** Where a link button goes: the parent's Parent Link (/p/…), a receipt (/r/…) or a staff invite (/invite/…). */
export type LinkTarget = "parent-link" | "receipt" | "invite";
export type CardButton =
  | { type: "URL"; text: string; target: LinkTarget; blank: string }
  | { type: "URL"; text: string; path: string }
  | { type: "PHONE"; text: string };

/** What was given to WhatsApp when the version was sent for approval; sending uses exactly these parts. */
export type SubmittedCard = { header: "text" | "document" | null; buttons: ({ type: "URL"; target: LinkTarget; blank: string } | { type: "URL"; path: string } | { type: "PHONE" })[] };

export type WhatsappCard = {
  header?: CardHeader | null;
  /** Fixed footer words; when absent the footer is made from the school's name at submission. */
  footer?: string | null;
  buttons?: CardButton[];
  /** Meta's category when it is not the usual one (birthday wishes are MARKETING). */
  category?: "MARKETING" | null;
  submitted?: SubmittedCard | null;
};

export const HEADER_MAX = 60;
export const FOOTER_MAX = 60;
export const BUTTON_MAX = 25;
const LINK_PREFIX: Record<LinkTarget, string> = { "parent-link": "p", receipt: "r", invite: "invite" };
export const linkPrefix = (t: LinkTarget) => LINK_PREFIX[t];

const isObj = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const TARGETS = new Set<string>(["parent-link", "receipt", "invite"]);

/** A card read from the database, or null. Anything not understood is left out. */
export function readCard(raw: unknown): WhatsappCard | null {
  if (!isObj(raw)) return null;
  const out: WhatsappCard = {};
  const h = raw.header;
  if (isObj(h) && h.type === "text" && typeof h.text === "string") out.header = { type: "text", text: h.text };
  else if (isObj(h) && h.type === "document" && h.source === "receipt") out.header = { type: "document", source: "receipt", ...(typeof h.text === "string" ? { text: h.text } : {}) };
  if (typeof raw.footer === "string") out.footer = raw.footer;
  if (Array.isArray(raw.buttons)) {
    out.buttons = raw.buttons.flatMap((b): CardButton[] => {
      if (!isObj(b) || typeof b.text !== "string") return [];
      if (b.type === "PHONE") return [{ type: "PHONE", text: b.text }];
      if (b.type === "URL" && typeof b.target === "string" && TARGETS.has(b.target) && typeof b.blank === "string") return [{ type: "URL", text: b.text, target: b.target as LinkTarget, blank: b.blank }];
      if (b.type === "URL" && typeof b.path === "string" && b.path.startsWith("/")) return [{ type: "URL", text: b.text, path: b.path }];
      return [];
    });
  }
  if (raw.category === "MARKETING") out.category = "MARKETING";
  const s = raw.submitted;
  if (isObj(s) && Array.isArray(s.buttons)) {
    out.submitted = {
      header: s.header === "text" || s.header === "document" ? s.header : null,
      buttons: s.buttons.flatMap((b): SubmittedCard["buttons"] => {
        if (!isObj(b)) return [];
        if (b.type === "PHONE") return [{ type: "PHONE" }];
        if (b.type === "URL" && typeof b.target === "string" && TARGETS.has(b.target) && typeof b.blank === "string") return [{ type: "URL", target: b.target as LinkTarget, blank: b.blank }];
        if (b.type === "URL" && typeof b.path === "string") return [{ type: "URL", path: b.path }];
        return [];
      }),
    };
  }
  return out;
}

/** The blanks that only carry a link button's value (their lines are not sent to WhatsApp as words). */
export function buttonBlanks(card: WhatsappCard | null): string[] {
  return (card?.buttons ?? []).flatMap((b) => (b.type === "URL" && "blank" in b ? [b.blank] : []));
}

/**
 * The words WhatsApp is given: the body without its last lines that hold only
 * a link button's blank. A button whose blank is not on such a line (the school
 * took it out) has nothing to carry, so it is left out (effectiveButtons).
 */
export function cardBody(body: string, card: WhatsappCard | null): string {
  const blanks = new Set(buttonBlanks(card));
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  while (lines.length && (lines[lines.length - 1].trim() === "" || blanks.has(soleBlank(lines[lines.length - 1]) ?? ""))) lines.pop();
  return lines.join("\n").trimEnd();
}

const soleBlank = (line: string) => /^\s*\{([a-z_]+)\}\s*$/.exec(line)?.[1] ?? null;

/** The link buttons that really carry a value: their blank sits alone on one of the body's last lines. */
export function effectiveButtons(body: string, card: WhatsappCard | null): CardButton[] {
  const kept = new Set(variablesIn(cardBody(body, card)));
  const tail = new Set(variablesIn(body).filter((v) => !kept.has(v)));
  return (card?.buttons ?? []).filter((b) => !(b.type === "URL" && "blank" in b) || tail.has(b.blank));
}

/** "Chaitanya School · School OS", or "Sent via School OS" when the name is too long. Never a brace (a footer cannot hold a blank). */
export function footerFor(schoolName: string): string {
  const name = schoolName.replace(/[{}*_~`]/g, "").replace(/\s+/g, " ").trim();
  const full = `${name} · School OS`;
  return name && [...full].length <= FOOTER_MAX ? full : "Sent via School OS";
}

const EMOJI = /\p{Extended_Pictographic}/u;
/** Button words: letters (any script), numbers and spaces only (Meta: "alphanumeric", no emoji). */
const BUTTON_WORDS = /^[\p{L}\p{M}\p{N} ‌‍]+$/u;

/** Why WhatsApp (Meta) would refuse a card's header, footer or buttons, in plain words; empty when it would take them. */
export function cardProblems(card: WhatsappCard | null): string[] {
  if (!card) return [];
  const out: string[] = [];
  if (card.header?.text != null) {
    const t = card.header.text;
    if (!t.trim()) out.push("Write the header, or take it out.");
    if ([...t].length > HEADER_MAX) out.push(`The header can have at most ${HEADER_MAX} characters.`);
    if (/[*_~`]/.test(t)) out.push("The header cannot use * _ ~ or ` (WhatsApp already shows it bold).");
    if (/[{}]/.test(t)) out.push("The header cannot hold a blank.");
    if (/\n/.test(t)) out.push("The header must be one line.");
  }
  if (card.footer != null) {
    if ([...card.footer].length > FOOTER_MAX) out.push(`The footer can have at most ${FOOTER_MAX} characters.`);
    if (/[{}]/.test(card.footer)) out.push("The footer cannot hold a blank.");
  }
  const buttons = card.buttons ?? [];
  if (buttons.length > 10) out.push("At most 10 buttons.");
  if (buttons.filter((b) => b.type === "URL").length > 2) out.push("At most 2 link buttons.");
  if (buttons.filter((b) => b.type === "PHONE").length > 1) out.push("At most 1 phone button.");
  for (const b of buttons) {
    if (!b.text.trim()) out.push("Every button needs words.");
    else if ([...b.text].length > BUTTON_MAX) out.push(`The button "${b.text}" can have at most ${BUTTON_MAX} characters.`);
    if (EMOJI.test(b.text)) out.push(`The button "${b.text}" cannot have an emoji.`);
    else if (b.text.trim() && !BUTTON_WORDS.test(b.text)) out.push(`The button "${b.text}" can have only letters, numbers and spaces.`);
  }
  return out;
}

/**
 * Two blanks with only spaces, bold marks or emoji between them ("*{a}*\n👤
 * *{b}*"): Meta counts them as next to each other. A word (or a comma or
 * bracket, which Meta took live: "Dear {{1}}, {{2}} of {{3}}") must sit between.
 */
export function gluedBlanks(text: string): string | null {
  const m = text.match(/\{[a-z_]+\}(?:[\s*_~`‍️]|\p{S}|\p{Extended_Pictographic})*\{[a-z_]+\}/u);
  return m ? m[0] : null;
}

/**
 * Sample values that look real, for WhatsApp's reviewers (they judge the
 * category partly from the samples), never "sample guardian name".
 */
export const META_SAMPLES: Record<string, string> = {
  guardian_name: "Venkatesh", student_name: "Sri Lakshmi", class: "Class 1 A", admission_no: "CHS/2026/00123",
  staff_name: "Aswini", visitor_name: "Ramesh", school_name: "Chaitanya School", school_phone: "9876500001",
  date: "18-11-2026", due_amount: "₹2,500", due_date: "25-11-2026", receipt_number: "CHS/2026/00456",
  paid_amount: "₹2,500", payment_date: "18-11-2026", payment_mode: "UPI", balance_due: "₹7,500",
  exam_name: "Half Yearly Exam", title: "Diwali holidays", ticket_number: "Q-00012",
  message: "School will close at 12:30 PM today.", code: "482913", month: "October 2026",
  bus: "Bus 4", route: "2", stop: "KPHB 6th Phase", time: "7:43 AM", minutes: "5", place: "KPHB 6th Phase",
  how_to_pay: "Pay online on your Parent Link.", link: "your Parent Link", parent_link: "your Parent Link", receipt_link: "your receipt",
};
export const metaSample = (key: string) => META_SAMPLES[key] ?? key.replace(/_/g, " ");

/** A sample end of a link button's address, the shape the real one has. */
export const SAMPLE_TOKEN: Record<LinkTarget, string> = {
  "parent-link": "Xk3dP0aQ7vLm2Rt9Ws4Yb6Nc8Ze1Hf5Jg0Ku3Mi7Ov",
  receipt: `${"0".repeat(64)}SampleReceiptKey123456`,
  invite: "Pq7Ls2Dk9Wm4Rt6Yb1Nc3Ze8Hf5Jg0Ku7Mi2Ov4Xa",
};

export type SubmissionOptions = {
  appUrl: string;
  schoolName: string;
  /** The school's 10-digit phone, for the "Call school" button; without one the button is left out. */
  schoolPhone: string | null;
  /** Parent Link is switched on for the school: without it a Parent Link button would open nothing, so it is left out. */
  parentLinkOn: boolean;
  /** WhatsApp's handle of the sample receipt PDF (Resumable Upload). Without it the receipt header goes as its text header. */
  documentHandle?: string | null;
};

const PHONE = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
};

/**
 * The components WhatsApp is asked to approve for a card: header, body with
 * its blanks as {{1}}, {{2}}… and realistic samples, footer and buttons in
 * order; plus what was submitted, saved with the version so each message is
 * sent with the same parts and button positions.
 */
export function cardSubmission(body: string, card: WhatsappCard, o: SubmissionOptions): { components: Record<string, unknown>[]; submitted: SubmittedCard } {
  const words = cardBody(body, card);
  const variables = variablesIn(words);
  let text = words;
  variables.forEach((v, i) => { text = text.split(`{${v}}`).join(`{{${i + 1}}}`); });
  const components: Record<string, unknown>[] = [];
  let header: SubmittedCard["header"] = null;
  if (card.header?.type === "text") {
    components.push({ type: "HEADER", format: "TEXT", text: card.header.text });
    header = "text";
  } else if (card.header?.type === "document") {
    if (o.documentHandle) {
      components.push({ type: "HEADER", format: "DOCUMENT", example: { header_handle: [o.documentHandle] } });
      header = "document";
    } else if (card.header.text) {
      components.push({ type: "HEADER", format: "TEXT", text: card.header.text });
      header = "text";
    }
  }
  components.push({ type: "BODY", text, ...(variables.length ? { example: { body_text: [variables.map(metaSample)] } } : {}) });
  components.push({ type: "FOOTER", text: card.footer ?? footerFor(o.schoolName) });
  const buttons: Record<string, unknown>[] = [];
  const submitted: SubmittedCard["buttons"] = [];
  const phone = PHONE(o.schoolPhone);
  for (const b of effectiveButtons(body, card)) {
    if (b.type === "PHONE") {
      if (!phone) continue;
      buttons.push({ type: "PHONE_NUMBER", text: b.text, phone_number: phone });
      submitted.push({ type: "PHONE" });
    } else if ("target" in b) {
      if (b.target === "parent-link" && !o.parentLinkOn) continue;
      const base = `${o.appUrl}/${linkPrefix(b.target)}/`;
      buttons.push({ type: "URL", text: b.text, url: `${base}{{1}}`, example: [`${base}${SAMPLE_TOKEN[b.target]}`] });
      submitted.push({ type: "URL", target: b.target, blank: b.blank });
    } else {
      buttons.push({ type: "URL", text: b.text, url: `${o.appUrl}${b.path}` });
      submitted.push({ type: "URL", path: b.path });
    }
  }
  if (buttons.length) components.push({ type: "BUTTONS", buttons });
  return { components, submitted: { header, buttons: submitted } };
}

/** A tiny real PDF, the sample WhatsApp asks for when a template has a document header. */
export function samplePdf(): Buffer {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = "BT /F1 18 Tf 40 540 Td (Fee receipt - sample) Tj 0 -30 Td /F1 12 Tf (Chaitanya School, CHS/2026/00456, Rs 2,500) Tj ET";
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
