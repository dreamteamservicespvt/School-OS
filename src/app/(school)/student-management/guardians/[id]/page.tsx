import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { fileLink } from "@/lib/files";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/students/avatar";
import { ActionForm, FormArea, FormSelect } from "@/components/students/action-form";
import { ConfirmAction } from "@/components/students/confirm-action";
import { consentState } from "@/lib/students/consent";
import { parentLinkProvider, parentLinkStatus } from "@/lib/students/guardians";
import { CONSENT_STATUS_LABEL, CONSENT_TYPES, STATUS_LABEL, STATUS_TONE, languageLabel } from "@/lib/students/labels";
import { BASE, studentPage } from "../../_lib/page";
import { sectionNames } from "../../_lib/queries";
import { consentRequestAction, parentLinkAction, withdrawConsentAction } from "../../_actions/guardians";
import { visibleGuardianFor } from "../load";

export const metadata: Metadata = { title: "Parent" };

const TONE = { GIVEN: "success", WITHDRAWN: "danger", REQUESTED: "warning", NONE: "neutral" } as const;

export default async function Parent360({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { current, year, can, tz } = await studentPage();
  const provider = parentLinkProvider();
  const data = await withSchool(current.ctx, async (tx) => {
    const g = await visibleGuardianFor(tx, current, id);
    if (!g) return null;
    const links = await tx.studentGuardian.findMany({ where: { guardianId: id, archivedAt: null }, include: { student: { include: { enrolments: { where: { archivedAt: null, ...(year ? { academicYearId: year.id } : {}) }, take: 1 } } } } });
    const names = await sectionNames(tx, links.flatMap((l) => l.student.enrolments.map((e) => e.sectionId)));
    const consents = await tx.consentRecord.findMany({ where: { guardianId: id }, orderBy: [{ studentId: "asc" }, { consentType: "asc" }] });
    const texts = await tx.consentText.findMany({ where: { id: { in: consents.map((c) => c.consentTextId).filter((x): x is string => Boolean(x)) } } });
    const docs = can.seeDocuments ? await tx.studentDocument.findMany({ where: { guardianId: id, archivedAt: null }, orderBy: { createdAt: "desc" } }) : [];
    const link = provider ? (await parentLinkStatus(tx, current.ctx, [id])).get(id) ?? null : null;
    const merged = g.archivedAt ? await tx.guardianMerge.findFirst({ where: { mergedId: id } }) : null;
    return { g, links, names, consents, texts, docs, link, merged };
  });
  if (!data) notFound();
  const { g } = data;
  const path = `${BASE}/guardians/${id}`;
  const childName = (sid: string) => data.links.find((l) => l.studentId === sid)?.student.fullName ?? "A former child";

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-2"><Link href={`${BASE}/guardians`} className="hover:underline">Parents &amp; Guardians</Link></nav>
      <PageHeader title={g.name} href={path} userId={current.user.id}>
        {can.manage && !g.archivedAt && (
          <div className="flex flex-wrap gap-2">
            <ConfirmAction action={consentRequestAction} fields={{ ids: id }} trigger="Send consent request" title="Send a consent request?" confirmLabel="Send consent request">
              {g.name} gets a request through Parent Link to agree to data and photo consent for each child, with a one-time code to {g.phone}. Consents already given are left as they are.
            </ConfirmAction>
            <ButtonLink href={`${path}/merge`}>Merge</ButtonLink>
            <ButtonLink href={`${path}/edit`} variant="primary">Edit</ButtonLink>
          </div>
        )}
      </PageHeader>

      {g.archivedAt && (
        <Alert tone="warning" className="mb-4" title="This record is archived">
          {data.merged ? <>It was merged into <Link className="font-medium underline" href={`${BASE}/guardians/${data.merged.keptId}`}>another parent record</Link> on {formatDate(data.merged.createdAt, tz)}.</> : "It is kept for the history."}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <dl className="grid gap-3">
              <Detail label="Relation">{g.relationship}</Detail>
              <Detail label="Phone"><a href={`tel:+91${g.phone}`} className="hover:underline">{g.phone}</a></Detail>
              {g.altPhone && <Detail label="Other phone">{g.altPhone}</Detail>}
              <Detail label="Email">{g.email}</Detail>
              <Detail label="Occupation">{g.occupation}</Detail>
              {!can.lookupOnly && <Detail label="Date of birth">{g.dateOfBirth ? formatDate(g.dateOfBirth, tz) : null}</Detail>}
              <Detail label="Address">{g.address}</Detail>
              <Detail label="Message language">{languageLabel(g.language)}</Detail>
              <Detail label="Messages">{g.optedOut ? "Opted out" : "Receives messages"}</Detail>
            </dl>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Children" description={data.links.length > 1 ? "Brothers and sisters share this parent record." : undefined} />
          <CardBody>
            {data.links.length === 0 ? <p className="text-ink-2">No children are linked.</p> : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {data.links.map((l) => {
                  const e = l.student.enrolments[0];
                  return (
                    <li key={l.id} className={`rounded-xl border p-3 ${l.restriction ? "border-danger" : "border-line"}`}>
                      <Link href={`${BASE}/students/${l.studentId}`} className="flex items-center gap-3 hover:underline">
                        <Avatar name={l.student.fullName} src={l.student.photoFileId ? fileLink(l.student.photoFileId, current.ctx.schoolId) : null} />
                        <span><span className="block font-medium">{l.student.fullName}</span><span className="text-sm text-ink-2">{e ? data.names.get(e.sectionId)?.label : "No class this year"} · {l.student.admissionNo}</span></span>
                      </Link>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge tone={STATUS_TONE[l.student.status]}>{STATUS_LABEL[l.student.status]}</Badge>
                        <Badge>{l.relationship}</Badge>
                        {l.isPrimary && <Badge tone="brand">Primary contact</Badge>}
                        {l.canPickUp && !l.restriction && <Badge tone="success">May pick up</Badge>}
                        {l.restriction && <Badge tone="danger">Do not release</Badge>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Consent records" description="Consent is given only by the parent, in Parent Link with a one-time code or on the admission form." />
          <CardBody>
            <div className="mb-3 flex flex-wrap gap-2">
              {CONSENT_TYPES.map((t) => { const st = consentState(data.consents, t.key); return <Badge key={t.key} tone={TONE[st]}>{t.label}: {CONSENT_STATUS_LABEL[st]}</Badge>; })}
            </div>
            {data.consents.length === 0 ? <p className="text-ink-2">Consent not given. Send a consent request?</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-[15px]">
                  <caption className="sr-only">Consent records</caption>
                  <thead className="text-sm text-ink-2"><tr><th className="py-2 pr-3 font-medium">Child</th><th className="py-2 pr-3 font-medium">Consent</th><th className="py-2 pr-3 font-medium">Status</th><th className="py-2 pr-3 font-medium">Text version</th><th className="py-2 font-medium">When and how</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {data.consents.map((c) => {
                      const text = data.texts.find((t) => t.id === c.consentTextId);
                      return (
                        <tr key={c.id}>
                          <td className="py-2 pr-3">{childName(c.studentId)}</td>
                          <td className="py-2 pr-3">{CONSENT_TYPES.find((t) => t.key === c.consentType)?.label ?? c.consentType}</td>
                          <td className="py-2 pr-3"><Badge tone={TONE[c.status]}>{CONSENT_STATUS_LABEL[c.status]}</Badge></td>
                          <td className="py-2 pr-3">{c.version ? `${text?.title ?? "Version"} v${c.version}` : ""}</td>
                          <td className="py-2 text-sm">
                            {c.status === "GIVEN" && c.givenOn ? `${formatDateTime(c.givenOn, tz)} · ${c.method === "parent-link" ? "Parent Link" : "Application form"}` : null}
                            {c.status === "WITHDRAWN" && c.withdrawnOn ? `Withdrawn ${formatDate(c.withdrawnOn, tz)}${c.withdrawnNote ? ` · ${c.withdrawnNote}` : ""}` : null}
                            {c.status === "REQUESTED" && c.requestedAt ? `Requested ${formatDate(c.requestedAt, tz)}` : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {can.manage && data.consents.some((c) => c.status !== "WITHDRAWN") && (
              <details className="mt-4">
                <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand-text">Record a withdrawal</summary>
                <ActionForm action={withdrawConsentAction.bind(null, id)} submitLabel="Record withdrawal" submitVariant="danger" pendingText="Saving…" className="mt-2 grid gap-3 sm:grid-cols-2">
                  <FormSelect name="consentType" label="Consent" required options={CONSENT_TYPES.map((t) => ({ value: t.key, label: t.label }))} defaultValue="photo" help="Photo consent can be withdrawn on its own." />
                  <FormSelect name="studentId" label="For" options={[{ value: "", label: "Every child" }, ...data.links.map((l) => ({ value: l.studentId, label: l.student.fullName }))]} />
                  <FormArea name="note" label="How the parent asked" required rows={2} className="sm:col-span-2" help="For example: letter dated 12-10-2026, or asked at the office." />
                </ActionForm>
              </details>
            )}
          </CardBody>
        </Card>

        {provider && (
          <Card>
            <CardHeader title="Parent Link" />
            <CardBody className="space-y-3">
              <p><Badge tone={data.link?.status === "Active" ? "success" : data.link?.status === "Revoked" ? "danger" : "neutral"}>{data.link?.status ?? "Not sent"}</Badge></p>
              <p className="text-sm text-ink-2">{data.link?.lastOpenedAt ? `Last opened ${formatDateTime(data.link.lastOpenedAt, tz)}` : "Not opened yet."}</p>
              {can.manage && !g.archivedAt && (
                <div className="flex flex-wrap gap-2">
                  <ConfirmAction action={parentLinkAction} fields={{ guardianId: id, op: "resend" }} trigger="Resend" title="Resend Parent Link?" confirmLabel="Resend Parent Link">
                    The same personal link is sent again by WhatsApp or SMS to {g.phone}.
                  </ConfirmAction>
                  <ConfirmAction action={parentLinkAction} fields={{ guardianId: id, op: "revoke" }} trigger="Revoke" triggerVariant="danger-outline" title="Revoke Parent Link?" confirmLabel="Revoke and send a new link" confirmVariant="danger">
                    The old link stops working at once (for example a lost phone), and a new link is sent to {g.phone}.
                  </ConfirmAction>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {can.seeDocuments && data.docs.length > 0 && (
          <Card>
            <CardHeader title="Documents" />
            <CardBody>
              <ul className="space-y-2">
                {data.docs.map((d) => <li key={d.id}><a className="font-medium text-brand-text hover:underline" target="_blank" rel="noopener" href={fileLink(d.fileId, current.ctx.schoolId)}>{d.kind}</a> <span className="text-sm text-ink-2">· {childName(d.studentId)} · {formatDate(d.createdAt, tz)}</span></li>)}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
