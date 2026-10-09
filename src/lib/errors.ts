// Recording errors without personal details (08-platform-security.md §11).
// Phone numbers, emails, long digit runs and ids are removed before saving.
import { prisma } from "./db";

const PATTERNS: [RegExp, string][] = [
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id"],
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]"],
  [/\+?\d[\d\s-]{7,}\d/g, "[number]"],
];

export function scrub(text: string): string {
  let out = text;
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  return out.slice(0, 2000);
}

export async function recordError(input: { source: "server" | "client" | "job" | "webhook"; where: string; error: unknown; digest?: string | null; schoolCode?: string | null }) {
  const message = input.error instanceof Error ? `${input.error.name}: ${input.error.message}` : String(input.error);
  try {
    await prisma.errorEvent.create({
      data: { source: input.source, where: scrub(input.where).slice(0, 300), message: scrub(message), digest: input.digest ?? null, schoolCode: input.schoolCode ?? null },
    });
  } catch {
    // Recording must never break the page that failed.
  }
  if (process.env.NODE_ENV !== "test") console.error(`[${input.source}] ${scrub(input.where)}: ${scrub(message)}`);
}

/** The banner shown to everyone while something is not working. */
export async function activeSystemNotices(now = new Date()) {
  try {
    return await prisma.systemNotice.findMany({
      where: { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      orderBy: { startsAt: "desc" },
      take: 3,
    });
  } catch {
    return [];
  }
}
