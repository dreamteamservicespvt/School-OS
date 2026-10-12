import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { BASE, studentPage } from "../_lib/page";
import { sectionOptions } from "../_lib/queries";
import { chosenStudents } from "../bulk-update/chosen";
import { LoginsForm } from "./logins-form";

export const metadata: Metadata = { title: "Student logins" };

/** Student logins (optional): a username and a set-password link for each chosen student. */
export default async function StudentLoginsPage({ searchParams }: { searchParams: Promise<{ ids?: string; section?: string }> }) {
  const { current, settings, year, can } = await studentPage();
  if (!can.manage) redirect(BASE);
  const sp = await searchParams;
  const data = await withSchool(current.ctx, async (tx) => ({
    students: settings.studentLoginsOn ? await chosenStudents(tx, current, year?.id ?? null, sp) : [],
    sections: await sectionOptions(tx, current, year?.id),
  }));
  return (
    <>
      <BackLink href={BASE} label="Students" />
      <PageHeader title="Student logins" href={`${BASE}/logins`} userId={current.user.id} />
      {!settings.studentLoginsOn ? (
        <Card className="max-w-2xl"><CardBody><p>Student logins are switched off. Switch them on in <Link className="font-medium text-brand-text underline" href={`${BASE}/settings`}>Student Settings</Link>.</p></CardBody></Card>
      ) : (
        <div className="max-w-3xl space-y-4">
          <Card>
            <CardHeader title={data.students.length ? `${data.students.length} students chosen` : "Choose the students"} description="Students who already have a login get a new set-password link; their username stays." />
            <CardBody className="space-y-4">
              {!sp.ids && (
                <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <SelectField name="section" label="Section" defaultValue={sp.section ?? ""} placeholder="Choose…" options={data.sections.map((s) => ({ value: s.value, label: `${s.label} (${s.filled})` }))} />
                  <Button type="submit" variant="secondary">Show</Button>
                </form>
              )}
              {data.students.length > 0 && (
                <>
                  <p className="text-[15px] text-ink-2">{data.students.slice(0, 12).map((s) => s.name).join(", ")}{data.students.length > 12 ? ` and ${data.students.length - 12} more` : ""}.</p>
                  <LoginsForm ids={data.students.map((s) => s.id)} />
                </>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
