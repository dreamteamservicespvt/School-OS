// DREAM TEAM's own WhatsApp connection for console messages: School Admin
// invites and resets, one-time codes, team invites, invoices and notices.
// The Owner connects it in the console's WhatsApp settings; the access token is
// kept encrypted (src/lib/crypto.ts, 08-platform-security.md §3) and never shown
// again. The CONSOLE_WHATSAPP_* environment settings still work when nothing is
// saved here.
//
// WhatsApp lets a business start a chat only with an approved template, so each
// purpose has one. The Owner sends them to Meta for approval from the same page;
// until a purpose's template is approved, its message goes as plain text, which
// WhatsApp accepts only within 24 hours of the person's last message.
import "server-only";

import type { ConsoleProvider, Prisma } from "@prisma/client";
import { withConsole } from "../db";
import { decryptField, encryptField, maskLast4 } from "../crypto";
import { GRAPH, whatsappProvider, whatsappTemplateStatus } from "../messaging/providers/whatsapp";
import { logActivity, maskMobile, tenDigits, type ConsoleActor } from "./activity";
import { ConsoleProblem } from "./schools";

export type ConsolePurposeKey = "invite" | "reset" | "code" | "team-invite" | "invoice" | "notice";

type TemplateSpec = {
  purpose: ConsolePurposeKey;
  label: string;
  name: string;
  category: "UTILITY" | "AUTHENTICATION";
  /** Body with {{1}}, {{2}}... in the order the console fills them. Empty for a code template (Meta writes it). */
  body: string;
  example: string[];
};

/** One approved template per purpose. The blanks match the templateParams each sender passes. */
export const CONSOLE_TEMPLATES: TemplateSpec[] = [
  {
    purpose: "invite",
    label: "School Admin invite",
    name: "schoolos_admin_invite",
    category: "UTILITY",
    body: "Welcome to School OS, {{1}}.\n{{2}}, your School OS login is ready.\nTap to set your password: {{3}}\nYour username is your mobile number: {{4}}.\nThe link works for 3 days. Need help? Call DREAM TEAM support.",
    example: ["Sunrise Public School", "Anita Sharma", "https://school-os-beta.vercel.app/i/abc123", "98xxxxx102"],
  },
  {
    purpose: "reset",
    label: "School Admin login reset",
    name: "schoolos_admin_reset",
    category: "UTILITY",
    body: "School OS, {{1}}.\n{{2}}, your login was reset by DREAM TEAM. Your old password no longer works.\nTap to set a new password: {{3}}\nYour username is your mobile number: {{4}}.\nThe link works for 3 days. If you did not ask for this, call DREAM TEAM at once.",
    example: ["Sunrise Public School", "Anita Sharma", "https://school-os-beta.vercel.app/i/abc123", "98xxxxx102"],
  },
  {
    purpose: "code",
    label: "One-time code",
    name: "schoolos_login_code",
    category: "AUTHENTICATION",
    body: "",
    example: ["482913"],
  },
  {
    purpose: "team-invite",
    label: "Console team invite",
    name: "schoolos_team_invite",
    category: "UTILITY",
    body: "School OS console, DREAM TEAM SERVICES.\n{{1}}, you are invited as {{2}}.\nTap to confirm a code and set your password: {{3}}\nYour username is your mobile number: {{4}}.\nThe link works for 3 days.",
    example: ["Ravi Kumar", "Onboarding", "https://school-os-beta.vercel.app/console/welcome/abc123", "98xxxxx102"],
  },
  {
    purpose: "invoice",
    label: "Invoice",
    name: "schoolos_invoice",
    category: "UTILITY",
    body: "School OS, {{1}}.\nInvoice {{2}} for {{3}} is due on {{4}}.\nPay online: {{5}}\nThank you, DREAM TEAM SERVICES.",
    example: ["Sunrise Public School", "DTS/2026-27/0012", "₹24,000.00", "31-10-2026", "https://rzp.io/l/abc123"],
  },
  {
    purpose: "notice",
    label: "School status notice",
    name: "schoolos_status_notice",
    category: "UTILITY",
    body: "School OS, {{1}}.\nDear {{2}}, {{3}}\nDREAM TEAM SERVICES",
    example: ["Sunrise Public School", "Anita Sharma", "your school's trial ends in 3 days. Call us to keep using School OS."],
  },
];

export type TemplateState = { name: string; status: string; note?: string | null; checkedAt?: string };
type Templates = Partial<Record<ConsolePurposeKey, TemplateState>>;

/** What the outbox needs to send. Null when WhatsApp is not connected. */
export type WhatsappSetup = {
  phoneNumberId: string;
  accessToken: string;
  businessAccountId: string | null;
  language: string;
  /** The template to use for a purpose, or null to send plain text. */
  template: (purpose: ConsolePurposeKey) => string | null;
  from: "console" | "environment";
};

const KEY = "whatsapp";
const env = (name: string) => {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
};

async function row(): Promise<ConsoleProvider | null> {
  return withConsole((tx) => tx.consoleProvider.findUnique({ where: { key: KEY } }));
}

function fromRow(r: ConsoleProvider | null): WhatsappSetup | null {
  if (!r?.phoneNumberId || !r.accessTokenEnc) return null;
  let accessToken: string;
  try {
    accessToken = decryptField(r.accessTokenEnc);
  } catch {
    return null;
  }
  const t = (r.templates ?? {}) as Templates;
  return {
    phoneNumberId: r.phoneNumberId,
    accessToken,
    businessAccountId: r.businessAccountId,
    language: r.language,
    template: (p) => (t[p]?.status === "APPROVED" ? t[p]!.name : null),
    from: "console",
  };
}

function fromEnv(): WhatsappSetup | null {
  const phoneNumberId = env("CONSOLE_WHATSAPP_PHONE_NUMBER_ID");
  const accessToken = env("CONSOLE_WHATSAPP_ACCESS_TOKEN");
  if (!phoneNumberId || !accessToken) return null;
  return {
    phoneNumberId,
    accessToken,
    businessAccountId: env("CONSOLE_WHATSAPP_BUSINESS_ACCOUNT_ID"),
    language: env("CONSOLE_WHATSAPP_LANGUAGE") ?? "en",
    template: (p) => env(`CONSOLE_WHATSAPP_TEMPLATE_${p.toUpperCase().replace(/-/g, "_")}`),
    from: "environment",
  };
}

/** The connection the console sends with: the one saved in the console first, else the environment. */
export async function whatsappSetup(): Promise<WhatsappSetup | null> {
  const saved = await row().catch(() => null);
  return fromRow(saved) ?? fromEnv();
}

export async function whatsappIsSetUp(): Promise<boolean> {
  return (await whatsappSetup()) !== null;
}

/** Graph's error as plain words. */
function graphWords(json: unknown, fallback: string) {
  const m = (json as { error?: { message?: string } } | null)?.error?.message;
  return m ? `WhatsApp said: ${m.slice(0, 200)}` : fallback;
}

/** Asks Meta which number this ID and token belong to. */
async function checkNumber(phoneNumberId: string, accessToken: string) {
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => null)) as { display_phone_number?: string; verified_name?: string; quality_rating?: string } | null;
    if (!res.ok || !json?.display_phone_number) return { ok: false as const, reason: graphWords(json, "WhatsApp did not accept this phone number ID and access token.") };
    return { ok: true as const, words: `${json.display_phone_number}${json.verified_name ? ` · ${json.verified_name}` : ""}${json.quality_rating ? ` · quality ${json.quality_rating.toLowerCase()}` : ""}` };
  } catch {
    return { ok: false as const, reason: "Could not reach WhatsApp. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// The settings page
// ---------------------------------------------------------------------------

export type WhatsappView = {
  connected: boolean;
  from: "console" | "environment" | null;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  tokenShown: string | null;
  language: string;
  testedAt: Date | null;
  testResult: string | null;
  updatedByName: string | null;
  updatedAt: Date | null;
  templates: { purpose: ConsolePurposeKey; label: string; name: string; category: string; body: string; state: TemplateState | null }[];
};

export async function whatsappView(): Promise<WhatsappView> {
  const r = await row();
  const saved = fromRow(r);
  const envSetup = saved ? null : fromEnv();
  const t = (r?.templates ?? {}) as Templates;
  return {
    connected: Boolean(saved ?? envSetup),
    from: saved ? "console" : envSetup ? "environment" : null,
    phoneNumberId: r?.phoneNumberId ?? envSetup?.phoneNumberId ?? null,
    businessAccountId: r?.businessAccountId ?? envSetup?.businessAccountId ?? null,
    tokenShown: r?.tokenLast4 ? `••••••••${r.tokenLast4}` : envSetup ? "Set on the server" : null,
    language: r?.language ?? envSetup?.language ?? "en",
    testedAt: r?.testedAt ?? null,
    testResult: r?.testResult ?? null,
    updatedByName: r?.updatedByName ?? null,
    updatedAt: r?.updatedAt ?? null,
    templates: CONSOLE_TEMPLATES.map((s) => ({ purpose: s.purpose, label: s.label, name: s.name, category: s.category, body: s.body, state: t[s.purpose] ?? null })),
  };
}

export type WhatsappInput = { phoneNumberId: string; businessAccountId: string; accessToken: string; language: string };

/** Saves the connection after Meta confirms the ID and token work together. */
export async function saveWhatsapp(actor: ConsoleActor, input: WhatsappInput) {
  const phoneNumberId = input.phoneNumberId.replace(/\s+/g, "");
  const businessAccountId = input.businessAccountId.replace(/\s+/g, "") || null;
  const typedToken = input.accessToken.trim();
  const language = input.language.trim() || "en";
  if (!/^\d{6,30}$/.test(phoneNumberId)) throw new ConsoleProblem("Enter the phone number ID from Meta: digits only, not the phone number itself.", "phoneNumberId");
  if (businessAccountId && !/^\d{6,30}$/.test(businessAccountId)) throw new ConsoleProblem("Enter the WhatsApp Business account ID: digits only.", "businessAccountId");
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(language)) throw new ConsoleProblem("Use a WhatsApp language code like en or en_US.", "language");
  const before = await row();
  let accessToken = typedToken;
  if (!accessToken) {
    if (!before?.accessTokenEnc) throw new ConsoleProblem("Paste the access token.", "accessToken");
    accessToken = decryptField(before.accessTokenEnc);
  }
  if (/\s/.test(accessToken) || accessToken.length < 20) throw new ConsoleProblem("This access token does not look right. Copy it again from Meta.", "accessToken");
  const check = await checkNumber(phoneNumberId, accessToken);
  if (!check.ok) throw new ConsoleProblem(check.reason, typedToken ? "accessToken" : "phoneNumberId");
  const now = new Date();
  const data = {
    phoneNumberId,
    businessAccountId,
    language,
    ...(typedToken ? { accessTokenEnc: encryptField(accessToken), tokenLast4: accessToken.slice(-4) } : {}),
    testedAt: now,
    testResult: `Connected · ${check.words}`,
    updatedById: actor.id,
    updatedByName: actor.name,
  };
  await withConsole(async (tx) => {
    await tx.consoleProvider.upsert({ where: { key: KEY }, create: { key: KEY, ...data }, update: data });
    await logActivity(tx, actor, {
      type: "system",
      text: `${before ? "changed" : "connected"} DREAM TEAM's WhatsApp for console messages: ${check.words}${typedToken ? `, access token ${maskLast4(accessToken).slice(-8)}` : ""}.`,
      before: before ? { phoneNumberId: before.phoneNumberId, businessAccountId: before.businessAccountId, token: before.tokenLast4 ? `…${before.tokenLast4}` : null } : null,
      after: { phoneNumberId, businessAccountId, token: `…${accessToken.slice(-4)}` },
    });
  });
  return { words: check.words };
}

/** Stops console messages going out on this connection. The saved token is wiped. */
export async function disconnectWhatsapp(actor: ConsoleActor) {
  const before = await row();
  if (!before?.accessTokenEnc) throw new ConsoleProblem("WhatsApp is not connected from the console.");
  await withConsole(async (tx) => {
    await tx.consoleProvider.update({ where: { key: KEY }, data: { accessTokenEnc: null, tokenLast4: null, testResult: "Disconnected", updatedById: actor.id, updatedByName: actor.name } });
    await logActivity(tx, actor, { type: "system", text: "disconnected DREAM TEAM's WhatsApp for console messages. The saved access token was wiped.", from: "Connected", to: "Not connected" });
  });
}

/** Sends Meta's ready-made hello_world template to a mobile, to prove messages arrive. */
export async function sendWhatsappTest(actor: ConsoleActor, mobile: string) {
  const to = tenDigits(mobile);
  if (!to) throw new ConsoleProblem("Enter a 10-digit Indian mobile number.", "mobile");
  const s = await whatsappSetup();
  if (!s) throw new ConsoleProblem("Connect WhatsApp first.");
  // hello_world comes approved with every WhatsApp Business account, in en_US.
  const sent = await whatsappProvider({ config: { phoneNumberId: s.phoneNumberId }, secrets: { accessToken: s.accessToken } })
    .send({ channel: "whatsapp", to, text: "", whatsappTemplate: { name: "hello_world", language: "en_US", params: [] } });
  const now = new Date();
  const result = sent.ok ? `Test sent to ${maskMobile(to)}` : `Test to ${maskMobile(to)} failed: ${sent.reason}`;
  await withConsole(async (tx) => {
    if (s.from === "console") await tx.consoleProvider.update({ where: { key: KEY }, data: { testedAt: now, testResult: result } });
    await tx.consoleMessage.create({ data: { channel: "whatsapp", to, purpose: "test", text: "WhatsApp test message (hello_world)", status: sent.ok ? "SENT" : "FAILED", providerMessageId: sent.ok ? sent.providerMessageId : null, failReason: sent.ok ? null : sent.reason } });
    await logActivity(tx, actor, { type: "system", text: `sent a WhatsApp test message to +91 ${maskMobile(to)}: ${sent.ok ? "sent" : `failed, ${sent.reason}`}` });
  });
  if (!sent.ok) throw new ConsoleProblem(sent.reason, "mobile");
  return { to: maskMobile(to) };
}

async function saveTemplates(next: Templates) {
  await withConsole((tx) => tx.consoleProvider.update({ where: { key: KEY }, data: { templates: next as Prisma.InputJsonValue } }));
}

/** Sends one template to Meta for approval, with real-looking examples (Meta rejects "sample" ones). */
async function submitTemplate(businessAccountId: string, accessToken: string, spec: TemplateSpec, language: string) {
  const components = spec.category === "AUTHENTICATION"
    ? [
        { type: "BODY", add_security_recommendation: true },
        { type: "FOOTER", code_expiration_minutes: 10 },
        { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copy code" }] },
      ]
    : [{ type: "BODY", text: spec.body, ...(spec.example.length ? { example: { body_text: [spec.example] } } : {}) }];
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(businessAccountId)}/message_templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ name: spec.name, language, category: spec.category, components }),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => null)) as { id?: string; status?: string } | null;
    if (res.ok && json?.id) return { ok: true as const, status: (json.status ?? "PENDING").toUpperCase() };
    return { ok: false as const, reason: graphWords(json, "WhatsApp did not accept the template.") };
  } catch {
    return { ok: false as const, reason: "Could not reach WhatsApp. Please try again." };
  }
}

/** Sends every template not yet approved or waiting to Meta for approval. */
export async function submitConsoleTemplates(actor: ConsoleActor) {
  const r = await row();
  const s = fromRow(r);
  if (!s || !r) throw new ConsoleProblem("Connect WhatsApp in this page first.");
  if (!s.businessAccountId) throw new ConsoleProblem("Add the WhatsApp Business account ID first. Templates are kept on that account.", "businessAccountId");
  const t = { ...((r.templates ?? {}) as Templates) };
  const p = { config: { businessAccountId: s.businessAccountId }, secrets: { accessToken: s.accessToken } };
  const now = new Date().toISOString();
  let sent = 0;
  const problems: string[] = [];
  for (const spec of CONSOLE_TEMPLATES) {
    const had = t[spec.purpose];
    if (had && (had.status === "APPROVED" || had.status === "PENDING")) continue;
    const res = await submitTemplate(s.businessAccountId, s.accessToken, spec, s.language);
    if (res.ok) {
      sent++;
      t[spec.purpose] = { name: spec.name, status: res.status, checkedAt: now };
    } else if (/already exists|same name/i.test(res.reason)) {
      // Made earlier (on this account or by hand): read its real status instead.
      const st = await whatsappTemplateStatus(p, spec.name, s.language);
      t[spec.purpose] = { name: spec.name, status: st?.status ?? "PENDING", note: st?.note ?? null, checkedAt: now };
    } else {
      problems.push(`${spec.label}: ${res.reason}`);
      t[spec.purpose] = { name: spec.name, status: "NOT_SENT", note: res.reason, checkedAt: now };
    }
  }
  await saveTemplates(t);
  await withConsole((tx) => logActivity(tx, actor, { type: "system", text: `sent ${sent} console WhatsApp template${sent === 1 ? "" : "s"} to Meta for approval.${problems.length ? ` ${problems.length} could not be sent.` : ""}` }));
  return { sent, problems };
}

/** Asks Meta for each template's approval status. */
export async function refreshConsoleTemplates() {
  const r = await row();
  const s = fromRow(r);
  if (!s || !r || !s.businessAccountId) throw new ConsoleProblem("Connect WhatsApp with the Business account ID first.");
  const t = { ...((r.templates ?? {}) as Templates) };
  const p = { config: { businessAccountId: s.businessAccountId }, secrets: { accessToken: s.accessToken } };
  const now = new Date().toISOString();
  let approved = 0;
  for (const spec of CONSOLE_TEMPLATES) {
    const st = await whatsappTemplateStatus(p, spec.name, s.language);
    if (st) t[spec.purpose] = { name: spec.name, status: st.status, note: st.note, checkedAt: now };
    if (t[spec.purpose]?.status === "APPROVED") approved++;
  }
  await saveTemplates(t);
  return { approved, total: CONSOLE_TEMPLATES.length };
}
