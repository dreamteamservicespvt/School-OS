// Message Settings (11-communication.md §6): one row per school, read with
// defaults so a school that never opened the page still works sensibly.
import "server-only";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";

export const BACKUP_TYPES = ["fee", "attendance", "result"] as const;
export type BackupType = (typeof BACKUP_TYPES)[number];
export const BACKUP_TYPE_LABEL: Record<BackupType, string> = { fee: "Fee messages", attendance: "Attendance messages", result: "Result messages" };

export const QUERY_TYPES = ["query", "complaint", "suggestion", "feedback"] as const;
export type QueryType = (typeof QUERY_TYPES)[number];

const backup = z.object({ on: z.boolean().default(false), waitMinutes: z.number().int().min(15).max(24 * 60).default(120) }).default({});

const schema = z.object({
  /** Failed deliveries can be retried this many times (inferred: 3). */
  retryLimit: z.number().int().min(1).max(5).default(3),
  /** SMS backup per message type; default off until the school turns it on (inferred). */
  smsBackup: z.object({ fee: backup, attendance: backup, result: backup }).default({}),
  /** Which notices need approval before publishing (inferred default: notices to parents). */
  noticeApproval: z.enum(["parents", "all", "none"]).default("parents"),
  /** Response-time targets per query type, in hours (optional, larger schools). */
  queryTargets: z.object({
    on: z.boolean().default(false),
    hours: z.object({ query: z.number().int().min(1).default(48), complaint: z.number().int().min(1).default(24), suggestion: z.number().int().min(1).default(72), feedback: z.number().int().min(1).default(72) }).default({}),
    escalateToId: z.string().uuid().nullable().default(null),
  }).default({}),
  /** Satisfaction rating request after a query is closed (optional). */
  queryRating: z.boolean().default(false),
  parentLink: z.object({
    on: z.boolean().default(true),
    /** What the guardian's page shows, by section key; missing keys are on. */
    shows: z.record(z.string(), z.boolean()).default({}),
    autoSendOnAdmission: z.boolean().default(true),
    /** One-time code valid for (inferred: 10 minutes). */
    codeMinutes: z.number().int().min(5).max(30).default(10),
    /** A confirmed phone stays confirmed for (inferred: 180 days). */
    deviceDays: z.number().int().min(7).max(365).default(180),
  }).default({}),
});

export type MessageSettingsValue = z.infer<typeof schema>;

export function parseSettings(raw: unknown): MessageSettingsValue {
  const r = schema.safeParse(raw ?? {});
  return r.success ? r.data : schema.parse({});
}

export async function messageSettings(tx: Tx, ctx: SchoolContext): Promise<MessageSettingsValue> {
  const row = await tx.messageSettings.findUnique({ where: { schoolId: ctx.schoolId } });
  return parseSettings(row?.settings);
}

/** Saves a change to one part of the settings and returns before and after for the audit line. */
export async function updateSettings(tx: Tx, ctx: SchoolContext, change: (s: MessageSettingsValue) => MessageSettingsValue) {
  const before = await messageSettings(tx, ctx);
  const after = parseSettings(change(structuredClone(before)));
  const json = after as unknown as Prisma.InputJsonValue;
  await tx.messageSettings.upsert({
    where: { schoolId: ctx.schoolId },
    create: { schoolId: ctx.schoolId, settings: json, updatedById: ctx.userId },
    update: { settings: json, updatedById: ctx.userId },
  });
  return { before, after };
}
