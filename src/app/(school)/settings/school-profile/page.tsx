import type { Metadata } from "next";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fileLink } from "@/lib/files";
import { formatDate, formatDateTime } from "@/lib/format";
import { readListParams } from "@/lib/list";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ListToolbar } from "@/components/list/list-toolbar";
import { DOCUMENT_TYPES_VAULT, readPreferences } from "@/lib/settings/profile-rules";
import { expiryState, mayOpenDocument, type DocVersion } from "@/lib/settings/vault";
import { DetailsForm } from "./details-form";
import { BoardForm, ComplianceForm, LogoForm, RegionForm } from "./sections";
import { Campuses } from "./campuses";
import { Documents, type DocRow } from "./documents";

export const metadata: Metadata = { title: "School Profile" };

const SECTIONS = [
  ["details", "School details"],
  ["board", "Board and curriculum"],
  ["region", "Language and region"],
  ["compliance", "Board compliance"],
  ["campuses", "Campuses"],
  ["documents", "School documents"],
] as const;

export default async function SchoolProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const current = await requirePage("settings");
  const canEdit = can(current.permissions, "settings", "edit");
  const params = readListParams(await searchParams, ["type", "status"]);
  const tz = current.school.timeZone;
  const roleKeys = current.roles.map((r) => r.key);

  const data = await withSchool(current.ctx, async (tx) => {
    const school = await tx.school.findUniqueOrThrow({ where: { id: current.school.id }, include: { group: true } });
    const campuses = await tx.campus.findMany({ orderBy: [{ isMain: "desc" }, { name: "asc" }] });
    const roles = await tx.role.findMany({ where: { archivedAt: null, isEnabled: true, key: { not: null } }, orderBy: { name: "asc" }, select: { key: true, name: true } });
    const docs = await tx.schoolDocument.findMany({ orderBy: [{ expiresOn: { sort: "asc", nulls: "last" } }, { title: "asc" }] });
    return { school, campuses, roles, docs, now: new Date().getTime() };
  });
  const { school, campuses } = data;
  const prefs = readPreferences(school.preferences);
  const now = data.now;
  const logoHref = school.logoFileId ? fileLink(school.logoFileId, school.id, now) : null;

  const visibleDocs = data.docs.filter((d) => mayOpenDocument(d, roleKeys));
  const q = params.q.toLowerCase();
  const filtered = visibleDocs.filter((d) => {
    if (Boolean(d.archivedAt) !== params.archived) return false;
    if (q && !`${d.title} ${d.docType}`.toLowerCase().includes(q)) return false;
    if (params.filters.type && d.docType !== params.filters.type) return false;
    const st = expiryState(d.expiresOn);
    const f = params.filters.status;
    if (f === "expired" && st !== "expired") return false;
    if (f === "soon" && st !== "soon") return false;
    if (f === "verified" && !d.verified) return false;
    if (f === "unverified" && d.verified) return false;
    return true;
  });
  const docRows: DocRow[] = filtered.map((d) => ({
    id: d.id,
    docType: d.docType,
    title: d.title,
    issuedOn: d.issuedOn ? formatDate(d.issuedOn, "UTC") : null,
    issuedOnIso: d.issuedOn?.toISOString().slice(0, 10) ?? "",
    expiresOn: d.expiresOn ? formatDate(d.expiresOn, "UTC") : null,
    expiresOnIso: d.expiresOn?.toISOString().slice(0, 10) ?? "",
    state: expiryState(d.expiresOn),
    verified: d.verified,
    visibleTo: d.visibleTo,
    archived: Boolean(d.archivedAt),
    versions: (d.versions as DocVersion[]).map((v, i) => ({ n: i + 1, fileName: v.fileName, uploadedAt: formatDateTime(new Date(v.uploadedAt), tz), href: fileLink(v.fileId, school.id, now) })),
  }));
  const attention = visibleDocs.filter((d) => !d.archivedAt && ["expired", "soon"].includes(expiryState(d.expiresOn))).length;

  return (
    <>
      <PageHeader title="School Profile" href="/settings/school-profile" userId={current.user.id} />
      <nav aria-label="Sections of this page" className="-mt-2 mb-5 flex flex-wrap gap-2 text-sm">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="min-h-9 rounded-full border border-line bg-surface px-3 py-1.5 hover:border-brand">
            {label}{id === "documents" && attention > 0 ? ` (${attention} need attention)` : ""}
          </a>
        ))}
      </nav>
      {!canEdit && <p className="mb-4 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">Your role can see these settings but not change them.</p>}
      <div className="space-y-5">
        <Card id="details" className="scroll-mt-20">
          <CardHeader title="School details" description="Shown on screens, receipts, certificates and messages. Each section saves on its own." />
          <CardBody className="space-y-8">
            <section aria-labelledby="logo-title">
              <h3 id="logo-title" className="mb-3 font-semibold">Logo</h3>
              {canEdit ? <LogoForm logoHref={logoHref} /> : logoHref ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoHref} alt="School logo" className="size-28 rounded-xl border border-line object-contain p-2" />
              ) : <p className="text-ink-2">No logo yet.</p>}
            </section>
            <DetailsForm logoHref={logoHref} initial={{
              name: school.name, address: school.address ?? "", phone: school.phone ?? "", email: school.email ?? "", website: school.website ?? "",
              affiliationNumber: school.affiliationNumber ?? "", gstin: school.gstin ?? "", brandColor: school.brandColor ?? "",
            }} />
          </CardBody>
        </Card>

        <Card id="board" className="scroll-mt-20">
          <CardHeader title="Board and curriculum" description="The board sets defaults for grading, the report card and terms. The modules offer them; each can still be changed there." />
          <CardBody><BoardForm board={school.board ?? ""} secondBoard={prefs.secondBoard ?? ""} /></CardBody>
        </Card>

        <Card id="region" className="scroll-mt-20">
          <CardHeader title="Language and region" description="Languages switched on here can be chosen for screens and for messages to parents." />
          <CardBody><RegionForm languages={school.languages} defaultLanguage={school.defaultLanguage} timeZone={school.timeZone} /></CardBody>
        </Card>

        <Card id="compliance" className="scroll-mt-20">
          <CardHeader title="Board compliance" description="Registration numbers the board and the government ask for." />
          <CardBody>
            <ComplianceForm board={school.board ?? ""} initial={{
              udiseCode: prefs.compliance?.udiseCode ?? "", boardSchoolCode: prefs.compliance?.boardSchoolCode ?? "",
              registrationNumber: prefs.compliance?.registrationNumber ?? "", panNumber: prefs.compliance?.panNumber ?? "",
            }} />
            <p className="mt-6 border-t border-line pt-4 text-sm text-ink-2">
              School group: {school.group ? <strong className="text-ink">{school.group.name}</strong> : "this school is not part of a school group"}.
              {school.group ? " Settings shared by the group are set by DREAM TEAM when the group is set up; this school's own settings above always apply here." : ""}
            </p>
          </CardBody>
        </Card>

        <Card id="campuses" className="scroll-mt-20">
          <CardHeader title="Campuses" description="Each site of the school, with its address, head and contact." />
          <CardBody>
            <Campuses canEdit={canEdit} campuses={campuses.map((c) => ({ id: c.id, name: c.name, address: c.address, phone: c.phone, headName: c.headName, isMain: c.isMain, archived: Boolean(c.archivedAt) }))} />
          </CardBody>
        </Card>

        <Card id="documents" className="scroll-mt-20">
          <CardHeader title="School documents" description="Registration, affiliation, NOCs and other papers, with versions, expiry reminders 30 days ahead, and sharing links that expire." />
          <CardBody>
            <ListToolbar placeholder="Search documents" filters={[
              { key: "type", label: "Type", options: DOCUMENT_TYPES_VAULT.map((t) => ({ value: t, label: t })) },
              { key: "status", label: "Status", options: [{ value: "expired", label: "Expired" }, { value: "soon", label: "Expires in 30 days" }, { value: "verified", label: "Verified" }, { value: "unverified", label: "Not verified" }] },
            ]} />
            <Documents docs={docRows} roles={data.roles.map((r) => ({ key: r.key!, name: r.name }))} canEdit={canEdit} total={visibleDocs.length} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
