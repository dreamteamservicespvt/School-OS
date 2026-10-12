import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody } from "@/components/ui/card";
import { ActionForm, FormChoice, FormFieldError, FormSelect, FormText } from "@/components/students/action-form";
import { StudentPicker } from "@/components/students/student-picker";
import { loadVisibleStudent } from "@/lib/students/access";
import { BASE, studentPage, todayIso } from "../../_lib/page";
import { sectionOptions } from "../../_lib/queries";
import { startLeavingAction } from "../../_actions/leaving";

export const metadata: Metadata = { title: "Start leaving" };

/** Start leaving (03 §2): transfer or withdrawal with reason, last date, destination school and documents. */
export default async function StartLeavingPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const { current, settings, year, can, tz } = await studentPage();
  if (!can.manage) redirect(`${BASE}/leaving`);
  const sp = await searchParams;
  const data = await withSchool(current.ctx, async (tx) => {
    const sections = await sectionOptions(tx, current, year?.id);
    const s = sp.student && /^[0-9a-f-]{36}$/i.test(sp.student) ? await loadVisibleStudent(tx, current, sp.student).catch(() => null) : null;
    return { sections, initial: s ? [{ id: s.id, name: s.fullName, admissionNo: s.admissionNo, cls: "" }] : [] };
  });
  const back = sp.student ? `${BASE}/students/${sp.student}` : `${BASE}/leaving`;
  return (
    <>
      <BackLink href={back} label={sp.student ? "Student profile" : "Leaving & Alumni"} />
      <PageHeader title="Start leaving" href={`${BASE}/leaving/new`} userId={current.user.id} />
      <p className="-mt-3 mb-5 max-w-prose text-ink-2">Fee dues, library books and other items are checked first. The TC can be issued when every check is clear. The student&apos;s status changes on the last date.</p>
      <Card className="max-w-2xl">
        <CardBody>
          <ActionForm action={startLeavingAction} submitLabel="Start leaving" pendingText="Checking clearance…"
            footer={<Link href={back} className="inline-flex min-h-11 items-center rounded-lg px-4 font-medium text-brand-text hover:bg-surface-2">Cancel</Link>}>
            <StudentPicker name="studentId" label="Student" sections={data.sections.map((s) => ({ value: s.value, label: s.label }))} initial={data.initial} />
            <FormChoice name="type" label="Type" defaultValue="TRANSFER" options={[
              { value: "TRANSFER", label: "Transfer", help: "Going to another school" },
              { value: "WITHDRAWAL", label: "Withdrawal", help: "Leaving school" },
            ]} />
            <FormSelect name="reason" label="Reason" required placeholder="Choose…" options={settings.leavingReasons.map((r) => ({ value: r, label: r }))} />
            <FormText name="reasonOther" label="Other reason" help="Needed when the reason is Other." maxLength={300} />
            <FormText name="lastDate" label="Last date" type="date" required defaultValue={todayIso(tz)} />
            <FormText name="destinationSchool" label="Destination school" help="Needed for a transfer." maxLength={200} />
            <div>
              <label htmlFor="leaving-docs" className="mb-1 block text-sm font-medium">Documents</label>
              <input id="leaving-docs" name="documents" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf"
                className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:text-brand-text" />
              <p className="mt-1 text-sm text-ink-2">For example the parent&apos;s letter. PDF or photo, up to 5 files of 10 MB.</p>
              <FormFieldError name="documents" />
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
