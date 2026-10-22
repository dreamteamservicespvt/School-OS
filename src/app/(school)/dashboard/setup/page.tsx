import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSpreadsheet, FileUp } from "lucide-react";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { setupProgress, setupSteps } from "@/lib/dashboard/setup";
import { longDay, moduleOpen, n, reach } from "@/lib/dashboard/common";
import { todayFor } from "@/lib/periods";
import { Band } from "@/components/ui/band";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Meter, Ring } from "@/components/ui/display";
import { StepList } from "./step-list";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Setup checklist" };

export default async function SetupPage() {
  const current = await requirePage("dashboard");
  // Only the School Admin and the Principal set the school up (01 §2).
  if (!moduleOpen(current, "settings") || reach(current, "settings", "edit") !== "all") redirect("/dashboard?view=dashboard");

  const { steps, staff, signedIn, students } = await withSchool(current.ctx, async (tx) => {
    const logins = await tx.staff.findMany({ where: { archivedAt: null, status: "ACTIVE", userLoginId: { not: null } }, select: { userLoginId: true } });
    return {
      steps: await setupSteps(tx, current.ctx, current),
      staff: logins.length,
      signedIn: logins.length ? await tx.userLogin.count({ where: { id: { in: logins.map((l) => l.userLoginId!) }, lastSignInAt: { not: null } } }) : 0,
      students: await tx.student.count({ where: { archivedAt: null, status: { in: ["ADMITTED", "ACTIVE", "PROMOTED"] } } }),
    };
  });
  const p = setupProgress(steps);
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const canStaff = moduleOpen(current, "staff-hr-management", "create");
  const canStudents = moduleOpen(current, "student-management", "create");

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-ink3">{longDay(todayFor(current.school.timeZone))}</p>
          <h1 className="font-display text-[26px] md:text-[32px] font-semibold tracking-tight leading-tight mt-0.5"><Words k="Welcome," /> {current.user.displayName.split(" ")[0]}</h1>
          <p className="text-[15px] text-ink3 mt-1"><Words k="Let’s get" /> {current.school.name} <Words k="ready. Most schools finish in a week." /></p>
        </div>
        <ButtonLink href="/dashboard?view=dashboard" variant="secondary"><Words k="Open the Dashboard" /></ButtonLink>
      </div>

      <Band label="Setup" items={[
        { key: "setup", label: "Setup", big: `${p.done}`, of: `of ${p.total} done`, foot: p.next ? `Next: ${p.next.label}` : "All steps done" },
        ...(moduleOpen(current, "staff-hr-management") ? [{ key: "staff", label: "Staff logins", big: n(staff), foot: `${n(signedIn)} ${signedIn === 1 ? "has" : "have"} signed in`, href: "/staff-hr-management" }] : []),
        ...(moduleOpen(current, "student-management") ? [{ key: "students", label: "Students", big: n(students), foot: "Studying this year", href: "/student-management" }] : []),
      ]} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 lg:gap-6 items-start">
        <Card className="min-w-0">
          <div className="px-5 pt-5 pb-4 flex items-center gap-4">
            <Ring value={pct} size={68} stroke={7}><span className="font-display font-semibold text-[17px] tnum">{p.done}/{p.total}</span></Ring>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-[16px]"><Words k="Setup checklist" /></h2>
              <p className="text-[13px] text-ink3">{p.done} <Words k="of" /> {p.total} <Words k="done. Each step opens the right page. Come back here from the Dashboard." /></p>
              <Meter value={pct} tone="brand" className="mt-2.5" />
            </div>
          </div>
          <StepList steps={steps.map((s) => ({ key: s.key, label: s.label, href: s.href, sub: s.sub, time: s.time, button: s.button, optional: Boolean(s.optional), done: s.done, doneNote: s.doneNote, skipped: s.skipped }))} nextKey={p.next?.key ?? null} />
        </Card>
        {(canStaff || canStudents) && (
          <Card>
            <CardHeader title="Coming from other software?" icon={FileUp} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <p className="text-[14px] text-ink2"><Words k="Bring students and staff from Excel. Every row is checked before anything is added." /></p>
              {canStudents && <ButtonLink href="/student-management/import" variant="secondary" icon={FileSpreadsheet}><Words k="Import students" /></ButtonLink>}
              {canStaff && <ButtonLink href="/staff-hr-management/import" variant="secondary" icon={FileSpreadsheet}><Words k="Import staff" /></ButtonLink>}
              <p className="text-[12.5px] text-ink3"><Words k="Need help? See" /> <Link href="/settings" className="text-brand font-semibold hover:underline"><Words k="Settings" /></Link> <Words k="for everything set up so far." /></p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
