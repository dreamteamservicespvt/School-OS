import type { Metadata } from "next";
import { Download, History } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, FormCheck, FormChoice, FormFieldError, FormSelect } from "@/components/students/action-form";
import { BASE, studentPage } from "../_lib/page";
import { sectionOptions } from "../_lib/queries";
import { uploadImportAction } from "../_actions/import";
import { IMPORT_KINDS, MAX_IMPORT_ROWS } from "./load";
import { ImportSteps } from "./steps";

export const metadata: Metadata = { title: "Import students" };

/** Import (P10), steps 1 and 2: download the template, then upload the filled file. */
export default async function ImportPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { current, yearIds, can } = await studentPage();
  if (!can.manage) redirect(BASE);
  const sp = await searchParams;
  const sections = await withSchool(current.ctx, (tx) => sectionOptions(tx, current, yearIds));
  return (
    <>
      <BackLink href={BASE} label="Students" />
      <PageHeader title="Import students" href={`${BASE}/import`} userId={current.user.id}>
        <ButtonLink href={`${BASE}/import/history`} variant="ghost" icon={History}>Import history</ButtonLink>
      </PageHeader>
      <ImportSteps at={2} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Download the template" description="Fill one row per student. Columns marked * are required." />
          <CardBody className="flex flex-wrap gap-2">
            {IMPORT_KINDS.map((k) => <ButtonLink key={k.key} href={`${BASE}/import/template?kind=${k.key}`} icon={Download}>Template: {k.label}</ButtonLink>)}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Upload the file" description={`CSV or Excel, up to ${MAX_IMPORT_ROWS} rows and 10 MB.`} />
          <CardBody>
            <ActionForm action={uploadImportAction} submitLabel="Upload and continue" pendingText="Reading the file…">
              <FormChoice name="kind" label="What are you importing?" defaultValue={IMPORT_KINDS[0].key} options={IMPORT_KINDS.map((k) => ({ value: k.key, label: k.label, help: k.help }))} />
              <FormSelect name="sectionId" label="Class and section" defaultValue={sp.section ?? ""} placeholder="From the file's Class and Section columns"
                options={sections.map((s) => ({ value: s.value, label: `${s.label} (${s.filled} of ${s.seats})` }))} help="Used for rows with no class in the file." />
              <FormCheck name="applyFeePlan" label="Apply the class fee plan" help="Each student gets the fee plan of their class (Fee Management)." defaultChecked />
              <div>
                <label htmlFor="import-file" className="mb-1 block text-[13px] font-semibold text-ink2">File<span className="text-bad" aria-hidden="true"> *</span></label>
                <input id="import-file" name="file" type="file" required accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="block w-full rounded-xl border border-line bg-surface p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-brand/10 file:px-3 file:text-brand" />
                <FormFieldError name="file" />
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
