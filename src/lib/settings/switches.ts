// Modules On/Off (Settings): optional modules, school-type templates, system
// preferences, the AI assistant and its features, and integrations.
// Switching a module off only hides it; its data stays (P19).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { decryptField, encryptField } from "../crypto";
import { BUILT_MODULES, MODULES, type ModuleKey } from "../modules";
import { SettingsProblem } from "./common";
import { ROLL_ORDERS, WEEK_STARTS, boardDefaults, readPreferences, type Preferences } from "./profile-rules";
import { AI_FEATURES, INTEGRATIONS, SCHOOL_TEMPLATES, aiFeatureReady, aiRolesOf, checkIntegrationFields, httpAllowed, type IntegrationDef } from "./switch-rules";
import { aiPlatformDailyLimit } from "../ai/config";
import { AddressRefused, publicFetch } from "../net/public-fetch";

export * from "./switch-rules";

export const OPTIONAL_MODULES = MODULES.filter((m) => m.optional);

/** A module can be switched on once its screens are built. */
export const canSwitchOn = (key: ModuleKey) => BUILT_MODULES.has(key);

export async function setModuleOn(tx: Tx, ctx: SchoolContext, key: string, on: boolean) {
  const mod = OPTIONAL_MODULES.find((m) => m.key === key);
  if (!mod) throw new SettingsProblem("Only Transport, Library, Inventory and Hostel can be switched on or off. The other modules are always on.");
  if (on && !canSwitchOn(mod.key)) throw new SettingsProblem(`${mod.name} arrives in Stage ${mod.stage}. It can be switched on once it is ready.`);
  const row = await tx.schoolModule.findUnique({ where: { schoolId_moduleKey: { schoolId: ctx.schoolId, moduleKey: mod.key } } });
  if ((row?.isOn ?? false) === on) return false;
  await tx.schoolModule.upsert({
    where: { schoolId_moduleKey: { schoolId: ctx.schoolId, moduleKey: mod.key } },
    create: { schoolId: ctx.schoolId, moduleKey: mod.key, isOn: on },
    update: { isOn: on },
  });
  await writeAudit(tx, ctx, { action: on ? "switched-on" : "switched-off", recordType: "Module", recordId: null, before: { module: mod.name, on: !on }, after: { module: mod.name, on } });
  return true;
}

async function prefsOf(tx: Tx, ctx: SchoolContext) {
  const s = await tx.school.findUnique({ where: { id: ctx.schoolId } });
  if (!s) throw new SettingsProblem("Your school was not found.");
  return { school: s, prefs: readPreferences(s.preferences) };
}

export async function savePreferences(tx: Tx, ctx: SchoolContext, input: { weekStart: string; rollNumberOrder: string }) {
  if (!WEEK_STARTS.some((w) => w.value === input.weekStart)) throw new SettingsProblem("Choose the first day of the week.", "weekStart");
  if (!ROLL_ORDERS.some((w) => w.value === input.rollNumberOrder)) throw new SettingsProblem("Choose the roll number order.", "rollNumberOrder");
  const { school, prefs } = await prefsOf(tx, ctx);
  const before = { weekStart: prefs.weekStart ?? "monday", rollNumberOrder: prefs.rollNumberOrder ?? "name" };
  if (before.weekStart === input.weekStart && before.rollNumberOrder === input.rollNumberOrder) return false;
  const next: Preferences = { ...prefs, weekStart: input.weekStart as Preferences["weekStart"], rollNumberOrder: input.rollNumberOrder as Preferences["rollNumberOrder"] };
  await tx.school.update({ where: { id: school.id }, data: { preferences: next as Prisma.InputJsonValue } });
  await writeAudit(tx, ctx, { action: "changed-preferences", recordType: "School", recordId: school.id, before, after: input });
  return true;
}

/** The AI assistant on or off, and which roles may use it. With it off, every AI feature is off. */
export async function saveAssistant(tx: Tx, ctx: SchoolContext, input: { on: boolean; roles: string[]; dailyLimit?: number | null }) {
  const { school, prefs } = await prefsOf(tx, ctx);
  const roleRows = await tx.role.findMany({ where: { key: { in: input.roles }, archivedAt: null, isEnabled: true }, select: { key: true } });
  const roles = roleRows.map((r) => r.key!).filter(Boolean);
  if (input.on && roles.length === 0) throw new SettingsProblem("Choose at least one role that may use the AI assistant.", "aiRoles");
  // The school may keep its AI requests below DREAM TEAM's daily limit, never above it.
  const cap = aiPlatformDailyLimit();
  const dailyLimit = input.dailyLimit === undefined ? prefs.aiDailyLimit ?? null : input.dailyLimit;
  if (input.dailyLimit !== undefined && dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > cap)) throw new SettingsProblem(`Give a whole number from 1 to ${cap}, or leave it empty for ${cap} a day.`, "aiDailyLimit");
  const was = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: "ai-assistant" } } });
  await tx.schoolFeature.upsert({
    where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: "ai-assistant" } },
    create: { schoolId: ctx.schoolId, featureKey: "ai-assistant", isOn: input.on },
    update: { isOn: input.on },
  });
  await tx.school.update({ where: { id: school.id }, data: { preferences: { ...prefs, aiRoles: roles, aiDailyLimit: dailyLimit } as Prisma.InputJsonValue } });
  await writeAudit(tx, ctx, {
    action: "changed-ai-assistant", recordType: "School", recordId: school.id,
    before: { on: was?.isOn ?? false, roles: aiRolesOf(prefs), dailyLimit: prefs.aiDailyLimit ?? null },
    after: { on: input.on, roles, dailyLimit },
  });
}

export async function setFeature(tx: Tx, ctx: SchoolContext, key: string, on: boolean) {
  const f = AI_FEATURES.find((x) => x.key === key);
  if (!f || (f.status === "hidden" && on)) throw new SettingsProblem("This feature was not found.");
  // A feature that is not built yet cannot be switched on; one switched on before can still be switched off.
  if (on && !aiFeatureReady(f.key)) throw new SettingsProblem(`${f.label} is coming soon. It can be switched on once it is ready.`);
  if (on) {
    const assistant = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: "ai-assistant" } } });
    if (!assistant?.isOn) throw new SettingsProblem("Switch on the AI assistant first.");
  }
  const row = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } } });
  if ((row?.isOn ?? false) === on) return false;
  await tx.schoolFeature.upsert({
    where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } },
    create: { schoolId: ctx.schoolId, featureKey: key, isOn: on },
    update: { isOn: on },
  });
  await writeAudit(tx, ctx, { action: on ? "switched-on" : "switched-off", recordType: "Feature", recordId: null, after: { feature: f.label, on } });
  return true;
}

export type TemplateChange = { label: string; from: string; to: string };

/** What a school-type template would change, before it is applied. */
export async function templatePreview(tx: Tx, ctx: SchoolContext, key: string, replaceExisting: boolean) {
  const t = SCHOOL_TEMPLATES.find((x) => x.key === key);
  if (!t) throw new SettingsProblem("Choose a school-type template.");
  const { school, prefs } = await prefsOf(tx, ctx);
  const on = new Set((await tx.schoolModule.findMany({ where: { isOn: true } })).map((m) => m.moduleKey));
  const modules = t.modulesOn.filter((k) => !on.has(k) && canSwitchOn(k)).map((k) => MODULES.find((m) => m.key === k)!.name);
  const later = t.modulesOn.filter((k) => !canSwitchOn(k)).map((k) => MODULES.find((m) => m.key === k)!.name);
  const settings: TemplateChange[] = [];
  const wk = WEEK_STARTS.find((w) => w.value === t.weekStart)!.label;
  const ro = ROLL_ORDERS.find((w) => w.value === t.rollNumberOrder)!.label;
  if ((replaceExisting || !school.board) && school.board !== t.board) settings.push({ label: "Board", from: school.board ?? "Not set", to: t.board });
  if ((replaceExisting || !prefs.weekStart) && (prefs.weekStart ?? "") !== t.weekStart) settings.push({ label: "First day of the week", from: WEEK_STARTS.find((w) => w.value === prefs.weekStart)?.label ?? "Not set", to: wk });
  if ((replaceExisting || !prefs.rollNumberOrder) && (prefs.rollNumberOrder ?? "") !== t.rollNumberOrder) settings.push({ label: "Roll number order", from: ROLL_ORDERS.find((w) => w.value === prefs.rollNumberOrder)?.label ?? "Not set", to: ro });
  return { template: t, modules, later, settings };
}

export async function applyTemplate(tx: Tx, ctx: SchoolContext, key: string, replaceExisting: boolean) {
  const p = await templatePreview(tx, ctx, key, replaceExisting);
  const t = p.template;
  const { school, prefs } = await prefsOf(tx, ctx);
  for (const k of t.modulesOn) if (canSwitchOn(k)) await setModuleOn(tx, ctx, k, true);
  const next: Preferences = { ...prefs, schoolTemplate: t.key };
  if (replaceExisting || !prefs.weekStart) next.weekStart = t.weekStart;
  if (replaceExisting || !prefs.rollNumberOrder) next.rollNumberOrder = t.rollNumberOrder;
  const board = replaceExisting || !school.board ? t.board : school.board;
  if (board !== school.board) next.boardDefaults = boardDefaults(board);
  await tx.school.update({ where: { id: school.id }, data: { board, preferences: next as Prisma.InputJsonValue } });
  await writeAudit(tx, ctx, { action: "applied-template", recordType: "School", recordId: school.id, after: { template: t.name, modules: p.modules, settings: p.settings } as Prisma.InputJsonValue });
  return p;
}

// ------------------------------------------------------------ Integrations

export type IntegrationCheck = { ok: boolean; note: string };
type Fetcher = (url: string, opts: { allowHttp: boolean }) => Promise<{ status: number }>;

/** Public internet addresses only, looked up and checked first; no redirects; 5 seconds at most. */
const defaultFetch: Fetcher = (url, opts) => publicFetch(url, { allowHttp: opts.allowHttp, timeoutMs: 5000 });

/** Checks the details, and that any address answers. Says what worked and what did not. */
export async function testIntegration(def: IntegrationDef, values: Record<string, string>, fetcher: Fetcher = defaultFetch): Promise<IntegrationCheck> {
  // The field checks also refuse a private address typed as an IP or a local name, before any call.
  const problems = checkIntegrationFields(def, values, { secretsKept: true });
  if (Object.keys(problems).length) return { ok: false, note: Object.values(problems)[0] };
  const urlField = def.fields.find((f) => f.type === "url" && values[f.key]);
  if (!urlField) return { ok: true, note: "Details are complete." };
  const address = values[urlField.key];
  const allowHttp = httpAllowed(def);
  try {
    const { status } = await fetcher(address, { allowHttp });
    if (status >= 500) return { ok: false, note: `${address} answered with an error (${status}). Check the address, or ask the provider.` };
    return { ok: true, note: `${address} answered.` };
  } catch (e) {
    if (e instanceof AddressRefused) return { ok: false, note: `${urlField.label}: ${e.message}` };
    return { ok: false, note: `School OS could not reach ${address}. Check the address and that it is open to the internet.` };
  }
}

/** Connects (or updates) an integration: saves the details, secrets encrypted, and tests them. */
export async function connectIntegration(tx: Tx, ctx: SchoolContext, key: string, values: Record<string, string>, fetcher?: Fetcher) {
  const def = INTEGRATIONS.find((i) => i.key === key);
  if (!def) throw new SettingsProblem("This integration was not found.");
  const row = await tx.integration.findUnique({ where: { schoolId_key: { schoolId: ctx.schoolId, key } } });
  const problems = checkIntegrationFields(def, values, { secretsKept: Boolean(row?.secretsEnc) });
  if (Object.keys(problems).length) {
    const [field, message] = Object.entries(problems)[0];
    throw new SettingsProblem(message, field);
  }
  const config: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const f of def.fields) {
    const v = (values[f.key] ?? "").trim();
    if (f.type === "secret") { if (v) secrets[f.key] = v; } else if (v) config[f.key] = v;
  }
  let secretsEnc = row?.secretsEnc ?? null;
  if (Object.keys(secrets).length) {
    // A field left blank keeps the secret saved before; secrets are never shown again.
    const old = row?.secretsEnc ? JSON.parse(decryptField(row.secretsEnc)) as Record<string, string> : {};
    secretsEnc = encryptField(JSON.stringify({ ...old, ...secrets }));
  }
  const check = await testIntegration(def, { ...config, ...Object.fromEntries(def.fields.filter((f) => f.type === "secret").map((f) => [f.key, secrets[f.key] ?? (secretsEnc ? "kept" : "")])) }, fetcher);
  const now = new Date();
  await tx.integration.upsert({
    where: { schoolId_key: { schoolId: ctx.schoolId, key } },
    create: { schoolId: ctx.schoolId, key, status: check.ok ? "connected" : "error", config, secretsEnc, lastCheckAt: now, lastError: check.ok ? null : check.note },
    update: { status: check.ok ? "connected" : "error", config, secretsEnc, lastCheckAt: now, lastError: check.ok ? null : check.note },
  });
  await writeAudit(tx, ctx, { action: row ? "changed-integration" : "connected-integration", recordType: "Integration", recordId: null, before: row ? { integration: def.name, config: row.config } as Prisma.InputJsonValue : null, after: { integration: def.name, config, secretsChanged: Object.keys(secrets).length > 0, ok: check.ok } });
  return check;
}

export async function retestIntegration(tx: Tx, ctx: SchoolContext, key: string, fetcher?: Fetcher) {
  const def = INTEGRATIONS.find((i) => i.key === key);
  const row = await tx.integration.findUnique({ where: { schoolId_key: { schoolId: ctx.schoolId, key } } });
  if (!def || !row || row.status === "not-connected") throw new SettingsProblem("Connect this integration first.");
  const config = row.config as Record<string, string>;
  const check = await testIntegration(def, { ...config, ...Object.fromEntries(def.fields.filter((f) => f.type === "secret").map((f) => [f.key, row.secretsEnc ? "kept" : ""])) }, fetcher);
  await tx.integration.update({ where: { schoolId_key: { schoolId: ctx.schoolId, key } }, data: { status: check.ok ? "connected" : "error", lastCheckAt: new Date(), lastError: check.ok ? null : check.note } });
  await writeAudit(tx, ctx, { action: "tested-integration", recordType: "Integration", recordId: null, after: { integration: def.name, ok: check.ok, note: check.note } });
  return check;
}

export async function disconnectIntegration(tx: Tx, ctx: SchoolContext, key: string) {
  const def = INTEGRATIONS.find((i) => i.key === key);
  const row = await tx.integration.findUnique({ where: { schoolId_key: { schoolId: ctx.schoolId, key } } });
  if (!def || !row || row.status === "not-connected") return false;
  await tx.integration.update({ where: { schoolId_key: { schoolId: ctx.schoolId, key } }, data: { status: "not-connected", config: {}, secretsEnc: null, lastError: null, lastCheckAt: new Date() } });
  await writeAudit(tx, ctx, { action: "disconnected-integration", recordType: "Integration", recordId: null, before: { integration: def.name, config: row.config } as Prisma.InputJsonValue, after: { integration: def.name, connected: false } });
  return true;
}
