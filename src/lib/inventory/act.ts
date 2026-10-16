// Every Inventory server action starts here: the role is checked on the
// server, the module must be switched on, the work runs inside the school's
// walls, plain-words problems go back next to their field with what was
// typed (P7), and the success message shows as a toast (P15).
import "server-only";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireAction, type Current } from "../current";
import { withSchool, type SchoolContext, type Tx } from "../db";
import { flash, type Flash } from "../flash";
import { formValues, type FormState } from "../forms";
import { PermissionDeniedError, type Action } from "../permissions";
import { MoneyProblem, MoneyWarning } from "../fees/problem";
import { DecisionProblem } from "../approvals";
import { ClosedYearError } from "../academic/years";
import { AcademicRuleError } from "../academic/common";
import { FileProblem } from "../files";
import { todayDate } from "../front-office/time";
import { invCan, invViewer, type InvCan, type InvViewer } from "./access";
import { InventoryProblem } from "./problem";
import { MODULE } from "./words";

export { InventoryProblem } from "./problem";

export type InvWork = { tx: Tx; ctx: SchoolContext; v: InvViewer; can: InvCan; current: Current; tz: string; today: Date };

type Known = Error & { field?: string; link?: { href: string; label: string } };
export type ProblemData = { link?: { href: string; label: string }; warning?: boolean };

export function problemState(e: unknown, fd?: FormData): NonNullable<FormState<ProblemData>> {
  const known = [InventoryProblem, PermissionDeniedError, MoneyProblem, DecisionProblem, ClosedYearError, FileProblem, AcademicRuleError];
  const values = fd ? formValues(fd) : undefined;
  if (known.some((K) => e instanceof K)) {
    const err = e as Known;
    const warning = e instanceof MoneyWarning;
    return { ok: false, message: err.message, errors: err.field ? { [err.field]: err.message } : undefined, values, data: err.link || warning ? { link: err.link, warning } : undefined };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { ok: false, message: "Someone else saved the same thing a moment ago. Refresh the page to see it, then try again if still needed.", values };
  }
  if (e instanceof Error && e.message.startsWith("Nobody else can approve")) return { ok: false, message: e.message, values };
  console.error(JSON.stringify({ level: "error", event: "inventory-action-failed", error: e instanceof Error ? e.message : String(e) }));
  return { ok: false, message: "That did not save because of a problem on our side. Nothing was changed. Please try again.", values };
}

/** Runs work for a person allowed this action in Inventory Management, inside the school's walls. */
export async function inInventory<T>(action: Action, work: (w: InvWork) => Promise<T>, timeout = 60_000) {
  const { current } = await requireAction(MODULE, action);
  if (!current.modulesOn.has(MODULE)) throw new InventoryProblem("Inventory Management is switched off for this school. A School Admin can switch it on in Settings, Modules On/Off.");
  const v = invViewer(current);
  const tz = current.school.timeZone;
  return withSchool(current.ctx, (tx) => work({ tx, ctx: current.ctx, v, can: invCan(v), current, tz, today: todayDate(tz) }), { timeout });
}

/** A server action: checks, does the work, answers with a FormState. */
export async function invAction<T>(action: Action, fd: FormData | undefined, work: (w: InvWork) => Promise<T>, success: (result: T) => Flash | string): Promise<FormState<T>> {
  try {
    const result = await inInventory(action, work);
    const f = success(result);
    const message = typeof f === "string" ? f : f.message;
    await flash(typeof f === "string" ? { message } : f);
    revalidatePath("/", "layout");
    return { ok: true, message, data: result };
  } catch (e) {
    return problemState(e, fd) as FormState<T>;
  }
}

/** Refuses work a role may not do here, in plain words. */
export function need(allowed: boolean, what: string, who = "the store keeper") {
  if (!allowed) throw new InventoryProblem(`Your role cannot ${what}. Ask ${who}.`);
}

/* ---------- Reading form fields ---------- */

export function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function id(fd: FormData, key: string, what = "record") {
  const v = str(fd, key);
  if (!UUID_RE.test(v)) throw new InventoryProblem(`Choose the ${what}.`, key);
  return v;
}

export function optionalId(fd: FormData, key: string) {
  const v = str(fd, key);
  return UUID_RE.test(v) ? v : null;
}

export function ids(fd: FormData, key: string) {
  return [...new Set(fd.getAll(key).filter((x): x is string => typeof x === "string" && UUID_RE.test(x.trim())).map((x) => x.trim()))];
}

export function text(fd: FormData, key: string, label: string, { min = 1, max = 200 }: { min?: number; max?: number } = {}) {
  const v = str(fd, key).replace(/\s+/g, " ");
  if (v.length < min) throw new InventoryProblem(min > 1 ? `${label} needs at least ${min} characters.` : `${label} is needed.`, key);
  if (v.length > max) throw new InventoryProblem(`${label} can be at most ${max} characters.`, key);
  return v;
}

export function maybe(fd: FormData, key: string, label: string, max = 500) {
  const v = str(fd, key).replace(/[ \t]+/g, " ");
  if (!v) return null;
  if (v.length > max) throw new InventoryProblem(`${label} can be at most ${max} characters.`, key);
  return v;
}

export function int(fd: FormData, key: string, label: string, { min = 0, max = 1_000_000, fallback }: { min?: number; max?: number; fallback?: number } = {}) {
  const raw = str(fd, key).replace(/,/g, "");
  if (!raw && fallback !== undefined) return fallback;
  const n = Number(raw);
  if (!raw) throw new InventoryProblem(`${label} is needed.`, key);
  if (!Number.isInteger(n)) throw new InventoryProblem(`${label} must be a whole number.`, key);
  if (n < min) throw new InventoryProblem(min === 1 ? `${label} must be at least 1.` : `${label} cannot be less than ${min}.`, key);
  if (n > max) throw new InventoryProblem(`${label} can be at most ${max.toLocaleString("en-IN")}.`, key);
  return n;
}

export function optionalInt(fd: FormData, key: string, label: string, opts: { min?: number; max?: number } = {}) {
  return str(fd, key) ? int(fd, key, label, opts) : null;
}

/** A rupee amount typed in a form, as paise. */
export function money(fd: FormData, key: string, label: string, { required = true }: { required?: boolean } = {}): bigint | null {
  const raw = str(fd, key).replace(/[₹,\s]/g, "");
  if (!raw) {
    if (required) throw new InventoryProblem(`${label} is needed.`, key);
    return null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new InventoryProblem(`${label} must be an amount in rupees, like 120.`, key);
  const [r, p = ""] = raw.split(".");
  const v = BigInt(r) * BigInt(100) + BigInt((p + "00").slice(0, 2));
  if (v > BigInt(1_000_000_000)) throw new InventoryProblem(`${label} is more than ₹1 crore: check the amount.`, key);
  return v;
}

export function isoDate(fd: FormData, key: string, label: string, { required = true }: { required?: boolean } = {}): Date | null {
  const raw = str(fd, key);
  if (!raw) {
    if (required) throw new InventoryProblem(`${label} is needed.`, key);
    return null;
  }
  const d = new Date(`${raw}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) throw new InventoryProblem(`${label} is not a real date.`, key);
  return d;
}

export const on = (fd: FormData, key: string) => ["on", "true", "1", "yes"].includes(str(fd, key).toLowerCase());

/** Item lines sent as itemId[] and qty[] (same order); empty rows are left out. */
export function lines(fd: FormData, { min = 1, label = "item" }: { min?: number; label?: string } = {}) {
  const itemIds = fd.getAll("itemId").map((x) => (typeof x === "string" ? x.trim() : ""));
  const qtys = fd.getAll("qty").map((x) => (typeof x === "string" ? x.trim().replace(/,/g, "") : ""));
  const prices = fd.getAll("price").map((x) => (typeof x === "string" ? x.trim() : ""));
  const out: { itemId: string; qty: number; price: string }[] = [];
  const seen = new Set<string>();
  itemIds.forEach((itemId, i) => {
    if (!itemId && !qtys[i]) return;
    if (!UUID_RE.test(itemId)) throw new InventoryProblem(`Choose the ${label} on line ${i + 1}.`, "lines");
    const n = Number(qtys[i]);
    if (!Number.isInteger(n) || n < 1) throw new InventoryProblem(`Quantity on line ${i + 1} must be a whole number of at least 1.`, "lines");
    if (n > 100_000) throw new InventoryProblem(`Quantity on line ${i + 1} is too large: check it.`, "lines");
    if (seen.has(itemId)) throw new InventoryProblem(`The same ${label} is on two lines. Put it on one line.`, "lines");
    seen.add(itemId);
    out.push({ itemId, qty: n, price: prices[i] ?? "" });
  });
  if (out.length < min) throw new InventoryProblem(min > 1 ? `Add at least ${min} ${label}s.` : `Add at least one ${label}.`, "lines");
  return out;
}
