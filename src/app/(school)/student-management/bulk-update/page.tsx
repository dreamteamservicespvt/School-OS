import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { ActionForm, FormSelect } from "@/components/students/action-form";
import { readField } from "@/lib/students/bulk";
import { BULK_FIELDS } from "@/lib/students/labels";
import { BASE, studentPage } from "../_lib/page";
import { sectionOptions } from "../_lib/queries";
import { bulkSectionAction } from "../_actions/bulk";
import { BulkFieldForm } from "./bulk-field-form";
import { chosenStudents } from "./chosen";

export const metadata: Metadata = { title: "Bulk field update" };

/** Bulk field update and bulk section change for students chosen on the Student List, or a whole section. */
export default async function BulkUpdatePage({ searchParams }: { searchParams: Promise<{ ids?: string; section?: string; field?: string }> }) {
  const { current, year, can } = await studentPage();
  if (!can.manage) redirect(BASE);
  const sp = await searchParams;
  const fields = BULK_FIELDS.filter((f) => can.seeRestricted || !["apaarId", "pen"].includes(f.key));
  const field = sp.field === "section" ? "section" : fields.find((f) => f.key === sp.field)?.key ?? null;
  const data = await withSchool(current.ctx, async (tx) => {
    const students = await chosenStudents(tx, current, year?.id ?? null, sp);
    const withValues = field && field !== "section"
      ? await Promise.all(students.map(async (s) => ({ ...s, current: await readField(tx, field, s.id, year?.id ?? null) })))
      : students.map((s) => ({ ...s, current: null }));
    return { students: withValues, sections: await sectionOptions(tx, current, year?.id) };
  });
  const keep = [sp.ids ? ["ids", sp.ids] : null, sp.section ? ["section", sp.section] : null].filter((x): x is string[] => Boolean(x));
  const meta = fields.find((f) => f.key === field);
  const classIds = new Set(data.students.map((s) => s.classId).filter(Boolean));

  return (
    <>
      <BackLink href={BASE} label="Students" />
      <PageHeader title={field === "section" ? "Change section" : "Bulk field update"} href={`${BASE}/bulk-update`} userId={current.user.id} />
      <div className="space-y-4">
        <Card>
          <CardHeader title={data.students.length ? `${data.students.length} students chosen` : "Choose the students"} description={data.students.length ? undefined : "Tick students on the Student List and choose Update a field, or take a whole section here."} />
          <CardBody>
            <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              {sp.ids && <input type="hidden" name="ids" value={sp.ids} />}
              {!sp.ids && <SelectField name="section" label="Section" defaultValue={sp.section ?? ""} placeholder="Choose…" options={data.sections.map((s) => ({ value: s.value, label: `${s.label} (${s.filled})` }))} />}
              <SelectField name="field" label="What to change" defaultValue={field ?? ""} placeholder="Choose…" options={[{ value: "section", label: "Section (same class)" }, ...fields.map((f) => ({ value: f.key, label: f.label }))]} />
              <Button type="submit" variant="secondary">Show</Button>
            </form>
            {sp.ids && <p className="mt-2 text-[13.5px]"><Link className="font-semibold text-brand hover:underline" href={BASE}>Choose other students</Link></p>}
          </CardBody>
        </Card>

        {data.students.length > 0 && field === "section" && (
          <Card>
            <CardHeader title="Move to another section" description="Each student keeps their class history, roll number in the old section, and marks." />
            <CardBody>
              <ActionForm action={bulkSectionAction} submitLabel={`Move ${data.students.length} students`} pendingText="Moving…">
                {data.students.map((s) => <input key={s.id} type="hidden" name="ids" value={s.id} />)}
                <FormSelect name="toSectionId" label="New section" required placeholder="Choose…"
                  options={data.sections.filter((s) => classIds.size === 0 || classIds.has(s.classId)).map((s) => ({ value: s.value, label: `${s.label} (${s.filled} of ${s.seats})` }))} />
                <p className="text-[15px] text-ink2">{data.students.slice(0, 10).map((s) => s.name).join(", ")}{data.students.length > 10 ? ` and ${data.students.length - 10} more` : ""}.</p>
              </ActionForm>
            </CardBody>
          </Card>
        )}

        {data.students.length > 0 && meta && (
          <Card>
            <CardHeader title={`Change ${meta.label.toLowerCase()}`} description="Check shows each change and any problem first. Nothing is saved until you press Save." />
            <CardBody>
              <BulkFieldForm key={`${meta.key}-${keep.map((k) => k.join("=")).join("&")}`} field={meta.key} label={meta.label} help={meta.help} students={data.students.map((s) => ({ id: s.id, name: s.name, admissionNo: s.admissionNo, cls: s.cls, current: s.current }))} />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
