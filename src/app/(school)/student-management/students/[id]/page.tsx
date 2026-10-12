import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Avatar } from "@/components/students/avatar";
import { STATUS_LABEL, STATUS_TONE, STUDYING, PROFILE_CHANGES, type StudentStatusKey } from "@/lib/students/labels";
import { StudentNotFound } from "@/lib/students/access";
import { profileTabsFor, type SummaryItem } from "@/lib/students/profile-tabs";
import "@/lib/students/profile-tab-modules";
import { BASE, studentPage } from "../../_lib/page";
import { loadProfile } from "../../_lib/profile";
import { removePhoto, uploadPhoto } from "../../_actions/students";
import { PhotoUpload } from "./photo-upload";
import { AcademicsTab, BehaviourTab, DocumentsTab, HistoryTab, OverviewTab } from "./tabs";

export const metadata: Metadata = { title: "Student Profile" };

export default async function StudentProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; month?: string }> }) {
  const { id } = await params;
  const { tab: tabParam, month } = await searchParams;
  const { current, settings, year, can, tz } = await studentPage();
  const yearId = year?.id ?? null;

  let p;
  try {
    p = await withSchool(current.ctx, (tx) => loadProfile(tx, current, id, can, settings, yearId));
  } catch (e) {
    if (e instanceof StudentNotFound) notFound();
    throw e;
  }
  const s = p.student;
  const status = s.status as StudentStatusKey;
  const href = `${BASE}/students/${id}`;
  const args = { current, studentId: id, academicYearId: yearId, searchParams: { month: typeof month === "string" ? month : undefined } };

  // Tabs: this module's own, then those other modules registered, each by permission; never an empty tab.
  const registered = profileTabsFor(current);
  const tabs = [
    { key: "overview", label: "Overview", order: 10 },
    { key: "academics", label: "Academics", order: 20 },
    ...registered.map((t) => ({ key: t.key, label: t.label, order: t.order })),
    ...(can.seeBehaviour ? [{ key: "behaviour", label: "Behaviour", order: 100 }] : []),
    ...(can.seeDocuments ? [{ key: "documents", label: "Documents", order: 110 }] : []),
    { key: "history", label: "Timeline", order: 130 },
  ].sort((a, b) => a.order - b.order);
  const tab = tabs.find((t) => t.key === tabParam)?.key ?? "overview";

  const [summaries, todays, extraActions] = await Promise.all([
    Promise.all(registered.map((t) => (t.summary ? t.summary(args).catch(() => []) : Promise.resolve([] as SummaryItem[])))).then((x) => x.flat()),
    Promise.all(registered.map((t) => (t.today ? t.today(args).catch(() => []) : Promise.resolve([] as SummaryItem[])))).then((x) => x.flat()),
    Promise.all(registered.map((t) => (t.headerActions ? t.headerActions(args).catch(() => []) : Promise.resolve([])))).then((x) => x.flat()),
  ]);

  const strip: SummaryItem[] = [
    ...summaries,
    ...(can.seeBehaviour ? [{ label: "Behaviour", value: p.points !== null ? `${p.points} points` : `${p.incidentsCount} this year`, href: `${href}?tab=behaviour`, tone: (p.openSuspension ? "danger" : "neutral") as SummaryItem["tone"] }] : []),
    ...(can.seeDocuments && settings.requiredDocuments.length ? [{ label: "Documents complete", value: `${p.documentsDone} of ${settings.requiredDocuments.length}`, href: `${href}?tab=documents`, tone: (p.documentsDone < settings.requiredDocuments.length ? "warning" : "success") as SummaryItem["tone"] }] : []),
  ];
  const todayIso = new Date().toISOString().slice(5, 10);
  const today: SummaryItem[] = [
    ...todays,
    ...(s.dateOfBirth && s.dateOfBirth.toISOString().slice(5, 10) === todayIso ? [{ label: "Birthday", value: "Today", tone: "success" as const }] : []),
    ...(p.openSuspension ? [{ label: "Suspended", value: `Until ${formatDate(p.openSuspension.incident.suspensionTo!, tz)}`, tone: "danger" as const, href: `${BASE}/behaviour/${p.openSuspension.incidentId}` }] : []),
    ...(p.leaving && can.reach === "all" ? [{ label: "Leaving", value: `Last date ${formatDate(p.leaving.lastDate, tz)}`, tone: "warning" as const, href: `${BASE}/leaving/${p.leaving.id}` }] : []),
  ];

  const studying = (STUDYING as readonly string[]).includes(status);
  const actions: { label: string; href: string; file?: boolean }[] = [
    ...extraActions,
    ...(can.manage && PROFILE_CHANGES[status]?.length ? [{ label: "Change status", href: `${href}/status` }] : []),
    ...(can.manage && studying ? [{ label: p.now ? "Change section" : "Place in a section", href: `${href}/section` }] : []),
    ...(can.contribute && can.seeBehaviour && studying ? [{ label: "Report incident", href: `${BASE}/behaviour/new?student=${id}` }] : []),
    ...(can.manage && can.reach === "all" ? [{ label: "Issue certificate", href: `${BASE}/certificates/new?student=${id}` }] : []),
    ...(can.manage && can.reach === "all" ? [{ label: "Print TC", href: `${BASE}/certificates/new?student=${id}&type=TC` }] : []),
    ...(can.reach === "all" && !can.lookupOnly && p.now ? [{ label: "Print ID card", href: `${BASE}/certificates/id-cards/print?ids=${id}`, file: true }] : []),
    ...(can.manage && studying && !p.leaving ? [{ label: "Start leaving", href: `${BASE}/leaving/new?student=${id}` }] : []),
  ];

  const sectionLabel = p.now?.section ? `${p.now.section.schoolClass.name} ${p.now.section.name}` : null;
  const restricted = p.links.filter((l) => l.restriction);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-2">
        <Link href={BASE} className="hover:underline">Student List</Link>
        {sectionLabel && p.now && <> / <Link className="hover:underline" href={`${BASE}?section=${p.now.sectionId}`}>{sectionLabel}</Link></>}
      </nav>
      <PageHeader title={s.fullName} href={href} userId={current.user.id}>
        <div className="flex flex-wrap gap-2">
          {actions.length > 0 && (
            <details className="relative">
              <summary className={buttonClass("secondary", "md", "list-none cursor-pointer")}>Actions</summary>
              <div className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-line bg-surface p-1 shadow-pop">
                {actions.map((a) => a.file
                  ? <a key={a.label} href={a.href} className="block rounded-lg px-3 py-2.5 hover:bg-surface-2">{a.label}</a>
                  : <Link key={a.label} href={a.href} className="block rounded-lg px-3 py-2.5 hover:bg-surface-2">{a.label}</Link>)}
              </div>
            </details>
          )}
          {can.manage && <ButtonLink href={`${href}/edit/personal`} variant="primary">Edit</ButtonLink>}
        </div>
      </PageHeader>

      {restricted.length > 0 && (
        <Alert tone="danger" title="Custody or access restriction" className="mb-4">
          {restricted.map((l) => <p key={l.id}><strong>Do not release to {l.guardian.name} ({l.relationship}).</strong> {can.reach === "all" && !can.lookupOnly ? `Note: ${l.restriction}` : "See the note with the School Admin."}</p>)}
        </Alert>
      )}

      <section aria-label="Student" className="mb-4 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:p-5">
        {can.manage ? (
          <PhotoUpload action={uploadPhoto.bind(null, id)} remove={removePhoto.bind(null, id)} hasPhoto={Boolean(p.photo)} name={s.fullName}>
            <Avatar name={s.fullName} src={p.photo} size="lg" />
          </PhotoUpload>
        ) : <Avatar name={s.fullName} src={p.photo} size="lg" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
            {p.photoWithdrawn && <Badge tone="warning">Photo consent withdrawn</Badge>}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[15px] sm:flex sm:flex-wrap">
            <div><dt className="text-sm text-ink-2">Class</dt><dd className="font-medium">{sectionLabel ?? "No class this year"}</dd></div>
            <div><dt className="text-sm text-ink-2">Roll number</dt><dd className="font-medium">{p.now?.rollNo ?? "None"}</dd></div>
            <div><dt className="text-sm text-ink-2">Admission number</dt><dd className="font-medium">{s.admissionNo}</dd></div>
            {s.dateOfBirth && <div><dt className="text-sm text-ink-2">Date of birth</dt><dd className="font-medium">{formatDate(s.dateOfBirth, tz)}</dd></div>}
          </dl>
        </div>
      </section>

      {strip.length > 0 && (
        <ul aria-label="Summary" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {strip.map((i) => {
            const body = (<><span className="block text-sm text-ink-2">{i.label}</span><span className={`text-lg font-semibold ${i.tone === "danger" ? "text-danger" : i.tone === "warning" ? "text-warn-text" : i.tone === "success" ? "text-success" : ""}`}>{i.value}</span></>);
            return <li key={i.label} className="rounded-xl border border-line bg-surface">{i.href ? <Link href={i.href} className="block p-3 hover:bg-surface-2">{body}</Link> : <div className="p-3">{body}</div>}</li>;
          })}
        </ul>
      )}

      {today.length > 0 && (
        <section aria-labelledby="today" className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <h2 id="today" className="font-semibold">Today</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {today.map((i) => {
              const tone = i.tone === "danger" ? "bg-danger-soft text-danger" : i.tone === "warning" ? "bg-warn-bg text-warn-text" : i.tone === "success" ? "bg-success-soft text-success" : "bg-surface-2";
              const body = <><strong>{i.label}:</strong> {i.value}</>;
              return <li key={i.label} className={`rounded-lg px-3 py-2 text-[15px] ${tone}`}>{i.href ? <Link href={i.href} className="hover:underline">{body}</Link> : body}</li>;
            })}
          </ul>
        </section>
      )}

      <nav aria-label="Profile sections" className="-mx-4 mb-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1">
          {tabs.map((t) => (
            <li key={t.key}>
              <Link href={t.key === "overview" ? href : `${href}?tab=${t.key}`} aria-current={t.key === tab ? "page" : undefined} scroll={false}
                className={`inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-[15px] ${t.key === tab ? "border-brand font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "overview" && <OverviewTab p={p} can={can} settings={settings} href={href} tz={tz} />}
      {tab === "academics" && <AcademicsTab p={p} can={can} href={href} tz={tz} />}
      {tab === "behaviour" && <BehaviourTab studentId={id} can={can} settings={settings} tz={tz} points={p.points} />}
      {tab === "documents" && <DocumentsTab p={p} can={can} settings={settings} tz={tz} />}
      {tab === "history" && <HistoryTab studentId={id} can={can} tz={tz} />}
      {registered.filter((t) => t.key === tab).map((t) => <RegisteredTab key={t.key} load={() => t.load(args)} />)}
    </>
  );
}

async function RegisteredTab({ load }: { load: () => Promise<React.ReactNode> }) {
  return <>{await load()}</>;
}
