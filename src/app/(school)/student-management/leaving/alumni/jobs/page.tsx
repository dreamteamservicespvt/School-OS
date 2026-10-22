import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Briefcase, MapPin, Plus } from "lucide-react";
import { Empty, Split } from "@/components/ui/blocks";
import { ActionForm, FormArea, FormText } from "@/components/students/action-form";
import { ConfirmAction } from "@/components/students/confirm-action";
import { BASE, studentPage } from "../../../_lib/page";
import { archiveJobAction, postJobAction } from "../../../_actions/leaving";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Alumni job board") };
}

/** Alumni job board: job posts shared with alumni. */
export default async function JobBoardPage() {
  const { current, settings, can, tz } = await studentPage();
  if (!settings.alumniOn) redirect(`${BASE}/leaving`);
  const jobs = await withSchool(current.ctx, (tx) => tx.jobPost.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 100 }));
  return (
    <>
      <BackLink href={`${BASE}/leaving/alumni`} label="Alumni" sub="Job board" />
      <PageHeader title="Alumni job board" sub="Jobs posted here are shared with alumni" href={`${BASE}/leaving/alumni/jobs`} userId={current.user.id} />
      <Split side={380}>
        <Card className="overflow-hidden">
          <CardHeader title="Open job posts" icon={Briefcase} description={`${jobs.length} post${jobs.length === 1 ? "" : "s"}`} divided={jobs.length > 0} />
          {jobs.length === 0 ? <Empty icon={Briefcase} title="No jobs posted" body="Jobs you post here are shared with alumni." /> : (
            <ul className="divide-y divide-line">
              {jobs.map((j) => (
                <li key={j.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand" aria-hidden="true"><Briefcase size={19} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold">{j.title}</p>
                      <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink3">{j.organisation}{j.location && <><span aria-hidden="true">·</span><MapPin size={12} aria-hidden="true" />{j.location}</>}<span aria-hidden="true">·</span><Words k="posted" /> {formatDate(j.createdAt, tz)}{j.applyBy ? ` · apply by ${formatDate(j.applyBy, tz)}` : ""}</p>
                      <p className="mt-2 whitespace-pre-line text-[14px] text-ink2">{j.description}</p>
                      <p className="mt-2 text-[13.5px]"><b className="font-semibold"><Words k="How to apply:" /></b> {j.contact}</p>
                    </div>
                    {can.manage && (
                      <ConfirmAction action={archiveJobAction} fields={{ id: j.id }} trigger="Take down" triggerVariant="ghost" title={`Take down "${j.title}"?`} confirmLabel="Take down">
                        <Words k="The post is removed from the board and kept in the records." />
                      </ConfirmAction>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {can.manage && (
          <Card>
            <CardHeader title="Post a job" icon={Plus} />
            <CardBody>
              <ActionForm action={postJobAction} submitLabel="Post job" pendingText="Posting…" resetOnSuccess>
                <FormText name="title" label="Job title" required maxLength={120} />
                <FormText name="organisation" label="Organisation" required maxLength={120} />
                <FormText name="location" label="Location" maxLength={120} />
                <FormArea name="description" label="Description" required rows={4} maxLength={2000} />
                <FormText name="contact" label="How to apply" required maxLength={300} help="An email, phone number or website." />
                <FormText name="applyBy" label="Apply by" type="date" />
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </Split>
    </>
  );
}
