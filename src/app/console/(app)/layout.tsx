import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireConsole } from "@/lib/console/current";
import { roleLabel } from "@/lib/console/roles";
import { withConsole } from "@/lib/db";
import { readFlash } from "@/lib/flash";
import { THEME_COOKIE, cleanTheme } from "@/lib/theme";
import { ConsoleShell } from "@/components/console/console-shell";
import { ConsoleColour } from "@/components/console/console-colour";
import { Toast } from "@/components/ui/toast";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Console", template: "%s · School OS Console" }, robots: { index: false, follow: false } };

function ago(d: Date) {
  const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (m < 1) return "Now";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const c = await requireConsole();
  const [data, flashed, jar] = await Promise.all([
    withConsole(async (tx) => ({
      schools: await tx.consoleSchool.count({ where: { status: { not: "CLOSED" } } }),
      unread: await tx.consoleNotification.count({ where: { userId: c.user.id, readAt: null } }),
      notes: await tx.consoleNotification.findMany({ where: { userId: c.user.id }, orderBy: [{ readAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], take: 10 }),
    })),
    readFlash(),
    cookies(),
  ]);
  return (
    <ConsoleShell
      person={{ name: c.user.name, role: roleLabel(c.user.role), phone: c.user.phone }}
      can={{ add: c.can("add"), team: c.can("team"), messaging: c.can("messaging") }}
      schoolCount={data.schools}
      unread={data.unread}
      notes={data.notes.map((n) => ({ id: n.id, text: n.text, when: ago(n.createdAt), unread: !n.readAt, tone: n.tone }))}
      theme={cleanTheme(jar.get(THEME_COOKIE)?.value)}
    >
      <ConsoleColour />
      <main id="main" className="w-full max-w-[1400px] mx-auto px-4 md:px-6 xl:px-8 py-5 md:py-7 pb-28 md:pb-10 animate-rise">{children}</main>
      <Toast key={flashed ? JSON.stringify(flashed) : "none"} flash={flashed} />
    </ConsoleShell>
  );
}
