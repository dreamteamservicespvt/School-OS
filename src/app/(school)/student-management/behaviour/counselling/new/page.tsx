import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody } from "@/components/ui/card";
import { ActionForm, FormArea, FormSelect } from "@/components/students/action-form";
import { StudentPicker } from "@/components/students/student-picker";
import { loadVisibleStudent } from "@/lib/students/access";
import { counsellors } from "@/lib/students/behaviour";
import { BASE, studentPage } from "../../../_lib/page";
import { sectionOptions } from "../../../_lib/queries";
import { referAction } from "../../../_actions/behaviour";

export const metadata: Metadata = { title: "Refer to counselling" };

export default async function ReferPage({ searchParams }: { searchParams: Promise<{ student?: string; incident?: string }> }) {
  const { current, settings, yearIds, can } = await studentPage();
  if (!settings.counsellingOn || !can.contribute) redirect(`${BASE}/behaviour`);
  const sp = await searchParams;
  const data = await withSchool(current.ctx, async (tx) => {
    const sections = await sectionOptions(tx, current, yearIds, { own: can.reach === "own" });
    const s = sp.student ? await loadVisibleStudent(tx, current, sp.student).catch(() => null) : null;
    return { sections, initial: s ? [{ id: s.id, name: s.fullName, admissionNo: s.admissionNo, cls: "" }] : [], people: await counsellors(tx, current.ctx) };
  });
  return (
    <>
      <BackLink href={`${BASE}/behaviour/counselling`} label="Counselling" />
      <PageHeader title="Refer to counselling" sub={<>Opens a counselling case and tells the counsellor. What the counsellor writes stays private to them.</>} href={`${BASE}/behaviour/counselling/new`} userId={current.user.id} />
      <Card className="max-w-2xl">
        <CardBody>
          {data.people.length === 0 && <p className="mb-4 rounded-xl bg-warn/12 px-3 py-2 text-[13.5px] text-ink">No one has the Counsellor role yet. The case is opened and can be given to a counsellor later (Settings, Users &amp; Permissions).</p>}
          <ActionForm action={referAction} submitLabel="Refer" pendingText="Referring…"
            footer={<Link href={`${BASE}/behaviour`} className="inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-semibold text-ink2 transition hover:bg-sunken hover:text-ink">Cancel</Link>}>
            {sp.incident && /^[0-9a-f-]{36}$/i.test(sp.incident) && <input type="hidden" name="incidentId" value={sp.incident} />}
            <StudentPicker name="studentId" label="Student" sections={data.sections.map((s) => ({ value: s.value, label: s.label }))} initial={data.initial} />
            <FormArea name="reason" label="Why" required rows={3} help="What you noticed. Keep it to the facts." />
            {data.people.length > 1 && <FormSelect name="counsellorId" label="Counsellor" options={data.people.map((p) => ({ value: p.id, label: p.displayName }))} />}
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
