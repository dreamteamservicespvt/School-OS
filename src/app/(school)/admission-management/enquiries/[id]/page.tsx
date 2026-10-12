import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { admissionPage, BASE } from "@/lib/admission/page";
import { AdmissionProblem, UUID_RE } from "@/lib/admission/act";
import { canWorkOn } from "@/lib/admission/access";
import { CALL_OUTCOMES, enquiryTemplates, loadEnquiry } from "@/lib/admission/enquiries";
import { CLOSED_STATUSES, SYSTEM_STATUSES, label, live } from "@/lib/admission/settings";
import { enquiryChoices } from "@/lib/admission/choices";
import { CustomFieldValues } from "@/components/custom-fields";
import type { CustomValues } from "@/lib/custom-field-rules";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Facts, StageBadge, StatusBadge } from "../../_components/bits";
import { EditEnquiry } from "../enquiry-forms";
import { PanelActions } from "./panel-forms";

export const metadata: Metadata = { title: "Enquiry" };

const KIND_LABEL: Record<string, string> = {
  created: "Added", note: "Note", call: "Call", "follow-up": "Follow-up", reassigned: "Reassigned", status: "Status", source: "Source", message: "Message",
  lost: "Lost", reopened: "Reopened", application: "Application", campaign: "Campaign", admitted: "Admitted", edited: "Edited", archived: "Archived", restored: "Restored",
};

export default async function EnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { current, viewer, settings, tz } = await admissionPage();
  const data = await withSchool(current.ctx, async (tx) => {
    let e;
    try {
      e = await loadEnquiry(tx, viewer, id);
    } catch (err) {
      if (err instanceof AdmissionProblem) {
        const archived = await tx.enquiry.findFirst({ where: { id, archivedAt: { not: null } } });
        if (!archived || viewer.see !== "all") return { problem: err.message } as const;
        e = archived;
      } else throw err;
    }
    const [activity, apps, campaign, sibling, choices, cls, people] = await Promise.all([
      tx.enquiryActivity.findMany({ where: { enquiryId: e.id }, orderBy: { at: "desc" }, take: 200 }),
      tx.application.findMany({ where: { enquiryId: e.id, archivedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, applicationNo: true, stage: true, fullName: true } }),
      e.campaignId ? tx.admissionCampaign.findUnique({ where: { id: e.campaignId }, select: { name: true } }) : null,
      e.siblingOfId ? tx.enquiry.findFirst({ where: { id: e.siblingOfId }, select: { id: true, childName: true } }) : null,
      enquiryChoices(tx, current.ctx, current, settings, tz),
      e.classId ? tx.schoolClass.findUnique({ where: { id: e.classId }, select: { name: true } }) : null,
      tx.staff.findMany({ where: { OR: [{ id: e.ownerStaffId ?? undefined }, { userLoginId: { not: null } }] }, select: { id: true, fullName: true, userLoginId: true } }),
    ]);
    return { e, activity, apps, campaign, sibling, choices, cls, people };
  });
  if ("problem" in data) {
    return (
      <>
        <PageHeader title="Enquiry" href={`${BASE}/enquiries`} userId={current.user.id} />
        <Alert tone="danger" title="This enquiry cannot be opened">{data.problem}</Alert>
        <ButtonLink href={`${BASE}/enquiries`} className="mt-4">Back to Enquiries</ButtonLink>
      </>
    );
  }
  const { e } = data;
  const now = new Date();
  const closed = CLOSED_STATUSES.includes(e.status);
  const late = !closed && e.nextFollowUpAt && e.nextFollowUpAt < now;
  const owner = data.people.find((p) => p.id === e.ownerStaffId)?.fullName ?? "No owner";
  const byName = (userId: string | null) => (userId ? data.people.find((p) => p.userLoginId === userId)?.fullName ?? "Staff" : "School OS");
  const canChange = canWorkOn(viewer, e) && !e.archivedAt;
  const conversation = data.activity.filter((a) => a.kind === "call" || a.kind === "message" || a.kind === "campaign").slice(0, 3);
  const openApp = data.apps.find((a) => !["REJECTED", "WITHDRAWN"].includes(a.stage));

  return (
    <>
      <PageHeader title={e.childName} href={`${BASE}/enquiries/${e.id}`} userId={current.user.id}>
        <div className="flex flex-wrap gap-2">
          <a href={`tel:+91${e.phone}`} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface px-4 font-medium hover:bg-surface-2">Call {e.phone}</a>
          {canChange && <EditEnquiry c={data.choices} saved={{ id: e.id, childName: e.childName, parentName: e.parentName, phone: e.phone, email: e.email, classId: e.classId, childDob: e.childDob ? e.childDob.toISOString().slice(0, 10) : null, currentSchool: e.currentSchool, referredBy: e.referredBy, customFields: (e.customFields ?? {}) as CustomValues }} />}
          {viewer.change === "all" && !openApp && e.status !== "lost" && !e.archivedAt && <ButtonLink href={`${BASE}/applications/new?enquiry=${e.id}`} variant="primary">Convert to application</ButtonLink>}
        </div>
      </PageHeader>
      {e.archivedAt && <Alert tone="warning" className="mb-4">This enquiry is archived. It is kept with its history and can be restored.</Alert>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Enquiry" />
            <CardBody>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <StatusBadge status={e.status} label={label(settings.statusList, e.status)} />
                {late && <Badge tone="danger">Follow-up overdue</Badge>}
                {data.campaign && <Badge tone="brand">Campaign: {data.campaign.name}</Badge>}
              </div>
              <Facts items={[
                ["Parent", e.parentName],
                ["Phone", <a key="p" href={`tel:+91${e.phone}`} className="text-brand-text hover:underline">+91 {e.phone}</a>],
                ["Email", e.email],
                ["Class wanted", data.cls?.name ?? "Not decided"],
                ["Owner", owner],
                ["Next follow-up", closed ? "None needed" : e.nextFollowUpAt ? <span key="f" className={late ? "font-medium text-danger" : ""}>{formatDateTime(e.nextFollowUpAt, tz)}</span> : "Not set"],
                ["Next action", closed ? null : e.nextAction],
                ["Source", `${label(settings.sourceList, e.source)}${e.firstSource !== e.source ? ` (first recorded: ${label(settings.sourceList, e.firstSource)})` : ""}`],
                ["Child's date of birth", e.childDob ? formatDate(e.childDob, "UTC") : null],
                ["Current school", e.currentSchool],
                ["Referred by", e.referredBy],
                ["Lost because", e.status === "lost" ? `${label(settings.lossList, e.lostReason)}${e.lostNote ? `: ${e.lostNote}` : ""}` : null],
                ["Sibling enquiry of", data.sibling ? <Link key="s" href={`${BASE}/enquiries/${data.sibling.id}`} className="text-brand-text hover:underline">{data.sibling.childName}</Link> : null],
                ["Added", formatDateTime(e.createdAt, tz)],
              ]} />
              {data.choices.customFields.length > 0 && <div className="mt-4"><CustomFieldValues fields={data.choices.customFields} values={(e.customFields ?? {}) as CustomValues} /></div>}
            </CardBody>
          </Card>
          {data.apps.length > 0 && (
            <Card>
              <CardHeader title="Applications" />
              <CardBody>
                <ul className="divide-y divide-line">
                  {data.apps.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      {viewer.see === "all" ? <Link href={`${BASE}/applications/${a.id}`} className="font-medium text-brand-text hover:underline">{a.applicationNo}</Link> : <span>{a.applicationNo}</span>}
                      <StageBadge stage={a.stage} />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
        <div className="space-y-5">
          {canChange || (e.archivedAt && viewer.change === "all") ? (
            <Card>
              <CardBody>
                <PanelActions
                  id={e.id} status={e.status} source={e.source} sourceLabel={label(settings.sourceList, e.source)}
                  closed={closed} lost={e.status === "lost"} archived={Boolean(e.archivedAt)} full={viewer.change === "all"} canArchive={viewer.change === "all"}
                  defaultFollowUp={data.choices.defaultFollowUp}
                  statuses={live(settings.statusList).filter((s) => !(SYSTEM_STATUSES as readonly string[]).includes(s.key)).map((s) => ({ value: s.key, label: s.label }))}
                  sources={data.choices.sources} owners={data.choices.owners}
                  lossReasons={live(settings.lossList).map((s) => ({ value: s.key, label: s.label }))}
                  outcomes={CALL_OUTCOMES} templates={enquiryTemplates(current.school.name, e)} hasEmail={Boolean(e.email)}
                />
              </CardBody>
            </Card>
          ) : null}
          {conversation.length > 0 && (
            <Card>
              <CardHeader title="Recent conversation" />
              <CardBody>
                <ul className="space-y-3">
                  {conversation.map((a) => (
                    <li key={a.id} className={`rounded-xl p-3 ${a.direction === "incoming" ? "bg-surface-2" : "bg-brand-soft"}`}>
                      <p className="text-sm">{a.text}</p>
                      <p className="mt-1 text-xs text-ink-2">{byName(a.byId)} · {formatDateTime(a.at, tz)}</p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Activity" description="Everything that happened, newest first. Nothing here is ever deleted." />
            <CardBody>
              <ol className="space-y-3">
                {data.activity.map((a) => (
                  <li key={a.id} className="border-l-2 border-line pl-3">
                    <p className="text-sm"><span className="font-medium">{KIND_LABEL[a.kind] ?? a.kind}.</span> {a.text}</p>
                    <p className="text-xs text-ink-2">{byName(a.byId)} · {formatDateTime(a.at, tz)}</p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
