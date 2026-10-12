import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ArrowRightLeft, Award, BookOpen, Bus, CalendarCheck2, CalendarClock, FileBadge, FileOutput, FolderOpen, IdCard, IndianRupee, LogOut, Medal, MessageCircle, Pencil, ShieldAlert, ShieldX, TriangleAlert, Info } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { BUILT_MODULES } from "@/lib/modules";
import { can as allowed } from "@/lib/permissions";
import { STATUS_LABEL, STUDYING, PROFILE_CHANGES, type StudentStatusKey } from "@/lib/students/labels";
import { StudentNotFound } from "@/lib/students/access";
import { profileTabsFor, type SummaryItem } from "@/lib/students/profile-tabs";
import { classShort } from "@/lib/students/show";
import "@/lib/students/profile-tab-modules";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Banner } from "@/components/ui/blocks";
import { BackLink, PinButton } from "@/components/ui/module-head";
import { MoreMenu, type MenuItem } from "@/components/ui/more-menu";
import { cx } from "@/components/ui/cx";
import { BASE, studentPage } from "../../_lib/page";
import { loadProfile } from "../../_lib/profile";
import { removePhoto, uploadPhoto } from "../../_actions/students";
import { PhotoUpload } from "./photo-upload";
import { AcademicsTab, BehaviourTab, DocumentsTab, HistoryTab, OverviewTab } from "./tabs";
import { LibraryView, PickupView } from "./lookup-views";

export const metadata: Metadata = { title: "Student Profile" };

const ICONS: Record<string, LucideIcon> = { attendance: CalendarCheck2, exam: Award, result: Award, fee: IndianRupee, transport: Bus, bus: Bus, document: FolderOpen, library: BookOpen, behaviour: Medal, homework: CalendarClock };
const iconFor = (label: string) => Object.entries(ICONS).find(([k]) => label.toLowerCase().includes(k))?.[1] ?? Info;
const TONE = { success: "ok", warning: "warn", danger: "bad", neutral: undefined } as const;

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

  const view = can.view;
  const back = <BackLink href={p.now ? `${BASE}?class=${p.now.classId}&section=${p.now.sectionId}` : BASE} label="Students" sub={p.now?.section ? classShort(p.now.section.schoolClass.name, p.now.section.name) : undefined} />;
  // Front Office and Gate Security: the photo and the approved pickup list. The Librarian: name, photo and class.
  if (view.mode === "pickup") return <PickupView p={p} back={back} showPhones={view.phones} pickupHref={BUILT_MODULES.has("front-office") && allowed(current.permissions, "front-office", "create") ? "/front-office" : null} />;
  if (view.mode === "library") return <LibraryView p={p} back={back} />;

  // Tabs: this module's own, then those other modules registered, each by permission and by what this role sees; never an empty tab.
  const tabAllowed = (key: string) => view.tabs === null || view.tabs.includes(key);
  const registered = profileTabsFor(current).filter((t) => tabAllowed(t.key));
  const tabs = [
    { key: "overview", label: "Overview", order: 10 },
    ...(tabAllowed("academics") ? [{ key: "academics", label: "Academics", order: 20 }] : []),
    ...registered.map((t) => ({ key: t.key, label: t.label, order: t.order })),
    ...(can.seeBehaviour ? [{ key: "behaviour", label: "Behaviour", order: 100 }] : []),
    ...(can.seeDocuments ? [{ key: "documents", label: "Documents", order: 110 }] : []),
    ...(tabAllowed("history") ? [{ key: "history", label: "Timeline", order: 130 }] : []),
  ].sort((a, b) => a.order - b.order);
  const tab = tabs.find((t) => t.key === tabParam)?.key ?? "overview";

  const [summaries, todays, extraActions] = await Promise.all([
    Promise.all(registered.map((t) => (t.summary ? t.summary(args).catch(() => []) : Promise.resolve([] as SummaryItem[])))).then((x) => x.flat()),
    Promise.all(registered.map((t) => (t.today ? t.today(args).catch(() => []) : Promise.resolve([] as SummaryItem[])))).then((x) => x.flat()),
    Promise.all(registered.map((t) => (t.headerActions ? t.headerActions(args).catch(() => []) : Promise.resolve([])))).then((x) => x.flat()),
  ]);

  const docsTotal = settings.requiredDocuments.length;
  const strip: SummaryItem[] = [
    ...summaries,
    ...(can.seeDocuments && docsTotal ? [{ label: "Documents", value: `${p.documentsDone} of ${docsTotal}`, sub: p.documentsDone < docsTotal ? `${docsTotal - p.documentsDone} missing` : "All collected", href: `${href}?tab=documents`, tone: "neutral" as const }] : []),
    ...(can.seeBehaviour ? [{ label: "Behaviour", value: p.points !== null ? `${p.points > 0 ? "+" : ""}${p.points} points` : `${p.incidentsCount} ${p.incidentsCount === 1 ? "record" : "records"}`, sub: p.openSuspension ? "Suspended now" : "This year", href: `${href}?tab=behaviour`, tone: (p.openSuspension ? "danger" : "neutral") as SummaryItem["tone"] }] : []),
  ].slice(0, 6);
  const todayIso = new Date().toISOString().slice(5, 10);
  const today: SummaryItem[] = [
    ...todays,
    ...(s.dateOfBirth && s.dateOfBirth.toISOString().slice(5, 10) === todayIso ? [{ label: "Birthday", value: "Today", tone: "success" as const }] : []),
    ...(p.openSuspension ? [{ label: "Suspended", value: `Until ${formatDate(p.openSuspension.incident.suspensionTo!, tz)}`, tone: "danger" as const, href: `${BASE}/behaviour/${p.openSuspension.incidentId}` }] : []),
    ...(p.leaving && can.reach === "all" ? [{ label: "Leaving", value: `Last date ${formatDate(p.leaving.lastDate, tz)}`, tone: "warning" as const, href: `${BASE}/leaving/${p.leaving.id}` }] : []),
  ];

  const studying = (STUDYING as readonly string[]).includes(status);
  const icon = (I: LucideIcon) => <I size={17} aria-hidden="true" />;
  const collect = extraActions.find((a) => /collect/i.test(a.label));
  const menu: MenuItem[] = [
    ...extraActions.filter((a) => a !== collect).map((a) => ({ label: a.label, href: a.href })),
    ...(can.reach === "all" && !can.lookupOnly && p.now ? [{ label: "Print ID card", href: `${BASE}/certificates/id-cards/print?ids=${id}`, file: true, icon: icon(IdCard) }] : []),
    ...(can.manage && can.reach === "all" ? [{ label: "Issue certificate", href: `${BASE}/certificates/new?student=${id}`, icon: icon(FileBadge) }] : []),
    ...(can.manage && can.reach === "all" ? [{ label: "Transfer certificate (TC)", href: `${BASE}/certificates/new?student=${id}&type=TC`, icon: icon(FileOutput) }] : []),
    ...(can.manage && studying ? [{ label: p.now ? "Change section" : "Place in a section", href: `${href}/section`, icon: icon(ArrowRightLeft) }] : []),
    ...(can.manage ? [{ label: "Edit details", href: `${href}/edit/personal`, icon: icon(Pencil) }] : []),
    ...(can.manage && PROFILE_CHANGES[status]?.length ? [{ label: "Change status", href: `${href}/status`, icon: icon(ShieldAlert) }] : []),
    ...(can.contribute && can.seeBehaviour && studying ? [{ label: "Report incident", href: `${BASE}/behaviour/new?student=${id}`, icon: icon(TriangleAlert) }] : []),
    ...(can.manage && studying && !p.leaving ? [{ label: "Start leaving", href: `${BASE}/leaving/new?student=${id}`, icon: icon(LogOut), tone: "bad" as const }] : []),
  ];
  const message = BUILT_MODULES.has("communication") && allowed(current.permissions, "communication", "create") && view.parents && p.links.length > 0;

  const sectionLabel = p.now?.section ? classShort(p.now.section.schoolClass.name, p.now.section.name) : null;
  const restricted = p.links.filter((l) => l.restriction);
  const n = strip.length;
  const stripCols = n >= 6 ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6" : n === 5 ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-5" : n === 4 ? "grid-cols-2 xl:grid-cols-4" : n === 3 ? "grid-cols-3" : n === 2 ? "grid-cols-2" : "grid-cols-1";
  const statusTone = status === "ACTIVE" ? "ok" : status === "INACTIVE" ? "warn" : status === "ADMITTED" || status === "PROMOTED" ? "info" : "neutral";

  return (
    <>
      <BackLink href={p.now ? `${BASE}?class=${p.now.classId}&section=${p.now.sectionId}` : BASE} label="Students" sub={sectionLabel ?? undefined} />

      {restricted.length > 0 && (
        <Banner tone="bad" icon={ShieldX} className="mb-4" title="Custody restriction.">
          {restricted.map((l) => <span key={l.id} className="block">Do not release to {l.guardian.name} ({l.relationship.toLowerCase()}). {can.reach === "all" && !can.lookupOnly ? l.restriction : "See the note with the School Admin."}</span>)}
        </Banner>
      )}

      <Card className="overflow-hidden">
        <div className="h-16 md:h-20 bg-gradient-to-r from-brand to-brand/60 relative" aria-hidden="true"><div className="absolute inset-0 dotgrid opacity-50" /></div>
        <div className="relative px-4 md:px-6 pb-5 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex items-end gap-4 min-w-0 flex-1">
            <div className="rounded-full p-1 bg-surface shrink-0 -mt-10 md:-mt-12">
              {can.manage ? (
                <PhotoUpload action={uploadPhoto.bind(null, id)} remove={removePhoto.bind(null, id)} hasPhoto={Boolean(p.photo)} name={s.fullName}>
                  <Avatar name={s.fullName} src={p.photo} size={88} />
                </PhotoUpload>
              ) : <Avatar name={s.fullName} src={p.photo} size={88} />}
            </div>
            <div className="min-w-0 pt-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight leading-tight">{s.fullName}</h1>
                <Pill tone={statusTone} dot>{status === "ACTIVE" ? "Studying" : STATUS_LABEL[status]}</Pill>
                {p.photoWithdrawn && <Pill tone="warn">Photo consent withdrawn</Pill>}
                <PinButton label={s.fullName} href={href} userId={current.user.id} />
              </div>
              <p className="text-[13.5px] text-ink3 mt-0.5">
                {sectionLabel ?? "No class this year"}{p.now?.rollNo ? ` · Roll ${p.now.rollNo}` : ""} · <span className="font-mono text-[12.5px]">{s.admissionNo}</span>
              </p>
            </div>
          </div>
          {(collect || message || menu.length > 0) && (
            <div className="flex gap-2 relative">
              {collect && <ButtonLink href={collect.href} variant="primary" icon={IndianRupee} className="flex-1 lg:flex-none">{collect.label}</ButtonLink>}
              {message && <ButtonLink href={`/communication?for=students&ids=${id}`} variant={collect ? "secondary" : "primary"} icon={MessageCircle} className="flex-1 lg:flex-none"><span>Message<span className="hidden sm:inline"> parent</span></span></ButtonLink>}
              <MoreMenu items={menu} label={`More actions for ${s.fullName}`} />
            </div>
          )}
        </div>
        {n > 0 && (
          <div className={cx("grid border-t border-line gap-px bg-line/70", stripCols)}>
            {strip.map((m) => {
              const Ic = iconFor(m.label);
              const tone = m.tone ? TONE[m.tone] : undefined;
              const body = (
                <>
                  <p className="text-[12px] text-ink3 font-semibold flex items-center gap-1.5"><Ic size={14} aria-hidden="true" />{m.label}</p>
                  <p className={cx("font-semibold text-[17px] tnum mt-0.5", tone === "bad" && "text-bad", tone === "warn" && "text-warn")}>{m.value}</p>
                  {m.sub && <p className="text-[12px] text-ink3">{m.sub}</p>}
                </>
              );
              return m.href
                ? <Link key={m.label} href={m.href} scroll={false} className="bg-surface text-left px-4 md:px-5 py-3.5 hover:bg-sunken/60 transition">{body}</Link>
                : <div key={m.label} className="bg-surface text-left px-4 md:px-5 py-3.5">{body}</div>;
            })}
          </div>
        )}
      </Card>

      <nav aria-label="Profile sections" className="-mx-4 px-4 md:mx-0 md:px-0 mt-5">
        <ul className="flex gap-1 overflow-x-auto no-scrollbar border-b border-line">
          {tabs.map((t) => {
            const on = t.key === tab;
            return (
              <li key={t.key} className="shrink-0">
                <Link href={t.key === "overview" ? href : `${href}?tab=${t.key}`} aria-current={on ? "page" : undefined} scroll={false}
                  className={cx("relative flex items-center h-11 px-3.5 text-[13.5px] font-semibold whitespace-nowrap transition", on ? "text-brand" : "text-ink2 hover:text-ink")}>
                  {t.label}
                  {on && <span className="absolute left-2 right-2 -bottom-px h-[3px] rounded-t bg-brand" aria-hidden="true" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-5 animate-rise" key={tab}>
        {tab === "overview" && <OverviewTab p={p} can={can} settings={settings} href={href} tz={tz} today={today} />}
        {tab === "academics" && tabAllowed("academics") && <AcademicsTab p={p} can={can} href={href} tz={tz} />}
        {tab === "behaviour" && <BehaviourTab studentId={id} can={can} settings={settings} tz={tz} points={p.points} />}
        {tab === "documents" && <DocumentsTab p={p} can={can} settings={settings} tz={tz} />}
        {tab === "history" && tabAllowed("history") && <HistoryTab studentId={id} can={can} tz={tz} />}
        {registered.filter((t) => t.key === tab).map((t) => <RegisteredTab key={t.key} load={() => t.load(args)} />)}
      </div>
    </>
  );
}

async function RegisteredTab({ load }: { load: () => Promise<React.ReactNode> }) {
  return <>{await load()}</>;
}

