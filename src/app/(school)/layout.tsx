import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isPaused, pausedAdmin, requireCurrent } from "@/lib/current";
import { planBanner, schoolPlanState } from "@/lib/console/school-billing";
import { shellData } from "@/lib/shell-data";
import { AppShell } from "@/components/shell/app-shell";
import { RecentPages } from "@/components/shell/search-box";
import { SchoolColour } from "@/components/shell/school-colour";
import { Toast } from "@/components/ui/toast";
import { readFlash } from "@/lib/flash";
import { undoChange } from "./undo-action";
import { activeSystemNotices } from "@/lib/errors";
import { withSchool } from "@/lib/db";
import { PAGE_PATH_HEADER, recordMissing } from "@/lib/record-gate";
import { myPhotoLink } from "@/lib/profile-photo";
import { currentYear } from "@/lib/academic/years";
import { cleanTheme } from "@/lib/theme";
import { cx } from "@/components/ui/cx";
import { Info, Lock, TriangleAlert } from "lucide-react";

export const dynamic = "force-dynamic";

/** "5 min", "2 h", "3 d": how long ago, for the notifications panel. */
function ago(d: Date) {
  const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (m < 1) return "Now";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  // A paused school: only its School Admin or Principal gets this far, for Settings (the data download).
  const current = await requireCurrent({ paused: "admin" });
  const admin = pausedAdmin(current);
  // On a full page load, a record that is not in this school answers 404 before the page streams (QA PLATFORM-17).
  const pagePath = (await headers()).get(PAGE_PATH_HEADER);
  const [shell, flashed, notices, { missing, year, notes }, plan] = await Promise.all([
    shellData(current),
    readFlash(),
    activeSystemNotices(),
    withSchool(current.ctx, async (tx) => ({
      missing: await recordMissing(tx, pagePath),
      year: await currentYear(tx, current.ctx),
      notes: await tx.notification.findMany({
        where: { userLoginId: current.user.id },
        orderBy: [{ readAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
        take: 8,
        select: { id: true, text: true, createdAt: true, readAt: true },
      }),
    })),
    admin ? schoolPlanState(current.school.id).catch(() => null) : Promise.resolve(null),
  ]);
  if (missing) notFound();
  const banner = isPaused(current)
    ? { tone: "problem" as const, text: "School OS for this school is paused. You can still pay or download the school's data.", payUrl: null, href: "/paused" }
    : planBanner(plan);

  return (
    <AppShell
      school={{ id: current.school.id, name: current.school.name, place: shell.place }}
      schools={current.schools.map((s) => ({ id: s.id, name: s.name }))}
      year={year ? { name: year.name, closed: year.status === "CLOSED" } : null}
      person={{ id: current.user.id, name: current.user.displayName, role: current.roles[0]?.name ?? "", photo: await withSchool(current.ctx, (tx) => myPhotoLink(tx, current.ctx, current.user.id)).catch(() => null) }}
      menu={shell.menu.map((m) => m.key)}
      bottom={shell.bottom}
      quick={shell.quick}
      pages={shell.pages}
      shortcuts={shell.shortcuts}
      approvals={shell.approvals}
      canApprove={shell.canApprove}
      canMessage
      unread={shell.unread}
      notes={notes.map((n) => ({ id: n.id, text: n.text, when: ago(n.createdAt), unread: !n.readAt }))}
      theme={cleanTheme(current.user.theme)}
    >
      <RecentPages userId={current.user.id} pages={shell.pages} />
      <SchoolColour accent={current.school.accent} />
      {notices.map((n) => {
        const I = n.level === "problem" ? TriangleAlert : n.level === "info" ? Info : Lock;
        return (
          <div key={n.id} role="status" className={cx("border-b px-4 md:px-6 py-2.5 flex items-center gap-3 text-[13.5px]",
            n.level === "problem" ? "bg-bad/10 border-bad/25" : n.level === "info" ? "bg-info/10 border-info/25" : "bg-warn/15 border-warn/30")}>
            <I size={16} className={cx("shrink-0", n.level === "problem" ? "text-bad" : n.level === "info" ? "text-info" : "text-warn")} aria-hidden="true" />
            <p className="flex-1 min-w-0">{n.message}</p>
          </div>
        );
      })}
      {banner && (
        <div role="status" className={cx("border-b px-4 md:px-6 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px]",
          banner.tone === "problem" ? "bg-bad/10 border-bad/25" : banner.tone === "info" ? "bg-info/10 border-info/25" : "bg-warn/15 border-warn/30")}>
          <Info size={16} className={cx("shrink-0", banner.tone === "problem" ? "text-bad" : banner.tone === "info" ? "text-info" : "text-warn")} aria-hidden="true" />
          <p className="flex-1 min-w-0">{banner.text}</p>
          {"href" in banner ? <Link href={banner.href} className="font-semibold text-brand hover:underline">See what to do</Link>
            : banner.payUrl ? <a href={banner.payUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">Pay now</a> : null}
        </div>
      )}
      <main id="main" className="w-full max-w-[1400px] mx-auto px-4 md:px-6 xl:px-8 py-5 md:py-7 pb-28 md:pb-10 animate-rise">{children}</main>
      <Toast key={flashed ? JSON.stringify(flashed) : "none"} flash={flashed} undoAction={undoChange} />
    </AppShell>
  );
}
