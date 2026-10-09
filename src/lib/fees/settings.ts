// Fee Settings (06 §6): late fee rules, reminders, receipt numbering, ageing
// groups, verification, gateway routing, counter permissions and the
// optional parts (School Feature records).
import "server-only";

import type { FeeSetting } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { DEFAULT_AGEING, DEFAULT_REMINDER_TEMPLATE, FEE_FEATURES, type AgeingGroup, type CounterPermission, type FeeFeature } from "./words";

/** Roles that hold each counter permission until the school changes it: those with full Fee Management (inferred). */
export const DEFAULT_COUNTER_ROLES = ["principal", "school-admin", "accountant"];

/** Makes the school's Fee Settings and the two heads the software uses itself. Safe to run twice. */
export async function ensureFeeDefaults(tx: Tx, ctx: SchoolContext) {
  const s = await tx.feeSetting.findUnique({ where: { schoolId: ctx.schoolId } });
  if (!s) {
    const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { code: true } });
    await tx.feeSetting.create({
      data: {
        schoolId: ctx.schoolId,
        receiptPrefix: `${school?.code ?? "RC"}/{YEAR}/`,
        reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
        ageingGroups: DEFAULT_AGEING.map((g) => ({ ...g })),
      },
    });
  }
  for (const [key, name] of [["late-fee", "Late fee"], ["old-dues", "Old dues"]] as const) {
    const head = await tx.feeHead.findFirst({ where: { schoolId: ctx.schoolId, systemKey: key } });
    if (!head) {
      const clash = await tx.feeHead.findUnique({ where: { schoolId_name: { schoolId: ctx.schoolId, name } } });
      if (clash) await tx.feeHead.update({ where: { id: clash.id }, data: { systemKey: key, archivedAt: null } });
      else await tx.feeHead.create({ data: { schoolId: ctx.schoolId, name, kind: "miscellaneous", systemKey: key, lateFeeApplies: false, sortOrder: 900 } });
    }
  }
}

export type FeeSettings = FeeSetting & {
  ageing: AgeingGroup[];
  routing: { default: string | null; byClass: Record<string, string> };
  counter: Record<CounterPermission, string[]>;
};

export async function feeSettings(tx: Tx, ctx: SchoolContext): Promise<FeeSettings> {
  await ensureFeeDefaults(tx, ctx);
  const s = await tx.feeSetting.findUniqueOrThrow({ where: { schoolId: ctx.schoolId } });
  return withParsed(s);
}

export function withParsed(s: FeeSetting): FeeSettings {
  const ageing = Array.isArray(s.ageingGroups) && (s.ageingGroups as unknown[]).length ? (s.ageingGroups as AgeingGroup[]) : DEFAULT_AGEING.map((g) => ({ ...g }));
  const r = (s.gatewayRouting ?? {}) as { default?: string | null; byClass?: Record<string, string> };
  const c = (s.counterPermissions ?? {}) as Partial<Record<CounterPermission, string[]>>;
  const counter = {} as Record<CounterPermission, string[]>;
  for (const key of ["give-discount", "waive-late-fee", "change-payment-date", "manage-structure", "assign-fees", "edit-student-fees"] as CounterPermission[]) {
    counter[key] = Array.isArray(c[key]) ? c[key]! : DEFAULT_COUNTER_ROLES;
  }
  return { ...s, ageing, routing: { default: r.default ?? null, byClass: r.byClass ?? {} }, counter };
}

/** May a person with these roles use a counter permission (give discount, waive late fee...)? */
export function counterAllowed(settings: Pick<FeeSettings, "counter">, roleKeys: readonly (string | null)[], perm: CounterPermission) {
  const allowed = settings.counter[perm] ?? DEFAULT_COUNTER_ROLES;
  return roleKeys.some((k) => k !== null && allowed.includes(k));
}

export async function feeFeaturesOn(tx: Tx, ctx: SchoolContext): Promise<Set<FeeFeature>> {
  const rows = await tx.schoolFeature.findMany({ where: { schoolId: ctx.schoolId, isOn: true, featureKey: { in: FEE_FEATURES.map((f) => f.key) } } });
  return new Set(rows.map((r) => r.featureKey as FeeFeature));
}

export async function featureOn(tx: Tx, ctx: SchoolContext, key: FeeFeature | string) {
  const f = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } } });
  return Boolean(f?.isOn);
}

/** Which ageing group a number of days overdue falls in. */
export function ageingGroupOf(groups: AgeingGroup[], days: number): AgeingGroup | null {
  return groups.find((g) => days >= g.from && (g.to === null || days <= g.to)) ?? null;
}

/** The gateway a student's class uses (Fee Settings routing), else the default, else the first switched-on Razorpay. */
export async function gatewayFor(tx: Tx, ctx: SchoolContext, classId: string | null) {
  const s = await feeSettings(tx, ctx);
  const chosen = (classId && s.routing.byClass[classId]) || s.routing.default;
  if (chosen) {
    const g = await tx.paymentGatewayAccount.findFirst({ where: { id: chosen, archivedAt: null, isActive: true } });
    if (g) return g;
  }
  return tx.paymentGatewayAccount.findFirst({ where: { schoolId: ctx.schoolId, provider: "razorpay", isActive: true, archivedAt: null }, orderBy: { createdAt: "asc" } });
}
