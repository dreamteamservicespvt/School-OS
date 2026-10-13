// Bell notices for DREAM TEAM people (the console's Notifications panel).
import type { ConsoleRole } from "@prisma/client";
import type { Tx } from "../db";

/** Tells everyone active in these roles (and, when given, one more person). */
export async function notifyTeam(tx: Tx, input: { roles: ConsoleRole[]; alsoUserId?: string | null; text: string; link?: string | null; tone?: "info" | "ok" | "warn" | "bad" }) {
  const people = await tx.superAdminUser.findMany({ where: { status: "ACTIVE", archivedAt: null, OR: [{ role: { in: input.roles } }, ...(input.alsoUserId ? [{ id: input.alsoUserId }] : [])] }, select: { id: true } });
  if (people.length === 0) return 0;
  await tx.consoleNotification.createMany({ data: people.map((p) => ({ userId: p.id, text: input.text.slice(0, 400), link: input.link ?? null, tone: input.tone ?? "info" })) });
  return people.length;
}
