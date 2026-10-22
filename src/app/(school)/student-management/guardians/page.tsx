import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ShieldAlert, ShieldCheck, ShieldX, Smartphone, UserPlus, Users, SearchX, MessageCircleOff } from "lucide-react";
import { withSchool } from "@/lib/db";
import { readListParams, orderByFor, listHref } from "@/lib/list";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Chips, Empty, ListFooter, Stats, Toolbar } from "@/components/ui/blocks";
import { ListToolbar } from "@/components/list/list-toolbar";
import { DataList, cardPill, type DataColumn } from "@/components/ui/data-list";
import { InlineBulkBar } from "@/components/ui/list-controls";
import { cx } from "@/components/ui/cx";
import { guardianConsentGroups, guardiansInReach } from "@/lib/students/guardian-list";
import { parentLinkProvider, parentLinkStatus } from "@/lib/students/guardians";
import { CONSENT_STATUS_LABEL } from "@/lib/students/labels";
import { phoneShow, classShort } from "@/lib/students/show";
import { shortDate } from "@/lib/students/show";
import { BASE, studentPageOnCampus } from "../_lib/page";
import { StudentsHead } from "../_lib/head";
import { sectionNames } from "../_lib/queries";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Parents & Guardians") };
}

const FILTERS = ["consent", "photo", "link", "relation", "campus"] as const;
const TONE = { GIVEN: "ok", WITHDRAWN: "bad", REFUSED: "bad", REQUESTED: "warn", NONE: "warn" } as const;
const STEP = 25;

export default async function GuardiansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  // One campus chosen on the Dashboard (?campus=): that campus's parents, as the card counted them.
  const { current, yearIds, can, tz } = await studentPageOnCampus(raw.campus);
  if (!can.seeParents) redirect(BASE);
  const params = readListParams(raw, FILTERS);
  const take = Math.min(500, Math.max(STEP, Number.parseInt(String(raw.n ?? ""), 10) || STEP));
  const provider = parentLinkProvider();
  const path = `${BASE}/guardians`;
  const f = params.filters;

  const data = await withSchool(current.ctx, async (tx) => {
    // The same reach and consent groups as the Dashboard's Parents and consent cards.
    const base = await guardiansInReach(tx, current, yearIds, { archived: params.archived });
    const { allIds, state, ...ids } = await guardianConsentGroups(tx, current, base);
    const links = provider ? await parentLinkStatus(tx, current.ctx, allIds) : new Map<string, { status: string; lastOpenedAt: Date | null }>();
    const notOpened = allIds.filter((id) => !links.get(id)?.lastOpenedAt);
    const activeLinks = allIds.filter((id) => links.get(id)?.status === "Active").length;
    const openedOnce = allIds.filter((id) => links.get(id)?.lastOpenedAt).length;

    const and: Prisma.GuardianWhereInput[] = [base];
    if (f.relation) and.push({ relationship: f.relation });
    if (f.consent === "not-given") and.push({ id: { in: ids.dataNot } });
    if (f.consent === "withdrawn") and.push({ id: { in: ids.dataWithdrawn } });
    if (f.photo === "not-given") and.push({ id: { in: ids.photoNot } });
    if (f.photo === "withdrawn") and.push({ id: { in: ids.photoWithdrawn } });
    if (provider && f.link === "not-opened") and.push({ id: { in: notOpened } });
    if (params.q) {
      const digits = params.q.replace(/\D/g, "");
      and.push({ OR: [{ name: { contains: params.q, mode: "insensitive" } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []), { students: { some: { archivedAt: null, student: { fullName: { contains: params.q, mode: "insensitive" } } } } }] });
    }
    const where: Prisma.GuardianWhereInput = { AND: and };
    const orderBy = orderByFor(params, { name: { name: params.dir }, phone: { phone: params.dir } }, { name: "asc" });
    const [total, rows, students, custody] = await Promise.all([
      tx.guardian.count({ where }),
      tx.guardian.findMany({
        where, orderBy: orderBy as object, take,
        include: { students: { where: { archivedAt: null }, include: { student: { include: { enrolments: { where: { archivedAt: null, ...(yearIds.length ? { academicYearId: { in: yearIds } } : {}) }, take: 1 } } } } } },
      }),
      tx.studentGuardian.findMany({ where: { archivedAt: null, guardianId: { in: allIds } }, select: { studentId: true }, distinct: ["studentId"] }),
      tx.studentGuardian.count({ where: { archivedAt: null, guardianId: { in: allIds }, restriction: { not: null } } }),
    ]);
    const names = await sectionNames(tx, rows.flatMap((r) => r.students.flatMap((s) => s.student.enrolments.map((e) => e.sectionId))));
    return {
      total, allCount: allIds.length, ids, notOpened: notOpened.length, activeLinks, openedOnce, students: students.length, custody,
      rows: rows.map((g) => ({
        ...g,
        children: g.students.map((l) => {
          const e = l.student.enrolments[0];
          const n = e ? names.get(e.sectionId) : null;
          return { id: l.studentId, name: l.student.fullName, cls: n ? classShort(n.className, n.sectionName) : "", restricted: Boolean(l.restriction) };
        }),
        data: state(g.id, "data-processing"),
        photo: state(g.id, "photo"),
        link: links.get(g.id) ?? null,
      })),
    };
  });
  type Row = (typeof data.rows)[number];

  const chipValue = f.consent === "not-given" ? "nocons" : f.consent === "withdrawn" ? "withdrawn" : f.photo === "not-given" ? "nophoto" : f.link === "not-opened" ? "notopen" : "all";
  const chip = (change: Record<string, string | null>) => listHref(path, { ...params, filters: { ...(f.relation ? { relation: f.relation } : {}), ...(f.campus ? { campus: f.campus } : {}) }, page: 1 }, { consent: null, photo: null, link: null, ...change, page: null });
  const linkPill = (g: Row, cls?: string) => !provider ? null
    : g.link?.status === "Active" ? <Pill tone="ok" className={cls}>{cls ? "Link active" : "Active"}</Pill>
      : g.link?.status === "Revoked" ? <Pill tone="bad" className={cls}>{cls ? "Link revoked" : "Revoked"}</Pill>
        : <Pill className={cls}>{cls ? "Link not sent" : "Not sent"}</Pill>;

  const columns: DataColumn<Row>[] = [
    { key: "name", label: "Name", sortHref: listHref(path, params, { sort: "name", dir: params.sort === "name" && params.dir === "asc" ? "desc" : "asc", page: null }), sorted: params.sort === "name" ? params.dir : null, render: (g) => (
      <div className="flex items-center gap-3">
        <Avatar name={g.name} size={34} />
        <div className="min-w-0">
          <p className="font-semibold leading-tight flex items-center gap-1.5 whitespace-nowrap">{g.name}{g.children.some((c) => c.restricted) && <ShieldX size={15} className="text-bad" aria-label="Custody restriction" />}</p>
          <p className="text-[12px] text-ink3">{g.relationship}</p>
        </div>
      </div>
    ) },
    { key: "phone", label: "Phone", nowrap: true, render: (g) => <span className="tnum text-[13.5px]">{phoneShow(g.phone)}</span> },
    { key: "children", label: "Children", render: (g) => g.children.length ? <div className="flex flex-col gap-0.5">{g.children.map((c) => <span key={c.id} className="text-[13.5px] whitespace-nowrap">{c.name}{c.cls && <span className="text-ink3"> · {c.cls}</span>}</span>)}</div> : <span className="text-ink3 text-[13px]"><Words k="No children linked" /></span> },
    { key: "occupation", label: "Occupation", render: (g) => <span className="text-[13.5px]">{g.occupation ?? "–"}</span> },
    { key: "optedOut", label: "Opted out", render: (g) => <span className={cx("text-[13.5px]", g.optedOut && "text-warn font-semibold")}>{g.optedOut ? "Yes" : "No"}</span> },
    { key: "consent", label: "Data consent", render: (g) => <Pill tone={TONE[g.data]}>{g.data === "NONE" ? "Not given" : CONSENT_STATUS_LABEL[g.data]}</Pill> },
    ...(provider ? [{ key: "link", label: "Parent Link", render: (g: Row) => <div>{linkPill(g)}{g.link?.status === "Active" && <p className="text-[11.5px] text-ink3 mt-0.5 whitespace-nowrap">{g.link.lastOpenedAt ? `Opened ${shortDate(g.link.lastOpenedAt, tz)}` : "Not opened yet"}</p>}</div> }] : []),
  ];
  const filtered = Boolean(params.q || Object.keys(f).length || params.archived);

  return (
    <>
      <StudentsHead page="Parents & Guardians" href={path} sub="Parents’ details and phone numbers, linked to all their children in the school"
        actions={can.manage ? <ButtonLink href={`${path}/new`} variant="primary" icon={UserPlus}><Words k="Add parent or guardian" /></ButtonLink> : undefined} />
      <div className="flex flex-col gap-4">
        <Stats items={[
          { label: "Parents and guardians", value: data.allCount.toLocaleString("en-IN"), sub: `For ${data.students.toLocaleString("en-IN")} students`, icon: Users },
          { label: "Data consent not given", value: data.ids.dataNot.length.toLocaleString("en-IN"), sub: can.manage ? "Send a consent request" : "Waiting for the parent", tone: data.ids.dataNot.length ? "warn" : undefined, icon: ShieldAlert, href: chip({ consent: "not-given" }) },
          provider
            ? { label: "Parent Link active", value: data.activeLinks.toLocaleString("en-IN"), sub: data.allCount ? `${Math.round((data.openedOnce / data.allCount) * 100)}% opened at least once` : "None yet", tone: "ok", icon: Smartphone }
            : { label: "Data consent given", value: (data.allCount - data.ids.dataNot.length - data.ids.dataWithdrawn.length).toLocaleString("en-IN"), sub: `${data.ids.dataWithdrawn.length} withdrawn`, tone: "ok", icon: ShieldCheck },
          { label: "Custody flags", value: String(data.custody), sub: "Shown in red at pickup", tone: data.custody ? "bad" : undefined, icon: ShieldX },
        ]} />
        <Chips label="Quick filters" value={chipValue} options={[
          { value: "all", label: "All", count: data.allCount, href: chip({}) },
          { value: "nocons", label: "Consent not given", count: data.ids.dataNot.length, href: chip({ consent: "not-given" }) },
          { value: "withdrawn", label: "Consent withdrawn", count: data.ids.dataWithdrawn.length, href: chip({ consent: "withdrawn" }) },
          { value: "nophoto", label: "Photo consent not given", count: data.ids.photoNot.length, href: chip({ photo: "not-given" }) },
          ...(provider ? [{ value: "notopen", label: "Parent Link not opened yet", count: data.notOpened, href: chip({ link: "not-opened" }) }] : []),
        ]} />
        <Card className="overflow-hidden">
          <Toolbar>
            <ListToolbar placeholder="Parent name, child’s name or phone" showArchived={can.manage}
              filters={[{ key: "relation", label: "Relation", allLabel: "Every relation", options: ["Father", "Mother", "Guardian", "Other"].map((r) => ({ value: r, label: r })) }]} />
          </Toolbar>
          {can.manage && <InlineBulkBar form="guardian-bulk" actions={[{ label: "Send consent request", href: `${path}/consent`, icon: <ShieldCheck size={15} aria-hidden="true" /> }]} />}
          <DataList caption="Parents and guardians" rows={data.rows} columns={columns} rowKey={(g) => g.id} minWidth={1020}
            rowHref={(g) => `${path}/${g.id}`} rowLabel={(g) => `Open ${g.name}`}
            select={can.manage ? { form: "guardian-bulk", label: (g) => `Select ${g.name}`, value: (g) => g.id, allLabel: "Select every parent shown" } : undefined}
            mobile={(g) => ({
              title: <span className="inline-flex items-center gap-1.5">{g.name}{g.children.some((c) => c.restricted) && <ShieldX size={15} className="text-bad" aria-label="Custody restriction" />}</span>,
              sub: g.children.length ? `${g.relationship} of ${g.children.map((c) => `${c.name.split(" ")[0]}${c.cls ? ` (${c.cls})` : ""}`).join(", ")}` : g.relationship,
              avatar: g.name,
              pills: [
                <Pill key="c" tone={TONE[g.data]} className={cardPill}><Words k="Consent" /> {(g.data === "NONE" ? "not given" : CONSENT_STATUS_LABEL[g.data]).toLowerCase()}</Pill>,
                linkPill(g, cardPill),
                g.optedOut ? <Pill key="o" tone="warn" className={cardPill}><MessageCircleOff size={12} aria-hidden="true" /><Words k="Opted out" /></Pill> : null,
              ].filter(Boolean) as React.ReactNode[],
            })}
            footer={<ListFooter shown={data.rows.length} total={data.total} moreHref={data.rows.length < data.total ? listHref(path, params, { n: take + STEP, page: null }) : null} />}
            empty={filtered
              ? <Empty icon={SearchX} title="No parents match" body="Try the child’s name or the phone number." action={<ButtonLink href={path}><Words k="Clear filters" /></ButtonLink>} />
              : <Empty icon={Users} title="No parents yet" body="Parents are added with their children, on Add student or the import." action={can.manage ? <ButtonLink href={`${path}/new`} variant="primary" icon={UserPlus}><Words k="Add parent or guardian" /></ButtonLink> : undefined} />} />
        </Card>
      </div>
    </>
  );
}
