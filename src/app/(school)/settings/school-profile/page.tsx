import type { Metadata } from "next";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { formatDate, formatDateTime } from "@/lib/format";
import { readListParams } from "@/lib/list";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ListToolbar } from "@/components/list/list-toolbar";
import { BOARDS, DOCUMENT_TYPES_VAULT, LANGUAGES, TIME_ZONES, readPreferences } from "@/lib/settings/profile-rules";
import { expiryState, mayOpenDocument, type DocVersion } from "@/lib/settings/vault";
import { DetailsForm } from "./details-form";
import { BoardForm, ComplianceForm, LogoForm, RegionForm } from "./sections";
import { Campuses } from "./campuses";
import { Documents, type DocRow } from "./documents";
import { schoolRoles } from "@/lib/school-roles";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("School Profile") };
}

/** A setting shown as text, for people who read School Profile but do not change it. */
function Facts({ rows, cols = "sm:grid-cols-2" }: { rows: [string, React.ReactNode][]; cols?: string }) {
  return (
    <dl className={`grid gap-4 ${cols}`}>
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-sm text-ink-2">{label}</dt>
          <dd className="break-words font-medium">{value || <span className="font-normal text-ink-2"><Words k="Not given" /></span>}</dd>
        </div>
      ))}
    </dl>
  );
}

const labelOf = (list: readonly { value: string; label: string }[], v: string | null | undefined) => (v ? list.find((x) => x.value === v)?.label ?? v : "");

const SECTIONS = [
  ["details", "School details"],
  ["board", "Board and curriculum"],
  ["region", "Language and region"],
  ["compliance", "Board compliance"],
  ["campuses", "Campuses"],
  ["documents", "School documents"],
] as const;

export default async function SchoolProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, may } = await requireSettingsPage("school-profile");
  const canEdit = may.edit;
  const params = readListParams(await searchParams, ["type", "status"]);
  const tz = current.school.timeZone;
  const roleKeys = current.roles.map((r) => r.key);

  const data = await withSchool(current.ctx, async (tx) => {
    const school = await tx.school.findUniqueOrThrow({ where: { id: current.school.id }, include: { group: true } });
    const campuses = await tx.campus.findMany({ orderBy: [{ isMain: "desc" }, { name: "asc" }] });
    const roles = await schoolRoles(tx, current.ctx, { where: { archivedAt: null, isEnabled: true, key: { not: null } }, orderBy: { name: "asc" }, select: { key: true, name: true } });
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
      {!canEdit && <p className="mb-4 rounded-xl bg-surface-2 p-3 text-sm text-ink-2"><Words k="You can see the school's profile here. The School Admin changes it." /></p>}
      <div className="space-y-5">
        <Card id="details" className="scroll-mt-20">
          <CardHeader title="School details" description="Shown on screens, receipts, certificates and messages. Each section saves on its own." />
          <CardBody className="space-y-8">
            <section aria-labelledby="logo-title">
              <h3 id="logo-title" className="mb-3 font-semibold"><Words k="Logo" /></h3>
              {canEdit ? <LogoForm logoHref={logoHref} /> : logoHref ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoHref} alt="School logo" className="size-28 rounded-xl border border-line object-contain p-2" />
              ) : <p className="text-ink-2"><Words k="No logo yet." /></p>}
            </section>
            {canEdit ? (
              <DetailsForm logoHref={logoHref} initial={{
                name: school.name, address: school.address ?? "", phone: school.phone ?? "", email: school.email ?? "", website: school.website ?? "",
                affiliationNumber: school.affiliationNumber ?? "", gstin: school.gstin ?? "", brandColor: school.brandColor ?? "",
              }} />
            ) : (
              <Facts rows={[
                ["School name", school.name], ["Address", school.address], ["Phone", school.phone], ["Email", school.email], ["Website address", school.website],
                ["Affiliation number", school.affiliationNumber], ["GSTIN", school.gstin],
                ["Brand colour", school.brandColor ? <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-5 rounded-full border border-line" style={{ background: school.brandColor }} /><span className="font-mono">{school.brandColor}</span></span> : null],
              ]} />
            )}
          </CardBody>
        </Card>

        <Card id="board" className="scroll-mt-20">
          <CardHeader title="Board and curriculum" description="The board sets defaults for grading, the report card and terms. The modules offer them; each can still be changed there." />
          <CardBody>
            {canEdit ? <BoardForm board={school.board ?? ""} secondBoard={prefs.secondBoard ?? ""} />
              : <Facts rows={[["Board", labelOf(BOARDS, school.board)], ["Second board", prefs.secondBoard ? labelOf(BOARDS, prefs.secondBoard) : "This school runs one board"]]} />}
          </CardBody>
        </Card>

        <Card id="region" className="scroll-mt-20">
          <CardHeader title="Language and region" description="Languages switched on here can be chosen for screens and for messages to parents." />
          <CardBody>
            {canEdit ? <RegionForm languages={school.languages} defaultLanguage={school.defaultLanguage} timeZone={school.timeZone} />
              : <Facts cols="sm:grid-cols-3" rows={[
                  ["Screen and message languages", school.languages.map((l) => labelOf(LANGUAGES, l)).join(", ")],
                  ["Default language", labelOf(LANGUAGES, school.defaultLanguage)],
                  ["Time zone", labelOf(TIME_ZONES, school.timeZone)],
                ]} />}
          </CardBody>
        </Card>

        <Card id="compliance" className="scroll-mt-20">
          <CardHeader title="Board compliance" description="Registration numbers the board and the government ask for." />
          <CardBody>
            {canEdit ? (
              <ComplianceForm board={school.board ?? ""} initial={{
                udiseCode: prefs.compliance?.udiseCode ?? "", boardSchoolCode: prefs.compliance?.boardSchoolCode ?? "",
                registrationNumber: prefs.compliance?.registrationNumber ?? "", panNumber: prefs.compliance?.panNumber ?? "",
              }} />
            ) : (
              <Facts rows={[
                ["UDISE+ code", prefs.compliance?.udiseCode], [school.board ? `${school.board} school code` : "Board school code", prefs.compliance?.boardSchoolCode],
                ["Society or trust registration number", prefs.compliance?.registrationNumber], ["PAN of the society or trust", prefs.compliance?.panNumber],
              ]} />
            )}
            <p className="mt-6 border-t border-line pt-4 text-sm text-ink-2">
              <Words k="School group:" /> {school.group ? <strong className="text-ink">{school.group.name}</strong> : "this school is not part of a school group"}.
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
