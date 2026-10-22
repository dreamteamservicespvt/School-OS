import type { Metadata } from "next";
import { ChevronRight, FileText, FolderOpen, School, ShieldCheck, UserCheck, Users, Workflow } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatRupees } from "@/lib/format";
import { can } from "@/lib/permissions";
import { workPage, BASE } from "@/lib/admission/page";
import { CATEGORIES, DOC_TYPES, OWNER_RULES, SYSTEM_STATUSES, admissionStaff, applicationPrefix, classList, classRules, openYears, type ListItem } from "@/lib/admission/settings";
import { defaultSteps, type RuleStep } from "@/lib/approvals";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { AdmissionHead } from "../_components/head";
import { ClassEdit, ListChips, NumbersButton, OwnerRule, PapersTable, RuleSwitch, StagesList } from "./settings-forms";
import { schoolRoles } from "@/lib/school-roles";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Admission Settings") };
}

const STAGE_SUB: Record<string, string> = {
  enquiry: "Every admission starts here", application: "Counter or online form", documents: "Papers needed per class, below",
  payment: "Application fee before the next step", test: "Shows the Test & Interview page", interview: "Shows the Test & Interview page",
  decision: "Approve or reject with remarks", admitted: "Student record made automatically",
};

function Row({ title, sub, children }: { title: string; sub: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-4 px-5 py-3.5">
      <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]">{title}</p><p className="text-[12.5px] text-ink3">{sub}</p></div>
      <div className="shrink-0">{children}</div>
    </li>
  );
}

export default async function AdmissionSettingsPage() {
  const { current, viewer, settings: s, year } = await workPage("edit");
  const canEdit = true; // workPage lets only full reach in; the actions check again.
  const data = await withSchool(current.ctx, async (tx) => {
    const [classes, rules, staff, years, approvalRule, roles, nextSeq] = await Promise.all([
      // Class rules are kept per class: a person limited to one campus sees their campus's classes. The rest is school-wide.
      classList(tx, viewer.campusId), classRules(tx), admissionStaff(tx, current.ctx), openYears(tx),
      tx.approvalRule.findFirst({ where: { requestType: "admission", archivedAt: null } }),
      schoolRoles(tx, current.ctx, { where: { key: { not: null } }, select: { key: true, name: true } }),
      year ? tx.application.count({ where: { academicYearId: year.id } }) : 0,
    ]);
    return { classes, rules, staff, years, approvalRule, roles, nextSeq };
  });

  const staffOpts = data.staff.map((x) => ({ value: x.id, label: x.fullName }));
  const staffName = (id: string | null) => data.staff.find((x) => x.id === id)?.fullName ?? null;
  const cls = data.classes.map((c) => ({ value: c.id, label: c.name }));
  const cells = Object.fromEntries(data.classes.map((c) => {
    const docs = data.rules.get(c.id)?.documents ?? [];
    return [c.id, Object.fromEntries(DOC_TYPES.map((d) => { const x = docs.find((y) => y.type === d.key); return [d.key, x ? (x.required ? "required" : "optional") : "none"]; }))];
  })) as Record<string, Record<string, "required" | "optional" | "none">>;
  const items = (list: ListItem[], system: readonly string[] = []) => list.map((x) => ({ key: x.key, label: x.label, archived: Boolean(x.archived), system: system.includes(x.key) }));
  const steps = ((data.approvalRule?.steps as RuleStep[] | undefined) ?? defaultSteps("admission"));
  const roleName = (k: string | null | undefined) => data.roles.find((r) => r.key === k)?.name ?? (k ? k.replace(/-/g, " ") : "");
  const approver = steps.map((st) => (st.approverUserId ? "A chosen person" : roleName(st.approverRole))).join(", then ");
  const nextNo = `${applicationPrefix(s.applicationPrefix, year?.name ?? String(new Date().getFullYear()))}${String(data.nextSeq + 1).padStart(4, "0")}`;
  const quotas = Object.fromEntries(s.quotaList.map((q) => [q.category, q.sharePct]));
  const decisionStage = s.stageList.find((x) => x.key === "decision");
  const fees = data.classes.map((c) => data.rules.get(c.id)?.feePaise).filter((x): x is bigint => x != null && x > BigInt(0));
  const feeWords = fees.length ? [...new Set(fees.map((f) => formatRupees(f)))].slice(0, 3).join(" · ") : "No class has a fee yet";
  const onlineClasses = data.classes.filter((c) => data.rules.get(c.id)?.onlineOpen);

  return (
    <>
      <AdmissionHead href={`${BASE}/settings`} sub={`The rules for admissions at ${current.school.name}. Every change is logged.`} />
      <div className="flex flex-col gap-5 lg:gap-6 max-w-5xl">
        <Card>
          <CardHeader title="Admission stages and approvals" description="In order. Each stage can be on or off and can need an approval." icon={Workflow} />
          <StagesList canEdit={canEdit} stages={s.stageList.map((x) => ({
            key: x.key, label: x.label, on: x.on, needsApproval: Boolean(x.needsApproval), sub: x.key === "payment" && !s.applicationFeeOn ? "Turn on Application fee below first" : STAGE_SUB[x.key] ?? "",
            always: ["enquiry", "application", "decision", "admitted"].includes(x.key), approvable: x.key === "decision",
          }))} />
        </Card>

        <Card>
          <CardHeader title="Who gets new enquiries" description="The owner can still be changed by hand. The history keeps every change." icon={UserCheck} />
          <div className="px-5 pb-5 flex flex-col gap-3">
            <OwnerRule canEdit={canEdit} rule={s.ownerRule} defaultOwner={s.defaultOwnerStaffId} turn={s.turnStaffIds} staff={staffOpts}
              rules={OWNER_RULES.map((r) => ({
                value: r.value, label: r.label,
                help: r.value === "default" ? (staffName(s.defaultOwnerStaffId) ? `Every new enquiry goes to ${staffName(s.defaultOwnerStaffId)}` : "Every new enquiry goes to the person adding it")
                  : r.value === "turn" ? (s.turnStaffIds.length ? `${s.turnStaffIds.map(staffName).filter(Boolean).join(", ")}. Staff on approved leave that day are skipped.` : r.help)
                  : r.help,
              }))} />
            {s.ownerRule === "class" && (
              <ul className="rounded-xl bg-sunken/60 divide-y divide-line/70 text-[13.5px]">
                {data.classes.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5"><span className="text-ink2">{c.name}</span><span className="font-semibold">{staffName(data.rules.get(c.id)?.ownerStaffId ?? null) ?? `${staffName(s.defaultOwnerStaffId) ?? "Person adding it"} (default owner)`}</span></li>
                ))}
                <li className="flex items-center justify-between gap-3 px-3.5 py-2.5"><span className="text-ink2"><Words k="No class wanted" /></span><span className="font-semibold">{staffName(s.defaultOwnerStaffId) ?? "Person adding it"} <Words k="(default owner)" /></span></li>
              </ul>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Papers needed per class" description="Tap a cell to switch Required, Optional or Not needed" icon={FolderOpen} />
          {cls.length ? <PapersTable canEdit={canEdit} classes={cls} docs={DOC_TYPES.map((d) => ({ value: d.key, label: d.label }))} cells={cells} />
            : <EmptyState bare Icon={FolderOpen} title="No classes yet"><Words k={"Add classes in Academic Management, Classes & Sections."} /></EmptyState>}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Per class" description="Application fee, online form, age and owner for each class" icon={Users} />
          <ul className="border-t border-line/70 divide-y divide-line/70">
            {data.classes.map((c) => {
              const r = data.rules.get(c.id);
              const bits = [
                s.applicationFeeOn ? (r?.feePaise ? `Fee ${formatRupees(r.feePaise)}` : "No fee") : null,
                s.onlineOn ? (r?.onlineOpen ? "Online form open" : "Counter only") : null,
                r?.minAge || r?.maxAge ? `Age ${r?.minAge ?? "any"} to ${r?.maxAge ?? "any"}` : null,
                staffName(r?.ownerStaffId ?? null) ? `Owner ${staffName(r?.ownerStaffId ?? null)}` : null,
              ].filter(Boolean);
              return (
                <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]">{c.name}</p><p className="text-[12.5px] text-ink3 truncate">{bits.join(" · ") || "No rules set"}</p></div>
                  <ClassEdit cls={{ value: c.id, label: c.name }} fee={r?.feePaise ? (Number(r.feePaise) / 100).toString() : ""} online={Boolean(r?.onlineOpen)} minAge={r?.minAge ?? null} maxAge={r?.maxAge ?? null}
                    owner={r?.ownerStaffId ?? null} staff={staffOpts} feeOn={s.applicationFeeOn} onlineOn={s.onlineOn} />
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="grid lg:grid-cols-3 gap-5 lg:gap-6">
          <Card><CardHeader title="Enquiry statuses" description="Applied, Admitted and Lost are set by the system" /><ListChips kind="enquiryStatuses" what="status" canEdit={canEdit} items={items(s.statusList, [...SYSTEM_STATUSES, "new"])} /></Card>
          <Card><CardHeader title="Enquiry sources" description="Kept as first recorded" /><ListChips kind="sources" what="source" canEdit={canEdit} items={items(s.sourceList)} /></Card>
          <Card><CardHeader title="Loss reasons" description="Needed to close an enquiry as lost" /><ListChips kind="lossReasons" what="loss reason" canEdit={canEdit} items={items(s.lossList)} /></Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader title="Seats, priority and quota" description="Seats per class come from Classes & Sections" icon={School} />
          <ul className="border-t border-line/70 divide-y divide-line/70">
            <Row title="Admit over capacity" sub={s.allowOverCapacity ? "On: a full class can still take admissions, with a warning" : "Off: a full class sends new admissions to the waiting list"}><RuleSwitch k="allowOverCapacity" on={s.allowOverCapacity} label="Admit over capacity" /></Row>
            <Row title="Waiting list" sub="Ranked by sibling, category, test score and date applied"><RuleSwitch k="waitingListOn" on={s.waitingListOn} label="Waiting list" /></Row>
            <Row title="Sibling priority" sub={s.siblingPriorityOn ? `Counts ${s.siblingWeight} points in waiting-list ranking` : "Off"}><RuleSwitch k="siblingPriorityOn" on={s.siblingPriorityOn} label="Sibling priority" /></Row>
            <Row title="Quota and category seats" sub={s.quotaOn ? (s.quotaList.length ? s.quotaList.map((q) => `${q.category} ${q.sharePct}%`).join(" · ") : "No shares set yet") : "Off"}><RuleSwitch k="quotaOn" on={s.quotaOn} label="Quota and category seats" /></Row>
            <Row title="Admit with papers pending" sub={s.admitWithPapersPending ? "On: admission can be confirmed before every paper is verified" : "Off: Confirm admission waits until every required paper is verified"}><RuleSwitch k="admitWithPapersPending" on={s.admitWithPapersPending} label="Admit with papers pending" /></Row>
          </ul>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Forms, fees and numbers" icon={FileText} action={<NumbersButton years={data.years.map((y) => ({ value: y.id, label: y.name }))} yearId={s.admissionYearId} prefix={s.applicationPrefix} nextNo={nextNo}
            siblingWeight={s.siblingWeight} siblingOn={s.siblingPriorityOn} quotaOn={s.quotaOn} quotas={quotas} categories={[...CATEGORIES]} />} />
          <ul className="border-t border-line/70 divide-y divide-line/70">
            <Row title="Online application" sub={s.onlineOn ? (onlineClasses.length ? `${onlineClasses.map((c) => c.name).join(", ")} take online applications` : "No class takes online applications yet. Open them in Per class.") : "Off: applications are made at the counter"}><RuleSwitch k="onlineOn" on={s.onlineOn} label="Online application" /></Row>
            <Row title="Application fee" sub={s.applicationFeeOn ? `${feeWords}. Paid online with Razorpay or at the counter.` : "Off"}><RuleSwitch k="applicationFeeOn" on={s.applicationFeeOn} label="Application fee" /></Row>
            <Row title="Offer letters" sub="Made from the offer-letter design in Settings, Document Designs"><RuleSwitch k="offerLettersOn" on={s.offerLettersOn} label="Offer letters" /></Row>
            <Row title="Campaigns" sub="Group enquiries by campaign for the source report"><RuleSwitch k="campaignsOn" on={s.campaignsOn} label="Campaigns" /></Row>
            <Row title="Admission year" sub={s.admissionYearId ? "Chosen by hand" : "Worked out: the upcoming year with sections, else this year"}><span className="text-[14px] font-semibold">{year?.name ?? "None open"}</span></Row>
            <Row title="Application number format" sub={`Next: ${nextNo}`}><span className="text-[13.5px] font-semibold font-mono">{s.applicationPrefix}0000</span></Row>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Approval limits" description="Shown here, stored in Settings, Forms & Approvals" icon={ShieldCheck}
            action={can(current.permissions, "settings", "edit") ? <ButtonLink size="sm" variant="ghost" iconRight={ChevronRight} href="/settings/forms-approvals"><Words k="Open" /></ButtonLink> : undefined} />
          <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[14px]">
            <li className="flex items-center justify-between gap-3"><span className="text-ink2"><Words k="Admission decision" /></span>{decisionStage?.needsApproval ? <Pill tone="brand">{approver}</Pill> : <Pill tone="neutral"><Words k="No approval" /></Pill>}</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
