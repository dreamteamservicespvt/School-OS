import type { Metadata } from "next";
import { History } from "lucide-react";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PLACES } from "@/lib/imports/places";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { ImportHome } from "@/components/import/import-home";
import { BASE, studentPage, NO_ACCESS } from "../_lib/page";
import { sectionOptions } from "../_lib/queries";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Import students") };
}

const ABOUT = {
  // Layman loop 5: about 120 words before the upload box. One short line each.
  students: "One row per child, with class, section and parents. Your own sheet, an old software export or the UDISE+ download all work.",
  "consent-paper-forms": "One row per child, parent and consent signed on paper, with the date on the form.",
  "students-update": "Corrections to students already here: the admission number and the columns to change.",
};

/** Workflow 15, step 3: students and parents, on the same engine as Switching to School OS (P10). */
export default async function ImportPage({ searchParams }: { searchParams: Promise<{ section?: string; kind?: string }> }) {
  const { current, yearIds, can } = await studentPage();
  if (!can.manage) redirect(NO_ACCESS);
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
