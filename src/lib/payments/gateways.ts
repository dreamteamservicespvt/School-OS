// Payment Gateway Accounts (Settings, Payment Gateways). Secrets are
// encrypted with encryptField and never shown again: only their last 4
// characters. Every change is audited without the secret itself.
import "server-only";

import type { PaymentGatewayAccount } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { decryptField, encryptField } from "../crypto";
import { findProvider, type Provider } from "./providers";
import { testConnection, type ConnectionResult, type RazorpayCredentials } from "./razorpay";

export class GatewayProblem extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
  }
}

export type GatewayInput = {
  displayName: string;
  provider: string;
  environment: "test" | "live";
  /** Every field of the provider. A blank secret on an edit keeps the saved one. */
  values: Record<string, string>;
  webhookSecret: string;
};

const last4 = (v: string) => v.replace(/\s+/g, "").slice(-4);

export function secretEndings(g: Pick<PaymentGatewayAccount, "secretsLast4">): Record<string, string> {
  try {
    return g.secretsLast4 ? (JSON.parse(g.secretsLast4) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** What the list and audit log may show: never a secret. */
export function publicView(g: PaymentGatewayAccount) {
  return {
    displayName: g.displayName,
    provider: g.provider,
    environment: g.environment,
    isActive: g.isActive,
    publicKey: g.publicKey,
    secretsEnding: secretEndings(g),
  };
}

type Stored = { values: Record<string, string>; webhookSecret: string | null };

function readStored(g: Pick<PaymentGatewayAccount, "secretsEnc" | "webhookSecretEnc">): Stored {
  const values = JSON.parse(decryptField(g.secretsEnc)) as Record<string, string>;
  const webhookSecret = g.webhookSecretEnc ? decryptField(g.webhookSecretEnc) : null;
  return { values, webhookSecret };
}

/** The saved details of one gateway, decrypted. Server only; never send these to a browser. */
export async function gatewayCredentials(tx: Tx, gatewayId: string) {
  const g = await tx.paymentGatewayAccount.findUnique({ where: { id: gatewayId } });
  if (!g || g.archivedAt) return null;
  return { gateway: g, ...readStored(g) };
}

/** Razorpay keys of one saved gateway, for Fee Management (orders, checks). */
export async function razorpayCredentials(tx: Tx, gatewayId: string): Promise<RazorpayCredentials | null> {
  const c = await gatewayCredentials(tx, gatewayId);
  if (!c || c.gateway.provider !== "razorpay") return null;
  return { keyId: c.values.keyId, keySecret: c.values.keySecret, webhookSecret: c.webhookSecret, environment: c.gateway.environment === "live" ? "live" : "test" };
}

function checkValues(provider: Provider, input: GatewayInput, existing: Stored | null) {
  const values: Record<string, string> = {};
  for (const f of provider.fields) {
    const typed = (input.values[f.key] ?? "").trim();
    if (!typed) {
      if (f.secret && existing?.values[f.key]) { values[f.key] = existing.values[f.key]; continue; }
      throw new GatewayProblem(`${f.label} is needed.`, f.key);
    }
    if (typed.length > 500) throw new GatewayProblem(`${f.label} is too long. Copy it again from ${provider.name}.`, f.key);
    if (f.pattern && !f.pattern.test(typed)) throw new GatewayProblem(`${f.label} does not look right. ${f.patternHelp ?? ""}`.trim(), f.key);
    values[f.key] = typed;
  }
  if (provider.key === "razorpay") {
    const want = input.environment === "live" ? "rzp_live_" : "rzp_test_";
    if (!values.keyId.startsWith(want)) {
      throw new GatewayProblem(`This Key ID is for ${values.keyId.startsWith("rzp_live_") ? "live" : "test"} mode, but ${input.environment} mode is chosen. Use the key that starts with ${want}.`, "keyId");
    }
  }
  const webhookSecret = input.webhookSecret.trim() || existing?.webhookSecret || null;
  return { values, webhookSecret };
}

function sealed(provider: Provider, values: Record<string, string>, webhookSecret: string | null) {
  const endings: Record<string, string> = {};
  for (const f of provider.fields) if (f.secret && values[f.key]) endings[f.key] = last4(values[f.key]);
  if (webhookSecret) endings.webhookSecret = last4(webhookSecret);
  return {
    publicKey: provider.publicField ? values[provider.publicField] ?? null : null,
    secretsEnc: encryptField(JSON.stringify(values)),
    secretsLast4: JSON.stringify(endings),
    webhookSecretEnc: webhookSecret ? encryptField(webhookSecret) : null,
  };
}

export function checkDisplayName(name: string) {
  const n = name.trim();
  if (!n) throw new GatewayProblem("Display name is needed.", "displayName");
  if (n.length > 60) throw new GatewayProblem("Display name can be at most 60 characters.", "displayName");
  return n;
}

export async function addGateway(tx: Tx, ctx: SchoolContext, input: GatewayInput) {
  const provider = findProvider(input.provider);
  if (!provider) throw new GatewayProblem("Choose a provider.", "provider");
  const displayName = checkDisplayName(input.displayName);
  const clash = await tx.paymentGatewayAccount.findFirst({ where: { displayName: { equals: displayName, mode: "insensitive" }, archivedAt: null } });
  if (clash) throw new GatewayProblem(`A gateway called "${clash.displayName}" is already added. Use a distinct name, such as "${provider.name} Class A".`, "displayName");
  const { values, webhookSecret } = checkValues(provider, input, null);
  const g = await tx.paymentGatewayAccount.create({
    data: {
      schoolId: ctx.schoolId,
      displayName,
      provider: provider.key,
      environment: input.environment,
      isActive: false,
      ...sealed(provider, values, webhookSecret),
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Payment Gateway Account", recordId: g.id, after: publicView(g) });
  return g;
}

function sameValues(a: Stored, b: Stored) {
  return JSON.stringify(a.values) === JSON.stringify(b.values) && a.webhookSecret === b.webhookSecret;
}

/**
 * Changes a gateway's details. The person types the gateway's name to confirm
 * (P4). New details on a gateway that is switched on are tested first, so
 * parents never meet a broken gateway; on one that is off, the old test
 * result no longer counts.
 */
export async function updateGateway(tx: Tx, ctx: SchoolContext, id: string, input: GatewayInput, typedName: string, tester: (p: Provider, c: Stored, env: "test" | "live") => Promise<ConnectionResult> = runCheck) {
  const g = await tx.paymentGatewayAccount.findUnique({ where: { id } });
  if (!g || g.archivedAt) throw new GatewayProblem("This gateway was not found. It may have been archived.");
  if (typedName.trim().toLowerCase() !== g.displayName.toLowerCase()) throw new GatewayProblem(`Type ${g.displayName} to confirm.`, "confirm");
  const provider = findProvider(g.provider)!;
  const displayName = checkDisplayName(input.displayName);
  if (displayName.toLowerCase() !== g.displayName.toLowerCase()) {
    const clash = await tx.paymentGatewayAccount.findFirst({ where: { id: { not: id }, displayName: { equals: displayName, mode: "insensitive" }, archivedAt: null } });
    if (clash) throw new GatewayProblem(`A gateway called "${clash.displayName}" is already added. Use a distinct name.`, "displayName");
  }
  const existing = readStored(g);
  const next = checkValues(provider, { ...input, provider: provider.key }, existing);
  const detailsChanged = !sameValues(existing, next) || input.environment !== g.environment;
  let test: ConnectionResult | null = null;
  if (detailsChanged && g.isActive) {
    test = await tester(provider, next, input.environment);
    if (!test.ok) {
      const failed = test.checks.filter((c) => !c.ok).map((c) => c.note).join(" ");
      throw new GatewayProblem(`The new details did not pass the test, so nothing was changed and the old details still work. ${failed}`);
    }
  }
  const updated = await tx.paymentGatewayAccount.update({
    where: { id },
    data: {
      displayName,
      environment: input.environment,
      ...sealed(provider, next.values, next.webhookSecret),
      ...(detailsChanged
        ? test
          ? { lastTestAt: new Date(), lastTestOk: true, lastTestNote: "Tested when the details were changed." }
          : { lastTestAt: null, lastTestOk: null, lastTestNote: null }
        : {}),
      updatedById: ctx.userId,
    },
  });
  const changedSecrets = provider.fields.filter((f) => f.secret && existing.values[f.key] !== next.values[f.key]).map((f) => f.label);
  if (existing.webhookSecret !== next.webhookSecret) changedSecrets.push(provider.webhookSecret?.label ?? "Webhook secret");
  await writeAudit(tx, ctx, {
    action: "changed",
    recordType: "Payment Gateway Account",
    recordId: id,
    before: publicView(g),
    after: { ...publicView(updated), secretsReplaced: changedSecrets },
  });
  return { gateway: updated, detailsChanged };
}

async function runCheck(provider: Provider, stored: Stored, environment: "test" | "live"): Promise<ConnectionResult> {
  if (provider.key === "razorpay") {
    return testConnection({ keyId: stored.values.keyId, keySecret: stored.values.keySecret, webhookSecret: stored.webhookSecret, environment });
  }
  const missing = provider.fields.filter((f) => !stored.values[f.key]);
  const checks: ConnectionResult["checks"] = [
    { label: "Every detail filled in", ok: missing.length === 0, note: missing.length ? `Missing: ${missing.map((f) => f.label).join(", ")}.` : "All the details this provider needs are saved." },
  ];
  if (provider.webhookSecret) {
    checks.push({ label: `${provider.webhookSecret.label} saved`, ok: Boolean(stored.webhookSecret), note: stored.webhookSecret ? "Confirmations sent later can be checked." : `Add the ${provider.webhookSecret.label.toLowerCase()}, so confirmations sent later are not missed.` });
  }
  if (provider.type === "online") {
    checks.push({ label: `Asked ${provider.name}`, ok: true, note: `${provider.name} cannot be asked directly from here. Make a ₹1 test payment from Fee Management to finish checking.` });
  }
  return { ok: checks.every((c) => c.ok), checks };
}

/** Test with details typed in the form, before saving. */
export async function testUnsaved(tx: Tx, input: GatewayInput, gatewayId: string | null) {
  const provider = findProvider(input.provider);
  if (!provider) throw new GatewayProblem("Choose a provider.", "provider");
  let existing: Stored | null = null;
  if (gatewayId) {
    const g = await tx.paymentGatewayAccount.findUnique({ where: { id: gatewayId } });
    if (g && !g.archivedAt) existing = readStored(g);
  }
  const next = checkValues(provider, input, existing);
  return runCheck(provider, next, input.environment);
}

/** "Test" on a saved gateway. The result is kept and shown in the list. */
export async function testGateway(tx: Tx, ctx: SchoolContext, id: string, tester = runCheck) {
  const g = await tx.paymentGatewayAccount.findUnique({ where: { id } });
  if (!g || g.archivedAt) throw new GatewayProblem("This gateway was not found. It may have been archived.");
  const provider = findProvider(g.provider)!;
  const result = await tester(provider, readStored(g), g.environment === "live" ? "live" : "test");
  const failed = result.checks.filter((c) => !c.ok).map((c) => c.note).join(" ");
  await tx.paymentGatewayAccount.update({
    where: { id },
    data: { lastTestAt: new Date(), lastTestOk: result.ok, lastTestNote: result.ok ? "Everything worked." : failed.slice(0, 500) },
  });
  await writeAudit(tx, ctx, { action: "tested", recordType: "Payment Gateway Account", recordId: id, after: { ok: result.ok, checks: result.checks.map((c) => `${c.ok ? "OK" : "Problem"}: ${c.label}`) } });
  return result;
}

/** Switch on or off. On needs a passed test of the current details. Both need the typed name. */
export async function setGatewayActive(tx: Tx, ctx: SchoolContext, id: string, on: boolean, typedName: string) {
  const g = await tx.paymentGatewayAccount.findUnique({ where: { id } });
  if (!g || g.archivedAt) throw new GatewayProblem("This gateway was not found. It may have been archived.");
  if (typedName.trim().toLowerCase() !== g.displayName.toLowerCase()) throw new GatewayProblem(`Type ${g.displayName} to confirm.`);
  if (on && g.lastTestOk !== true) throw new GatewayProblem("Test the connection first. A gateway can be switched on only after a test passes.");
  if (g.isActive === on) return g;
  const updated = await tx.paymentGatewayAccount.update({ where: { id }, data: { isActive: on, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: on ? "switched-on" : "switched-off", recordType: "Payment Gateway Account", recordId: id, before: { isActive: g.isActive }, after: { isActive: on } });
  return updated;
}

/** Archive (P13): the gateway stops taking payments; past payments keep pointing at it. */
export async function archiveGateway(tx: Tx, ctx: SchoolContext, id: string, typedName: string) {
  const g = await tx.paymentGatewayAccount.findUnique({ where: { id } });
  if (!g || g.archivedAt) throw new GatewayProblem("This gateway was not found. It may have been archived already.");
  if (typedName.trim().toLowerCase() !== g.displayName.toLowerCase()) throw new GatewayProblem(`Type ${g.displayName} to confirm.`);
  await tx.paymentGatewayAccount.update({ where: { id }, data: { archivedAt: new Date(), isActive: false, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Payment Gateway Account", recordId: id, before: publicView(g) });
}

export async function restoreGateway(tx: Tx, ctx: SchoolContext, id: string) {
  const g = await tx.paymentGatewayAccount.findUnique({ where: { id } });
  if (!g || !g.archivedAt) throw new GatewayProblem("This gateway is not archived.");
  const clash = await tx.paymentGatewayAccount.findFirst({ where: { id: { not: id }, displayName: { equals: g.displayName, mode: "insensitive" }, archivedAt: null } });
  if (clash) throw new GatewayProblem(`Another gateway is now called "${clash.displayName}". Rename that one first.`);
  await tx.paymentGatewayAccount.update({ where: { id }, data: { archivedAt: null, isActive: false, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "restored", recordType: "Payment Gateway Account", recordId: id });
}

// Bank accounts for split payments (Razorpay Route).

export type LinkedAccountInput = { label: string; bankName: string; accountLast4: string; ifsc: string; linkedAccountId: string };

export function checkLinkedAccount(input: LinkedAccountInput): { ok: true; value: LinkedAccountInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const v = {
    label: input.label.trim(),
    bankName: input.bankName.trim(),
    accountLast4: input.accountLast4.replace(/\s+/g, ""),
    ifsc: input.ifsc.trim().toUpperCase(),
    linkedAccountId: input.linkedAccountId.trim(),
  };
  if (!v.label) errors.label = "Account name is needed, for example Trust account.";
  else if (v.label.length > 60) errors.label = "Account name can be at most 60 characters.";
  if (!v.bankName) errors.bankName = "Bank is needed.";
  if (!/^\d{4}$/.test(v.accountLast4)) errors.accountLast4 = "Type the last 4 digits of the account number.";
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.ifsc)) errors.ifsc = "IFSC has 11 characters, like SBIN0001234.";
  if (!/^acc_[A-Za-z0-9]{14}$/.test(v.linkedAccountId)) errors.linkedAccountId = "The Razorpay linked account ID starts with acc_ and has 14 more letters and numbers. Find it in Razorpay, Route, Linked Accounts.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: v };
}

export async function addLinkedAccount(tx: Tx, ctx: SchoolContext, gatewayId: string, value: LinkedAccountInput) {
  const g = await tx.paymentGatewayAccount.findUnique({ where: { id: gatewayId } });
  if (!g || g.archivedAt) throw new GatewayProblem("This gateway was not found. It may have been archived.");
  if (g.provider !== "razorpay") throw new GatewayProblem("Split payments to several bank accounts work with Razorpay only.");
  const clash = await tx.gatewayLinkedAccount.findFirst({ where: { gatewayAccountId: gatewayId, linkedAccountId: value.linkedAccountId } });
  if (clash && !clash.archivedAt) throw new GatewayProblem(`This Razorpay account is already added as "${clash.label}".`, "linkedAccountId");
  const row = clash
    ? await tx.gatewayLinkedAccount.update({ where: { id: clash.id }, data: { ...value, archivedAt: null } })
    : await tx.gatewayLinkedAccount.create({ data: { schoolId: ctx.schoolId, gatewayAccountId: gatewayId, ...value, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Gateway Linked Account", recordId: row.id, after: { gateway: g.displayName, label: row.label, bankName: row.bankName, accountLast4: row.accountLast4, ifsc: row.ifsc, linkedAccountId: row.linkedAccountId } });
  return row;
}

export async function archiveLinkedAccount(tx: Tx, ctx: SchoolContext, id: string) {
  const row = await tx.gatewayLinkedAccount.findUnique({ where: { id } });
  if (!row || row.archivedAt) throw new GatewayProblem("This bank account was not found.");
  await tx.gatewayLinkedAccount.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Gateway Linked Account", recordId: id, before: { label: row.label, linkedAccountId: row.linkedAccountId } });
}

/** For Fee Management: the Razorpay linked account to split a fee head's money into, or null. */
export async function linkedAccountFor(tx: Tx, gatewayId: string, bankAccountId: string) {
  return tx.gatewayLinkedAccount.findFirst({ where: { gatewayAccountId: gatewayId, bankAccountId, archivedAt: null } });
}
