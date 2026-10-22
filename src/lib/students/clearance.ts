// Clearance before a student leaves (automation A14, 04-data-model.md rule 28).
// Other modules add their check here when they are built: Fee Management adds
// "Fees" (dues), Library Management adds "Library" (books not returned),
// Hostel and Inventory add theirs. With no checks registered, clearance simply
// passes, because there is nothing to settle yet.
import "server-only";

import type { SchoolContext, Tx } from "../db";

export type ClearanceResult = {
  /** True when nothing is pending. */
  clear: boolean;
  /** Plain words: "₹4,500 fees due", "1 library book not returned", "Clear". */
  detail: string;
  amountPaise?: bigint | null;
  /** Where to settle it, e.g. Collect Fee for this student. */
  actionHref?: string | null;
  actionLabel?: string | null;
};

export type ClearanceCheckFn = (tx: Tx, ctx: SchoolContext, studentId: string) => Promise<ClearanceResult>;

type Registered = { name: string; run: ClearanceCheckFn; /** The module must be on for the check to run (Hostel, Library...). */ moduleKey?: string };
const checks = new Map<string, Registered>();

/** A module adds one check, by name (shown on the Leaving list as a column). Registering the same name again replaces it. */
export function registerClearanceCheck(name: string, run: ClearanceCheckFn, opts: { moduleKey?: string } = {}) {
  checks.set(name, { name, run, moduleKey: opts.moduleKey });
}

/** For tests: remove a check again. */
export function unregisterClearanceCheck(name: string) {
  checks.delete(name);
}

export function clearanceCheckNames() {
  return [...checks.keys()];
}

/** Runs every registered check whose module is switched on. */
export async function runClearanceChecks(tx: Tx, ctx: SchoolContext, studentId: string) {
  const on = new Set((await tx.schoolModule.findMany({ where: { isOn: true }, select: { moduleKey: true } })).map((m) => m.moduleKey));
  const out: (ClearanceResult & { name: string })[] = [];
  for (const c of checks.values()) {
    if (c.moduleKey && !on.has(c.moduleKey)) continue;
    out.push({ name: c.name, ...(await c.run(tx, ctx, studentId)) });
  }
  return out;
}

/**
 * What a module does when a student has left (the leaving request completed
 * on the last date), in the same transaction: Hostel frees a bed still held
 * (a waived hostel check) and stops the hostel fees after the last date.
 */
export type LeftEvent = { studentId: string; lastDate: Date; reason: string };
type LeftFn = (tx: Tx, ctx: SchoolContext, e: LeftEvent) => Promise<void>;
const leftHandlers = new Map<string, LeftFn>();
/** Registering the same name again replaces it. */
export function registerOnLeft(name: string, fn: LeftFn) {
  leftHandlers.set(name, fn);
}
export async function runOnLeft(tx: Tx, ctx: SchoolContext, e: LeftEvent) {
  for (const fn of leftHandlers.values()) await fn(tx, ctx, e);
}
