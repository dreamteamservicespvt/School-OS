import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { dataUri } from "@/lib/documents";
import { BASES } from "@/lib/documents/designs";
import { DOC_TYPES, GROUP_ORDER } from "@/lib/documents/types";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArchiveSignatory, SignatoryForm } from "./signatories";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Document Designs") };
}

export default async function DocumentDesignsPage() {
  const { current, may } = await requireSettingsPage("document-designs");
  const tz = current.school.timeZone;
  const { designs, signatories } = await withSchool(current.ctx, async (tx) => ({
    designs: await tx.documentDesign.findMany({ where: { isCurrent: true }, select: { docType: true, base: true, version: true, createdAt: true } }),
    signatories: await Promise.all(
      (await tx.signatory.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } })).map(async (s) => ({ ...s, image: await dataUri(tx, s.imageFileId) })),
    ),
  }));
  const byType = new Map(designs.map((d) => [d.docType, d]));
  const canCreate = may.create;
  const canArchive = may.archive;
  const canEdit = may.edit;

  return (
    <>
      <PageHeader title="Document Designs" href="/settings/document-designs" userId={current.user.id} />
      {!canEdit && <p className="mb-4 rounded-xl bg-surface-2 p-3 text-sm text-ink-2"><Words k="You can see and preview every design. The School Admin changes them." /></p>}
      <p className="-mt-3 mb-5 max-w-prose text-ink-2">
        <Words k="How receipts, certificates, ID cards, admit cards, report cards and salary slips look, with your logo, colours and signatures. Every module prints with the design chosen here." />
      </p>

      <div className="space-y-6">
        {GROUP_ORDER.map((group) => {
          const types = DOC_TYPES.filter((t) => t.group === group);
          return (
            <section key={group} aria-labelledby={`g-${group}`}>
              <h2 id={`g-${group}`} className="mb-2 text-lg font-semibold">{group}</h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {types.map((t) => {
                  const d = byType.get(t.key);
                  return (
                    <li key={t.key} className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold">{t.label}</h3>
                        {d ? <Badge tone="brand"><Words k="Version" /> {d.version}</Badge> : <Badge><Words k="Ready design" /></Badge>}
                      </div>
                      <p className="mt-1 text-sm text-ink-2">
                        {d ? `${BASES.find((b) => b.key === d.base)?.label ?? d.base} design, changed ${formatDate(d.createdAt, tz)}` : "Classic design, not changed"} <Words k="· printed by" /> {t.usedBy}
                      </p>
                      <div className="mt-auto flex flex-wrap gap-2 pt-3">
                        <Link href={`/settings/document-designs/${t.key}`} className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-ink hover:bg-brand-hover">{canEdit ? "Edit design" : "See design"}</Link>
                        <a href={`/settings/document-designs/${t.key}/pdf`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 text-sm font-medium hover:bg-surface-2">
                          <Words k="Preview PDF" /><span className="sr-only"> <Words k="of the" /> {t.label.toLowerCase()} <Words k="(opens in a new tab)" /></span>
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <Card>
          <CardHeader title="Signatories" description="People who sign documents. Add a picture of the signature to print it; otherwise a line is left to sign by hand." />
          <CardBody className="space-y-5">
            {signatories.length === 0 ? (
              <p className="text-ink-2"><Words k="No signatories yet. Add the Principal first; most certificates need that signature." /></p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {signatories.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                    <div className="grid h-14 w-24 shrink-0 place-items-center rounded-lg border border-line bg-white">
                      {s.image
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={s.image} alt={`Signature of ${s.name}`} className="max-h-12 max-w-[5.5rem] object-contain" />
                        : <span className="text-xs text-ink-2"><Words k="No picture" /></span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="truncate text-sm text-ink-2">{s.title}</p>
                    </div>
                    {canArchive && <ArchiveSignatory id={s.id} name={s.name} />}
                  </li>
                ))}
              </ul>
            )}
            {canCreate && (
              <details className="rounded-xl border border-line p-4" open={signatories.length === 0}>
                <summary className="min-h-11 cursor-pointer content-center font-medium"><Words k="Add a signatory" /></summary>
                <div className="mt-4"><SignatoryForm /></div>
              </details>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
