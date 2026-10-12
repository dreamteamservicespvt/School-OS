import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ActionForm, FormArea, FormText } from "@/components/students/action-form";
import { ConfirmAction } from "@/components/students/confirm-action";
import { BASE, studentPage } from "../../../_lib/page";
import { archiveJobAction, postJobAction } from "../../../_actions/leaving";

export const metadata: Metadata = { title: "Alumni job board" };

/** Alumni job board: job posts shared with alumni. */
export default async function JobBoardPage() {
  const { current, settings, can, tz } = await studentPage();
  if (!settings.alumniOn) redirect(`${BASE}/leaving`);
  const jobs = await withSchool(current.ctx, (tx) => tx.jobPost.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 100 }));
  return (
    <>
      <BackLink href={`${BASE}/leaving/alumni`} label="Alumni" />
      <PageHeader title="Alumni job board" href={`${BASE}/leaving/alumni/jobs`} userId={current.user.id} />
      <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
        <div>
          {jobs.length === 0 ? <EmptyState title="No jobs posted">Jobs you post here are shared with alumni.</EmptyState> : (
            <ul className="space-y-2">
              {jobs.map((j) => (
                <li key={j.id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{j.title}</p>
                      <p className="text-sm text-ink-2">{j.organisation}{j.location ? ` · ${j.location}` : ""} · posted {formatDate(j.createdAt, tz)}{j.applyBy ? ` · apply by ${formatDate(j.applyBy, tz)}` : ""}</p>
                      <p className="mt-2 whitespace-pre-line text-[15px]">{j.description}</p>
                      <p className="mt-2 text-sm"><strong>How to apply:</strong> {j.contact}</p>
                    </div>
                    {can.manage && (
                      <ConfirmAction action={archiveJobAction} fields={{ id: j.id }} trigger="Take down" triggerVariant="ghost" title={`Take down "${j.title}"?`} confirmLabel="Take down">
                        The post is removed from the board and kept in the records.
                      </ConfirmAction>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {can.manage && (
          <Card className="self-start">
            <CardHeader title="Post a job" />
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
      </div>
    </>
  );
}
