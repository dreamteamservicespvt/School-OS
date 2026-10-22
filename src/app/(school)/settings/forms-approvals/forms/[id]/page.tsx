import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { FIELD_TYPES, showWhenWords } from "@/lib/custom-field-rules";
import { FORM_ABOUT, formFields } from "@/lib/settings/forms";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { CustomFieldInputs } from "@/components/custom-fields";
import { FieldEditor } from "../../field-editor";
import { ArchiveFormButton, FormDetailsForm, MoveButtons, PublishButton, RemoveFormFieldButton } from "../../list-actions";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Form builder") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { current, may } = await requireSettingsPage("forms-approvals");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const form = await withSchool(current.ctx, (tx) => tx.customForm.findUnique({ where: { id } }));
  if (!form) notFound();
  const fields = formFields(form.fields);
  const mayEdit = may.edit && !form.archivedAt;
  const published = form.status === "published";

  return (
    <>
      <Link href="/settings/forms-approvals?tab=forms" className="mb-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-text hover:underline"><Words k="← Custom forms" /></Link>
      <PageHeader title={form.name} href={`/settings/forms-approvals/forms/${id}`} userId={current.user.id}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={published ? "success" : "warning"}>{published ? `Published, version ${form.version}` : "Draft"}</Badge>
          {mayEdit && !published && fields.length > 0 && <PublishButton formId={id} name={form.name} fields={fields.length} />}
          {may.archive && <ArchiveFormButton formId={id} name={form.name} archived={Boolean(form.archivedAt)} />}
        </div>
      </PageHeader>
      <div className="space-y-5">
        {form.archivedAt && <Alert tone="info"><Words k="This form is archived. Restore it to change it." /></Alert>}
        {!published && form.version > 0 && <Alert tone="warning"><Words k="You have changes that are not published. People still fill in version" /> {form.version} <Words k="until you publish." /></Alert>}
        {published && form.publishedAt && <p className="text-sm text-ink-2"><Words k="Published" /> {formatDateTime(form.publishedAt, current.school.timeZone)}<Words k=". Any change makes a draft until you publish again." /></p>}

        <Card>
          <CardHeader title="Fields" description={`${fields.length} of at most 60. Fields can show only when another answer matches.`}
            action={mayEdit && <FieldEditor mode="form" owner={id} others={fields} trigger="Add a field" triggerVariant="primary" />} />
          {fields.length === 0 ? (
            <div className="p-5"><EmptyState title="No fields yet"><Words k={"Add the first field, for example \"Teaching quality\" as a choice of Good, Average, Needs help."} /></EmptyState></div>
          ) : (
            <ol>
              {fields.map((f, i) => (
                <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i + 1}. {f.label} {f.required && <Badge><Words k="Required" /></Badge>}</p>
                    <p className="text-sm text-ink-2">{FIELD_TYPES.find((t) => t.value === f.fieldType)?.label}{f.choices.length ? `: ${f.choices.join(", ")}` : ""}{f.showWhen ? ` · ${showWhenWords(f, fields)}` : ""}</p>
                  </div>
                  {mayEdit && (
                    <div className="flex flex-wrap items-center gap-1">
                      <MoveButtons id={f.key} formId={id} first={i === 0} last={i === fields.length - 1} label={f.label} />
                      <FieldEditor mode="form" owner={id} others={fields} field={f} trigger="Edit" triggerVariant="ghost" />
                      <RemoveFormFieldButton formId={id} fieldKey={f.key} label={f.label} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>

        {fields.length > 0 && (
          <Card>
            <CardHeader title="Preview" description="Exactly what people will see. Try answers to check the conditional fields. Nothing typed here is saved." />
            <CardBody>
              {form.description && <p className="mb-4 text-ink-2">{form.description}</p>}
              <CustomFieldInputs key={JSON.stringify(fields)} fields={fields} />
            </CardBody>
          </Card>
        )}

        {mayEdit && (
          <Card>
            <CardHeader title="Form details" description={`About: ${FORM_ABOUT.find((a) => a.value === form.aboutType)?.label ?? form.aboutType}`} />
            <CardBody><FormDetailsForm formId={id} name={form.name} description={form.description ?? ""} aboutType={form.aboutType} /></CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
