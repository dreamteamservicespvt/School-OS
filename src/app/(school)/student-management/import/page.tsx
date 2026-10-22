import type { Metadata } from "next";
import { History } from "lucide-react";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PLACES } from "@/lib/imports/places";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { ImportHome } from "@/components/import/import-home";
import { BASE, studentPage } from "../_lib/page";
import { sectionOptions } from "../_lib/queries";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Import students" };

const ABOUT = {
  students: "One row per student, with their class, section and parents: the ready sheet, your own sheet, an export from your old software or the UDISE+ download. Old admission numbers are kept. A row that may already be on record waits for your choice: the same student (update the record here), the same family, or a new student.",
  "students-update": "Changes to students already here: a sheet with the admission number and the columns to correct, such as phones or addresses. Empty cells are left as they are, every change is listed before saving, and Undo puts the old values back.",
};

/** Workflow 15, step 3: students and parents, on the same engine as Switching to School OS (P10). */
export default async function ImportPage({ searchParams }: { searchParams: Promise<{ section?: string; kind?: string }> }) {
  const { current, yearIds, can } = await studentPage();
  if (!can.manage) redirect(BASE);
  const sp = await searchParams;
  const sections = await withSchool(current.ctx, (tx) => sectionOptions(tx, current, yearIds));
  return (
    <>
      <BackLink href={BASE} label="Students" />
      <PageHeader title="Import students" href={`${BASE}/import`} userId={current.user.id}>
        <ButtonLink href={`${BASE}/import/history`} variant="ghost" icon={History}><Words k="Import history" /></ButtonLink>
      </PageHeader>
      <ImportHome current={current} place={PLACES.students} initial={sp.kind} about={ABOUT}
        students={{ sections: sections.map((s) => ({ value: s.value, label: `${s.label} (${s.filled} of ${s.seats})` })), sectionId: sp.section }} />
    </>
  );
}
