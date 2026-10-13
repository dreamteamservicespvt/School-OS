"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withConsole } from "@/lib/db";
import { CONSOLE_COOKIE, endConsoleSession } from "@/lib/console/auth";
import { clearConsoleCookie, requireConsole } from "@/lib/console/current";
import { STATUS_LABEL, schoolPhoneDigits } from "@/lib/console/schools";
import { THEME_COOKIE, cleanTheme } from "@/lib/theme";

export async function consoleSignOut() {
  const token = (await cookies()).get(CONSOLE_COOKIE)?.value;
  await endConsoleSession(token, "signed-out");
  await clearConsoleCookie();
  redirect("/console/sign-in?out=1");
}

export async function consoleTheme(theme: string) {
  await requireConsole();
  (await cookies()).set(THEME_COOKIE, cleanTheme(theme), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

export type SchoolHit = { id: string; name: string; code: string; city: string | null; status: string };

/** Searches schools only (name, city, phone, school code, admin name). Never students, fees or staff. */
export async function searchSchools(q: string): Promise<SchoolHit[]> {
  await requireConsole();
  const t = q.trim().slice(0, 80);
  const digits = schoolPhoneDigits(t) ?? (t.replace(/\D/g, "").length >= 4 ? t.replace(/\D/g, "") : null);
  const rows = await withConsole((tx) =>
    tx.consoleSchool.findMany({
      where: t
        ? { OR: [{ name: { contains: t, mode: "insensitive" } }, { city: { contains: t, mode: "insensitive" } }, { code: { contains: t, mode: "insensitive" } }, { adminName: { contains: t, mode: "insensitive" } }, ...(digits ? [{ phoneDigits: { contains: digits } }, { adminPhone: { contains: digits.slice(-5) } }] : [])] }
        : { status: { in: ["TRIAL", "SUSPENDED"] } },
      orderBy: t ? { name: "asc" } : { statusSince: "desc" },
      take: t ? 6 : 4,
      select: { id: true, name: true, code: true, city: true, status: true },
    }),
  );
  return rows.map((r) => ({ ...r, status: STATUS_LABEL[r.status] }));
}

export async function markConsoleNotesRead() {
  const c = await requireConsole();
  await withConsole((tx) => tx.consoleNotification.updateMany({ where: { userId: c.user.id, readAt: null }, data: { readAt: new Date() } }));
  revalidatePath("/console", "layout");
}

export async function openConsoleNote(fd: FormData) {
  const c = await requireConsole();
  const id = String(fd.get("id") ?? "");
  const note = /^[0-9a-f-]{36}$/i.test(id) ? await withConsole((tx) => tx.consoleNotification.findFirst({ where: { id, userId: c.user.id } })) : null;
  if (!note) redirect("/console");
  if (!note.readAt) await withConsole((tx) => tx.consoleNotification.update({ where: { id }, data: { readAt: new Date() } }));
  redirect(note.link && note.link.startsWith("/console") ? note.link : "/console");
}
