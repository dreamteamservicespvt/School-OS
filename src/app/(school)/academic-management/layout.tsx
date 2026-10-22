import { Suspense } from "react";
import { requirePage } from "@/lib/current";
import { reachFor } from "@/lib/permissions";
import { arrangesTimetable } from "@/lib/academic/scope";
import { AcademicTabs, type AcademicTab } from "./_components/academic-tabs";

const BASE = "/academic-management";

export default async function AcademicLayout({ children }: { children: React.ReactNode }) {
  const current = await requirePage("academic-management");
  const manage = reachFor(current.permissions, "academic-management", "edit") === "all";
  // Teachers (own reach) have Time Table and Syllabus only; their duties show on the Time Table.
  const own = reachFor(current.permissions, "academic-management", "view") === "own";
  const all: AcademicTab[] = [
    { href: BASE, label: "Classes & Sections", exact: true },
    { href: `${BASE}/subjects`, label: "Subjects" },
    { href: `${BASE}/teacher-allocation`, label: "Teacher Allocation" },
    { href: `${BASE}/time-table`, label: "Time Table" },
    { href: `${BASE}/substitutions`, label: "Substitutions" },
    { href: `${BASE}/syllabus`, label: "Syllabus & Lesson Plans" },
    ...(manage ? [{ href: `${BASE}/settings`, label: "Academic Settings" }] : []),
  ];
  // Office Staff (Own, 05-roles.md) arrange substitutions and keep the Time Table: they see the classes too.
  const arranger = own && arrangesTimetable(current);
  const ownTabs = arranger ? [BASE, `${BASE}/time-table`, `${BASE}/substitutions`] : [`${BASE}/time-table`, `${BASE}/syllabus`];
  const tabs = own ? all.filter((t) => ownTabs.includes(t.href)) : all;
  return (
    <>
      <Suspense fallback={<div className="mb-5 h-11 border-b border-line" />}>
        <AcademicTabs tabs={tabs} />
      </Suspense>
      {children}
    </>
  );
}
