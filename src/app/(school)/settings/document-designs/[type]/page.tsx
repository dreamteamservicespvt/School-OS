import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { BASES, currentDesign } from "@/lib/documents/designs";
import { allFields, findDocType } from "@/lib/documents/types";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DesignEditor } from "./editor";
import { UseVersionButton } from "./use-version";

type Params = { params: Promise<{ type: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return { title: `${findDocType((await params).type)?.label ?? "Document"} design` };
}

export default async function DesignPage({ params }: Params) {
  const current = await requirePage("settings");
  const t = findDocType((await params).type);
  if (!t) notFound();
  const tz = current.school.timeZone;
  const { design, versions, signatories, names } = await withSchool(current.ctx, async (tx) => {
    const design = await currentDesign(tx, t.key);
    const versions = await tx.documentDesign.findMany({ where: { docType: t.key }, orderBy: { version: "desc" }, take: 20 });
    const signatories = await tx.signatory.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } });
    const ids = versions.map((v) => v.createdById).filter((x): x is string => Boolean(x));
    const people = ids.length ? await tx.schoolAccess.findMany({ where: { userLoginId: { in: ids } }, select: { userLogin: { select: { id: true, displayName: true } } } }) : [];
    return { design, versions, signatories, names: new Map(people.map((p) => [p.userLogin.id, p.userLogin.displayName])) };
  });
  const canEdit = can(current.permissions, "settings", "edit");
  const recordKinds = (["student", "staff"] as const).filter((k) =>
    current.permissions[k === "student" ? "student-management" : "staff-hr-management"].see === "all" &&
    t.fields.some((f) => (k === "student" ? f.key === "student_name" : f.key === "staff_name")),
  );

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm"><Link href="/settings/document-designs" className="text-brand-text hover:underline">Document Designs</Link></nav>
      <PageHeader title={t.label} href={`/settings/document-designs/${t.key}`} userId={current.user.id}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          {design.version ? <Badge tone="brand">Version {design.version}</Badge> : <Badge>Ready design</Badge>}
          <span>Printed by {t.usedBy}</span>
        </div>
      </PageHeader>
      <DesignEditor type={t} fields={allFields(t)} initial={{ base: design.base, options: design.options }}
        signatories={signatories.map((s) => ({ id: s.id, name: s.name, title: s.title }))} canEdit={canEdit} recordKinds={[...recordKinds]} />

      <Card className="mt-6">
        <CardHeader title="Versions" description="Every save is kept. Use an earlier version again at any time; it is saved as a new version." />
        <CardBody>
          {versions.length === 0 ? (
            <p className="text-ink-2">Not changed yet. Documents use the ready Classic design until you save.</p>
          ) : (
            <ul className="divide-y divide-line">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">Version {v.version} · {BASES.find((b) => b.key === v.base)?.label ?? v.base} {v.isCurrent && <Badge tone="success" className="ml-1">In use</Badge>}</p>
                    <p className="text-sm text-ink-2">{v.createdById ? names.get(v.createdById) ?? "Someone" : "School OS"} · {formatDateTime(v.createdAt, tz)}</p>
                  </div>
                  {!v.isCurrent && canEdit && <UseVersionButton docType={t.key} version={v.version} />}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
