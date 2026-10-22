import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake } from "@/lib/list";
import { formatRupees } from "@/lib/format";
import { StudentsHead } from "../../_lib/head";
import { leavingTabs } from "../sub-tabs";
import { Briefcase } from "lucide-react";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ConfirmAction } from "@/components/students/confirm-action";
import { ActionForm, FormSelect, FormText } from "@/components/students/action-form";
import { StudentPicker } from "@/components/students/student-picker";
import { BASE, studentPage } from "../../_lib/page";
import { sectionOptions } from "../../_lib/queries";
import { visibleStudentIds } from "@/lib/students/access";
import { linkMentorAction, markAlumniAction } from "../../_actions/leaving";
import { studentIdsForFilter } from "@/lib/students/find";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Alumni") };
}

const FILTERS = ["year", "mentor"] as const;

/** Alumni (optional): records of past students, donations, mentors and the job board. */
export default async function AlumniPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, settings, yearIds, can } = await studentPage();
  if (!settings.alumniOn) redirect(`${BASE}/leaving`);
  const params = readListParams(await searchParams, FILTERS);
  const path = `${BASE}/leaving/alumni`;
  const data = await withSchool(current.ctx, async (tx) => {
    const f = params.filters;
    const nameIds = params.q ? await studentIdsForFilter(tx, params.q) : null;
    // One campus: that campus's alumni only.
    const mine = await visibleStudentIds(tx, current);
    const own = mine ? { studentId: { in: mine } } : {};
    const where: Prisma.AlumniRecordWhereInput = {
      archivedAt: null,
      ...(mine ? { AND: [own] } : {}),
      ...(f.year ? { graduationYear: f.year } : {}),
      ...(f.mentor ? { isMentor: true } : {}),
      ...(nameIds ? { OR: [{ studentId: { in: nameIds } }, { career: { contains: params.q!, mode: "insensitive" } }, { higherEducation: { contains: params.q!, mode: "insensitive" } }] } : {}),
    };
    const [total, rows, years, graduated, donated, all] = await Promise.all([
      tx.alumniRecord.count({ where }),
      tx.alumniRecord.findMany({ where, orderBy: [{ graduationYear: "desc" }, { createdAt: "desc" }], ...skipTake(params), include: { _count: { select: { donations: true } } } }),
      tx.alumniRecord.findMany({ where: { archivedAt: null, ...own }, distinct: ["graduationYear"], select: { graduationYear: true }, orderBy: { graduationYear: "desc" } }),
      tx.student.findMany({ where: { status: "GRADUATED", archivedAt: null, ...(current.campusId ? { campusId: current.campusId } : {}) }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 500 }),
      tx.alumniDonation.aggregate({ where: mine ? { alumni: own } : {}, _sum: { amountPaise: true }, _count: true }),
      tx.alumniRecord.findMany({ where: { archivedAt: null, ...own }, select: { id: true, studentId: true }, take: 1000 }),
    ]);
    const names = await tx.student.findMany({ where: { id: { in: [...rows.map((r) => r.studentId), ...all.map((a) => a.studentId)] } }, select: { id: true, fullName: true, admissionNo: true } });
    const sections = can.manage ? await sectionOptions(tx, current, yearIds) : [];
    return { total, rows, years, graduated, donated, all, names, sections };
  });
  type Row = (typeof data.rows)[number];
  const nameOf = (id: string) => data.names.find((n) => n.id === id)?.fullName ?? "";
  const columns: Column<Row>[] = [
    { key: "name", label: "Name", phone: "title", cell: (r) => nameOf(r.studentId) },
    { key: "year", label: "Graduated", phone: "meta", cell: (r) => r.graduationYear },
    { key: "career", label: "Career", phone: "meta", cell: (r) => r.career ?? "" },
    { key: "higher", label: "Higher education", cell: (r) => r.higherEducation ?? "" },
    { key: "phone", label: "Phone", cell: (r) => r.phone ?? "" },
    { key: "mentor", label: "Mentor", phone: "badge", cell: (r) => r.isMentor ? <Badge tone="brand"><Words k="Mentor" /></Badge> : "" },
    { key: "donations", label: "Donations", cell: (r) => r._count.donations || "" },
  ];

  return (
    <>
      <StudentsHead page="Leaving & Alumni" href={path} sub="Records of past students, donations, mentors and the job board"
        actions={<ButtonLink href={`${path}/jobs`} icon={Briefcase}><Words k="Job board" /></ButtonLink>}
        subTabs={await leavingTabs()} subLabel="Leaving & Alumni" />
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div>
          <ListToolbar placeholder="Search by name, career or college"
            filters={[
              { key: "year", label: "Graduation year", options: data.years.map((y) => ({ value: y.graduationYear, label: y.graduationYear })) },
              { key: "mentor", label: "Mentors", options: [{ value: "1", label: "Mentors only" }] },
            ]} />
          <DataTable rows={data.rows} columns={columns} rowKey={(r) => r.id} rowHref={(r) => `${path}/${r.id}`} total={data.total} params={params} path={path} caption="Alumni"
            empty={<EmptyState title={Object.keys(params.filters).length || params.q ? "Nothing matches these filters" : "No alumni records yet"}><Words k="Graduated students become alumni here. Mark them from the card on this page." /></EmptyState>} />
        </div>
        <div className="space-y-4">
          {can.manage && data.graduated.length > 0 && (
            <Card>
              <CardHeader title="Graduated, not yet alumni" />
              <CardBody>
                <p className="mb-3 text-[15px]">{data.graduated.slice(0, 5).map((s) => s.fullName).join(", ")}{data.graduated.length > 5 ? ` and ${data.graduated.length - 5} more` : ""}.</p>
                <ConfirmAction action={markAlumniAction} fields={{ ids: data.graduated.map((s) => s.id).join(",") }} trigger={`Mark ${data.graduated.length} as alumni`} triggerVariant="primary"
                  title={`Mark ${data.graduated.length} graduated ${data.graduated.length === 1 ? "student" : "students"} as alumni?`} confirmLabel="Mark as alumni">
                  <Words k="An alumni record is made for each, with the graduation year and the parent's phone. You can add their career and college later." />
                </ConfirmAction>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Donations" />
            <CardBody>
              <p className="text-2xl font-semibold">{formatRupees(data.donated._sum.amountPaise ?? BigInt(0))}</p>
              <p className="text-[13.5px] text-ink2">{data.donated._count} {data.donated._count === 1 ? "donation" : "donations"} <Words k="recorded. Add one on an alumnus's record; the receipt is made in Finance, Income." /></p>
            </CardBody>
          </Card>
          {can.manage && data.all.length > 0 && (
            <Card>
              <CardHeader title="Link a mentor" description="An alumnus who guides a current student." />
              <CardBody>
                <ActionForm action={linkMentorAction} submitLabel="Link mentor" pendingText="Linking…" resetOnSuccess>
                  <FormSelect name="alumniId" label="Alumnus" required placeholder="Choose…" options={data.all.map((a) => ({ value: a.id, label: nameOf(a.studentId) })).sort((a, b) => a.label.localeCompare(b.label))} />
                  <StudentPicker name="studentId" label="Student" sections={data.sections.map((s) => ({ value: s.value, label: s.label }))} />
                  <FormText name="note" label="Note" maxLength={300} help="For example: guidance for engineering entrance exams." />
                </ActionForm>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
