import { prisma } from "@/lib/db";

// Version 1 of the internal API (08-platform-security.md §7). Each version is
// numbered so an older phone app keeps working after an update.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, api: 1 });
  } catch {
    return Response.json({ ok: false, api: 1, problem: "The database is not answering." }, { status: 503 });
  }
}
