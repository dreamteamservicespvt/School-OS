import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { CUSTOM_FIELD_RECORDS, FIELD_TYPES, showWhenWords, toFieldDef } from "@/lib/custom-field-rules";
import { formFields } from "@/lib/settings/forms";
import { ruleNamer, ruleSummary, rulesInUse } from "@/lib/settings/approval-rules";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { CustomFieldInputs } from "@/components/custom-fields";
import { FieldEditor } from "./field-editor";
import { ArchiveFieldButton, ArchiveFormButton, FormDetailsForm, MoveButtons } from "./list-actions";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Forms & Approvals") };
}

const TABS = [["rules", "Approval rules"], ["fields", "Custom fields"], ["forms", "Custom forms"]] as const;
type Tab = (typeof TABS)[number][0];

export default async function FormsApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string; record?: string; archived?: string }> }) {
  const { current, may } = await requireSettingsPage("forms-approvals");
  const sp = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "rules";
  const record = CUSTOM_FIELD_RECORDS.some((r) => r.value === sp.record) ? sp.record! : "student";
  const showArchived = sp.archived === "1";
  const mayEdit = may.edit;
  const mayCreate = may.create;
  const tz = current.school.timeZone;

  const data = await withSchool(current.ctx, async (tx) => {
    if (tab === "rules") {
      const [rules, namer] = await Promise.all([rulesInUse(tx, current.school.id), ruleNamer(tx, current.school.id)]);
      return { kind: "rules" as const, rules: rules.map((r) => ({ ...r, summary: ruleSummary(r.label, r.steps, r.escalateAfterDays, namer) })) };
    }
    if (tab === "fields") {
      const rows = await tx.customField.findMany({ where: { recordType: record }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
      const counts = await tx.customField.groupBy({ by: ["recordType"], where: { archivedAt: null }, _count: true });
      return { kind: "fields" as const, fields: rows.map(toFieldDef), counts: new Map(counts.map((c) => [c.recordType, c._count])) };
    }
    const forms = await tx.customForm.findMany({ orderBy: [{ name: "asc" }] });
    return { kind: "forms" as const, forms };
  });

  const tabHref = (k: string) => `/settings/forms-approvals?tab=${k}`;
  return (
    <>
      <PageHeader title="Forms & Approvals" href="/settings/forms-approvals" userId={current.user.id} />
      <nav aria-label="Parts of this page" className="-mt-2 mb-5 flex flex-wrap gap-2 text-sm">
        {TABS.map(([k, label]) => (
          <Link key={k} href={tabHref(k)} aria-current={tab === k ? "page" : undefined}
            className={`min-h-9 rounded-full border px-3 py-1.5 ${tab === k ? "border-brand bg-brand-soft font-medium text-brand-text" : "border-line bg-surface hover:border-brand"}`}>{label}</Link>
        ))}
      </nav>

      {data.kind === "rules" && (
        <Card>
          <CardHeader title="Approval rules" description="Who approves each kind of request, up to which amount, and when it moves on if nobody decides. Changes apply to new requests." />
          <ul>
            {data.rules.map((r) => (
              <li key={r.type} className="flex flex-wrap items-start justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.label} {r.custom ? <Badge tone="brand"><Words k="Your rule" /></Badge> : <Badge><Words k="Default" /></Badge>}</p>
                  <p className="text-sm text-ink-2">{r.summary}</p>
                  {r.updatedAt && <p className="text-xs text-ink-2"><Words k="Changed" /> {formatDate(r.updatedAt, tz)}</p>}
                </div>
                {mayEdit && <ButtonLink size="sm" href={`/settings/forms-approvals/rules/${r.type}`}><Words k="Edit" /></ButtonLink>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.kind === "fields" && (() => {
        const live = data.fields.filter((f) => !f.archived);
        const archived = data.fields.filter((f) => f.archived);
        const label = CUSTOM_FIELD_RECORDS.find((r) => r.value === record)!.label;
        return (
          <div className="space-y-5">
            <nav aria-label="Record" className="flex flex-wrap gap-2 text-sm">
              {CUSTOM_FIELD_RECORDS.map((r) => (
                <Link key={r.value} href={`${tabHref("fields")}&record=${r.value}`} aria-current={record === r.value ? "page" : undefined}
                  className={`min-h-9 rounded-full border px-3 py-1.5 ${record === r.value ? "border-brand bg-brand-soft font-medium text-brand-text" : "border-line"}`}>
                  {r.label} <span className="text-ink-2">{data.counts.get(r.value) ?? 0}</span>
                </Link>
              ))}
            </nav>
            <Card>
              <CardHeader title={`Extra fields on ${label}`} description="They show at the end of the record's form and on its profile. Archiving a field keeps every answer already given."
                action={mayCreate && <FieldEditor mode="record" owner={record} others={data.fields} trigger="Add a field" triggerVariant="primary" />} />
              {live.length === 0 ? (
                <div className="p-5"><EmptyState title={`No extra fields on ${label} yet`}><Words k="Add one for anything your school records that the standard form does not have, like a house or a bus pass number." /></EmptyState></div>
              ) : (
                <ol>
                  {live.map((f, i) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{f.label} {f.required && <Badge><Words k="Required" /></Badge>} {f.visibility === "restricted" && <Badge tone="warning"><Words k="Restricted" /></Badge>}</p>
                        <p className="text-sm text-ink-2">{FIELD_TYPES.find((t) => t.value === f.fieldType)?.label}{f.choices.length ? `: ${f.choices.join(", ")}` : ""}{f.showWhen ? ` · ${showWhenWords(f, data.fields)}` : ""}</p>
                      </div>
                      {mayEdit && (
                        <div className="flex flex-wrap items-center gap-1">
                          <MoveButtons id={f.id!} first={i === 0} last={i === live.length - 1} label={f.label} />
                          <FieldEditor mode="record" owner={record} others={data.fields} field={f} trigger="Edit" triggerVariant="ghost" />
                          <ArchiveFieldButton id={f.id!} label={f.label} archived={false} />
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            {live.length > 0 && (
              <Card>
                <CardHeader title="Preview" description={`How the extra fields look on the ${label} form. Try the answers: fields with a rule appear and disappear.`} />
                <CardBody><CustomFieldInputs fields={live} /></CardBody>
              </Card>
            )}
            {archived.length > 0 && (showArchived ? (
              <Card>
                <CardHeader title="Archived fields" description="Not shown on forms. Answers already given are kept." action={<Link href={`${tabHref("fields")}&record=${record}`} className="text-sm font-medium text-brand-text underline"><Words k="Hide" /></Link>} />
                <ul>
                  {archived.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0">
                      <span>{f.label}</span>
                      {mayEdit && <ArchiveFieldButton id={f.id!} label={f.label} archived />}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <Link href={`${tabHref("fields")}&record=${record}&archived=1`} className="inline-flex min-h-11 items-center text-sm font-medium text-brand-text underline"><Words k="Show" /> {archived.length} <Words k="archived field" />{archived.length === 1 ? "" : "s"}</Link>
            ))}
          </div>
        );
      })()}

      {data.kind === "forms" && (() => {
        const live = data.forms.filter((f) => !f.archivedAt);
        const archived = data.forms.filter((f) => f.archivedAt);
        return (
          <div className="space-y-5">
            <Card>
              <CardHeader title="Custom forms" description="Forms your school designs itself, such as an appraisal or a consent form." />
              {live.length === 0 ? (
                <div className="p-5"><EmptyState title="No custom forms yet"><Words k="Create one below, add its fields, preview it, and publish." /></EmptyState></div>
              ) : (
                <ul>
                  {live.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0">
                      <div className="min-w-0 flex-1">
                        <Link href={`/settings/forms-approvals/forms/${f.id}`} className="font-medium text-brand-text hover:underline">{f.name}</Link>{" "}
                        <Badge tone={f.status === "published" ? "success" : "warning"}>{f.status === "published" ? `Published, version ${f.version}` : f.version ? `Draft changes (version ${f.version} in use)` : "Draft"}</Badge>
                        <p className="text-sm text-ink-2">{formFields(f.fields).length} <Words k="field" />{formFields(f.fields).length === 1 ? "" : "s"}{f.description ? ` · ${f.description}` : ""}</p>
                      </div>
                      <ButtonLink size="sm" href={`/settings/forms-approvals/forms/${f.id}`}>{mayEdit ? "Open builder" : "Open"}</ButtonLink>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {mayCreate && (
              <Card>
                <CardHeader title="Create a form" />
                <CardBody><FormDetailsForm name="" description="" aboutType="general" /></CardBody>
              </Card>
            )}
            {archived.length > 0 && (
              <Card>
                <CardHeader title="Archived forms" />
                <ul>
                  {archived.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0">
                      <span>{f.name}</span>
                      {mayEdit && <ArchiveFormButton formId={f.id} name={f.name} archived />}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        );
      })()}
    </>
  );
}
