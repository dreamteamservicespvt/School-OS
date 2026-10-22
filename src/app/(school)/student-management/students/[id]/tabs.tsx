// The Student Profile tabs this module owns: Overview, Academics, Behaviour,
// Documents and the timeline (03 §2), in the approved design (students.jsx).
// Each shows only what the person may see.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Award, CalendarCheck2, CircleCheck, Cake, Clock, Download, Eye, FileBadge, FileText, FolderOpen, Fingerprint, HeartHandshake, IdCard, ListChecks, LogOut, Medal, NotebookPen, Pencil, Plus, ShieldX, StickyNote, Sun, Trophy, TriangleAlert, Upload, UserRoundCheck, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { getCurrent } from "@/lib/current";
import { formatDate, formatDateTime } from "@/lib/format";
import { CONSENT_STATUS_LABEL, consentHowWords, languageLabel, BEHAVIOUR_KIND_LABEL, isPositive, RELATIONS, type BehaviourKind } from "@/lib/students/labels";
import type { StudentAbilities } from "@/lib/students/access";
import type { ResolvedSettings } from "@/lib/students/settings";
import type { SummaryItem } from "@/lib/students/profile-tabs";
import { studentTimeline, type TimelineItem as StudentEvent } from "@/lib/students/timeline";
import { ageOn, longDate, phoneShow, classShort } from "@/lib/students/show";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { DL, Empty, FileRow, Split, Col, Timeline, TONE_SOFT, type Tone } from "@/components/ui/blocks";
import { cx } from "@/components/ui/cx";
import { ActionForm, FormArea, FormSelect, FormText } from "@/components/students/action-form";
import { ActionButton, ConfirmAction } from "@/components/students/confirm-action";
import type { Profile } from "../../_lib/profile";
import { BASE } from "../../_lib/page";
import { addEmergencyAction, addNoteAction, archiveDocumentAction, archiveNoteAction, emergencyAction, uploadDocument } from "../../_actions/students";
import { pickupAction, setPrimaryAction, unlinkGuardianAction } from "../../_actions/guardians";
import { adjustPointsAction } from "../../_actions/behaviour";
import { Words } from "@/lib/i18n/client";

type Base = { can: StudentAbilities; tz: string };

/** "Given by Srinivas Kumar, 12-06-2026 · Paper form, recorded by the office" */
function apaarWords(c: NonNullable<Profile["apaarConsent"]>, tz: string) {
  const when = c.on ? formatDate(c.on, c.how === "paper-form" ? "UTC" : tz) : "";
  if (c.state === "GIVEN") return `Given by ${c.guardianName ?? "a parent"}${when ? `, ${when}` : ""} · ${consentHowWords(c.how)}`;
  if (c.state === "WITHDRAWN") return `Withdrawn by ${c.guardianName ?? "a parent"}${when ? `, ${when}` : ""}`;
  if (c.state === "REFUSED") return `${c.guardianName ?? "A parent"} said no on a paper form${when ? ` dated ${when}` : ""}`;
  if (c.state === "REQUESTED") return "Asked in Parent Link, waiting for the parent";
  return "Not given. A parent gives it in Parent Link, on the application form or on a signed paper form.";
}

/** The small "Edit" link on a card (students.jsx EditBtn). */
export function EditLink({ href, label = "Edit", icon: Icon = Pencil }: { href: string; label?: string; icon?: LucideIcon }) {
  return <Link href={href} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand h-8 px-2 rounded-xl hover:bg-brand/8 shrink-0"><Icon size={14} aria-hidden="true" />{label}</Link>;
}
const editLink = (href: string, section: string, can: StudentAbilities) => (can.manage ? <EditLink href={`${href}/edit/${section}`} /> : undefined);

const TODAY_TONE: Record<string, { icon: LucideIcon; cls: string }> = {
  success: { icon: CircleCheck, cls: "text-ok" },
  warning: { icon: TriangleAlert, cls: "text-warn" },
  danger: { icon: TriangleAlert, cls: "text-bad" },
  neutral: { icon: Clock, cls: "text-ink3" },
};

export function OverviewTab({ p, can, settings, href, tz, today }: Base & { p: Profile; settings: ResolvedSettings; href: string; today: SummaryItem[] }) {
  const s = p.student;
  const address = [s.address, s.city, s.state, s.pinCode].filter(Boolean).join(", ") || null;
  const v = can.view;
  const showIds = v.personal && !can.lookupOnly && (can.seeRestricted || p.identifiers.some((i) => i.value));
  return (
    <Split side={340}>
      <Col>
        {(v.personal || v.address) && (
          <Card>
            <CardHeader title="Personal details" action={editLink(href, "personal", can)} />
            <DL rows={[
              ...(v.personal ? [
                ["Date of birth", s.dateOfBirth ? `${longDate(s.dateOfBirth, tz)} (${ageOn(s.dateOfBirth)} years)` : null],
                ["Gender", s.gender],
                ["Blood group", s.bloodGroup],
              ] as [string, React.ReactNode][] : []),
              ["Admitted on", s.joiningDate ? longDate(s.joiningDate, tz) : null],
              ...(v.address ? [["Home address", address]] as [string, React.ReactNode][] : []),
              ...(v.personal && !can.lookupOnly ? [["Category", s.category], ["Religion", s.religion], ["Mother tongue", s.motherTongue]] as [string, React.ReactNode][] : []),
            ]} />
          </Card>
        )}

        {v.parents && <ParentsCard p={p} can={can} href={href} />}
        {v.siblings && <SiblingsCard p={p} />}
        {v.emergency && <EmergencyCard p={p} can={can} />}

        <Card>
          <CardHeader title="Contact and enrolment" action={editLink(href, "contact", can)} />
          <DL rows={[
            ["Admission number", <span key="a" className="font-mono text-[14px]">{s.admissionNo}</span>],
            ["Class and section", p.now?.section ? `${classShort(p.now.section.schoolClass.name, p.now.section.name)}${p.now.rollNo ? ` · Roll ${p.now.rollNo}` : ""}` : "No class this year"],
            ...(v.address ? [["Permanent address", p.permanentAddress]] as [string, React.ReactNode][] : []),
            ...(v.personal && v.phones ? [["Student's phone", p.studentPhone ? phoneShow(p.studentPhone) : null], ["Student's email", p.studentEmail]] as [string, React.ReactNode][] : []),
          ]} />
          {can.manage && <div className="px-5 pb-4 -mt-2"><EditLink href={`${href}/edit/enrolment`} label="Edit enrolment" /></div>}
        </Card>

        {p.customFields.length > 0 && (
          <Card>
            <CardHeader title="Extra fields" description="Added by the school in Settings, Forms & Approvals" action={editLink(href, "extra", can)} />
            <DL rows={p.customFields.map((f) => [f.label, f.fieldType === "date" && p.extra[f.key] ? formatDate(new Date(`${p.extra[f.key]}T00:00:00Z`), tz) : p.extra[f.key] ?? null])} />
          </Card>
        )}

        {!can.lookupOnly && <NotesCard p={p} can={can} tz={tz} />}
      </Col>

      <Col>
        <Card>
          <CardHeader title="Today" icon={Sun} />
          <ul className="px-5 pb-5 flex flex-col gap-3 text-[14px]">
            {today.length === 0 && <li className="flex gap-3 text-ink3"><CircleCheck size={18} className="text-ok shrink-0 mt-0.5" aria-hidden="true" /><span><Words k="Nothing needs attention today." /></span></li>}
            {today.map((t) => {
              const look = t.label === "Birthday" ? { icon: Cake, cls: "text-brand" } : TODAY_TONE[t.tone ?? "neutral"];
              const body = <><b className="font-semibold">{t.label}</b> · {t.value}</>;
              return (
                <li key={t.label} className="flex gap-3">
                  <look.icon size={18} className={cx("shrink-0 mt-0.5", look.cls)} aria-hidden="true" />
                  <span>{t.href ? <Link href={t.href} className="hover:underline">{body}</Link> : body}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        {v.pickup && !can.lookupOnly && (
          <Card>
            <CardHeader title="Pickup list" description="Who may collect the student. Front Office uses this list." icon={UserRoundCheck} />
            <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[14px]">
              {p.pickups.allowed.length === 0 && <li className="text-ink3"><Words k="No one yet. Turn on “May pick up” for a parent below." /></li>}
              {p.pickups.allowed.map((g) => (
                <li key={g.guardianId} className="flex items-center gap-3"><Avatar name={g.name} size={30} /><span className="min-w-0 flex-1"><b className="font-semibold">{g.name}</b> <span className="text-ink3">· {g.relationship}</span></span><span className="tnum text-[13px] text-ink2">{phoneShow(g.phone)}</span></li>
              ))}
              {p.pickups.restricted.map((g) => (
                <li key={g.guardianId} className="rounded-xl bg-bad/10 px-3 py-2 text-bad flex items-center gap-2"><ShieldX size={16} aria-hidden="true" /><span><b className="font-semibold"><Words k="Do not release to" /> {g.name}</b> ({g.relationship})</span></li>
              ))}
            </ul>
          </Card>
        )}

        {showIds && (
          <Card>
            <CardHeader title="Identifiers" description={can.seeRestricted ? "Restricted. You can see these in full." : "Restricted. Shown masked."} icon={Fingerprint} action={can.seeRestricted ? editLink(href, "identifiers", can) : undefined} />
            <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[14px]">
              {p.identifiers.map((i) => (
                <li key={i.key} className="flex items-center justify-between gap-3">
                  <span className="min-w-0"><span className="block">{i.label}</span><span className="block text-[13px] text-ink3 font-mono">{i.value ?? "Not added"}</span></span>
                  <Pill tone={i.level === "highly" ? "bad" : "warn"}>{i.level === "highly" ? "Highly restricted" : "Restricted"}</Pill>
                </li>
              ))}
            </ul>
            {p.apaarConsent && (
              <p className="px-5 pb-3 -mt-1 text-[13.5px] flex items-center justify-between gap-3">
                <span className="min-w-0"><span className="block"><Words k="APAAR consent" /></span><span className="block text-[12.5px] text-ink3">{apaarWords(p.apaarConsent, tz)}</span></span>
                <Pill tone={p.apaarConsent.state === "GIVEN" ? "ok" : p.apaarConsent.state === "WITHDRAWN" || p.apaarConsent.state === "REFUSED" ? "bad" : "warn"}>{CONSENT_STATUS_LABEL[p.apaarConsent.state]}</Pill>
              </p>
            )}
            <p className="px-5 pb-4 -mt-1 text-[12.5px] text-ink3"><Words k={"APAAR and PEN are exported from Reports & Analytics, Government Reports."} /></p>
          </Card>
        )}

        {settings.rfidOn && can.reach === "all" && !can.lookupOnly && (
          <Card>
            <CardHeader title="RFID card" description="For attendance devices" icon={IdCard} />
            <p className="px-5 pb-5 text-[14px] text-ink2"><Words k={"The card number is recorded when the ID card is printed, on Certificates & ID Cards."} /></p>
          </Card>
        )}
      </Col>
    </Split>
  );
}

function ParentsCard({ p, can, href }: { p: Profile; can: StudentAbilities; href: string }) {
  const studentId = p.student.id;
  const primary = p.links.find((l) => l.isPrimary);
  return (
    <Card>
      <CardHeader title="Parents" description={primary ? `Fee receipts and Parent Link go to ${primary.guardian.name}'s number` : "Choose a primary contact for messages"}
        action={can.manage ? (
          <div className="flex flex-wrap gap-0.5">
            <EditLink href={`${BASE}/guardians/new?student=${studentId}`} label="Add" icon={Plus} />
            <EditLink href={`${BASE}/guardians/link?student=${studentId}`} label="Link existing" icon={Users} />
          </div>
        ) : undefined} />
      {p.links.length === 0 ? <p className="px-5 pb-5 text-[14px] text-ink3"><Words k="No parent or guardian is linked yet." /></p> : (
        <div className="grid sm:grid-cols-2 gap-3 px-5 pb-5">
          {p.links.map((l) => (
            <div key={l.id} className={cx("rounded-xl border p-3.5 flex flex-col gap-3", l.restriction ? "border-bad/40 bg-bad/[.04]" : "border-line")}>
              <div className="flex items-start gap-3">
                <Avatar name={l.guardian.name} size={40} />
                <div className="min-w-0 flex-1">
                  <Link href={`${BASE}/guardians/${l.guardianId}`} className="font-semibold text-[14.5px] leading-tight hover:underline">{l.guardian.name}</Link>
                  <p className="text-[12.5px] text-ink3">{l.relationship}{l.isPrimary ? " · Parent Link" : ""}{l.guardian.occupation ? ` · ${l.guardian.occupation}` : ""}</p>
                  <a href={`tel:+91${l.guardian.phone}`} className="block text-[14px] tnum mt-1.5 hover:underline">+91 {phoneShow(l.guardian.phone)}</a>
                  {l.guardian.email && <p className="text-[12.5px] text-ink3 truncate">{l.guardian.email}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {l.isPrimary && <Pill tone="brand" className="!h-[22px] !text-[11.5px]"><Words k="Primary contact" /></Pill>}
                {l.canPickUp && !l.restriction && <Pill tone="ok" className="!h-[22px] !text-[11.5px]"><Words k="May pick up" /></Pill>}
                {l.restriction && <Pill tone="bad" className="!h-[22px] !text-[11.5px]"><Words k="Custody restriction" /></Pill>}
                {l.guardian.optedOut && <Pill tone="warn" className="!h-[22px] !text-[11.5px]"><Words k="Opted out of messages" /></Pill>}
                <Pill className="!h-[22px] !text-[11.5px]">{languageLabel(l.guardian.language)}</Pill>
              </div>
              {l.restriction && !can.lookupOnly && <p className="text-[12.5px] text-bad"><Words k="Do not release to this person." /> {l.restriction}</p>}
              {can.manage && (
                <div className="flex flex-wrap gap-1 border-t border-line/70 pt-2.5 -mb-1">
                  {!l.isPrimary && !l.restriction && <ActionButton action={setPrimaryAction} fields={{ linkId: l.id, studentId }} variant="ghost"><Words k="Make primary" /></ActionButton>}
                  {!l.restriction && <ActionButton action={pickupAction} fields={{ linkId: l.id, studentId, on: l.canPickUp ? "0" : "1" }} variant="ghost">{l.canPickUp ? "Remove from pickup" : "May pick up"}</ActionButton>}
                  <Link href={`${href}/parents/${l.id}`} className="inline-flex h-8 items-center rounded-xl px-3 text-[13px] font-semibold text-ink2 hover:bg-sunken hover:text-ink"><Words k="Settings" /></Link>
                  {p.links.length > 1 && (
                    <ConfirmAction action={unlinkGuardianAction} fields={{ linkId: l.id, studentId }} trigger="Unlink" triggerVariant="ghost"
                      title={`Unlink ${l.guardian.name}?`} confirmLabel={`Unlink ${l.guardian.name}`} confirmVariant="danger">
                      {l.guardian.name} <Words k="will no longer be linked to" /> {p.student.fullName}<Words k=". Their record and other children stay as they are." />
                    </ConfirmAction>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SiblingsCard({ p }: { p: Profile }) {
  return (
    <Card>
      <CardHeader title="Brothers and sisters" description="Students at the school who share a parent" icon={Users} />
      {p.siblings.length === 0 ? <p className="px-5 pb-5 text-[14px] text-ink3"><Words k="No brother or sister at the school." /></p> : (
        <ul className="px-2 pb-2">
          {p.siblings.map((b) => (
            <li key={b.id}>
              <Link href={`${BASE}/students/${b.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-sunken/70">
                <Avatar name={b.name} src={b.photo} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold">{b.name}</span>
                  <span className="block text-[12.5px] text-ink3">{b.className ? classShort(b.className, b.sectionName) : "No class this year"} · <span className="font-mono">{b.admissionNo}</span></span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function EmergencyCard({ p, can }: { p: Profile; can: StudentAbilities }) {
  const studentId = p.student.id;
  const notListed = p.links.filter((l) => !l.emergencyOrder && !l.restriction);
  return (
    <Card>
      <CardHeader title="Emergency contacts" description="Called in this order" />
      {p.emergency.length === 0 ? <p className="px-5 pb-4 text-[14px] text-ink3"><Words k="No emergency contacts yet." /></p> : (
        <ol className="px-5 pb-3">
          {p.emergency.map((e, i) => (
            <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3 py-2 border-b border-line/70 last:border-0 flex-wrap">
              <span className="w-6 h-6 rounded-full bg-sunken text-[12px] font-bold grid place-items-center tnum shrink-0">{i + 1}</span>
              <span className="flex-1 min-w-0 text-[14px]"><b className="font-semibold">{e.name}</b> <span className="text-ink3">· {e.relation}</span>{e.restricted && <Pill tone="bad" className="ml-1.5 !h-5 !text-[11px]"><Words k="Restricted" /></Pill>}</span>
              <a className="text-[14px] tnum hover:underline" href={`tel:+91${e.phone}`}>{phoneShow(e.phone)}</a>
              {can.manage && (
                <span className="flex gap-0.5">
                  {i > 0 && <ActionButton action={emergencyAction} fields={{ studentId, op: "up", kind: e.kind, itemId: e.id }} variant="ghost"><span aria-hidden="true">↑</span><span className="sr-only"><Words k="Move" /> {e.name} <Words k="up" /></span></ActionButton>}
                  {i < p.emergency.length - 1 && <ActionButton action={emergencyAction} fields={{ studentId, op: "down", kind: e.kind, itemId: e.id }} variant="ghost"><span aria-hidden="true">↓</span><span className="sr-only"><Words k="Move" /> {e.name} <Words k="down" /></span></ActionButton>}
                  <ActionButton action={emergencyAction} fields={{ studentId, op: "remove", kind: e.kind, itemId: e.id }} variant="ghost"><Words k="Remove" /></ActionButton>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {can.manage && (
        <div className="px-5 pb-4 flex flex-col gap-3">
          {notListed.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {notListed.map((l) => <ActionButton key={l.id} action={emergencyAction} fields={{ studentId, op: "add-guardian", kind: "guardian", itemId: l.id }} variant="soft"><Words k="Add" /> {l.guardian.name}</ActionButton>)}
            </div>
          )}
          <details className="group">
            <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-xl px-2 -ml-2 text-[13px] font-semibold text-brand hover:bg-brand/8 [&::-webkit-details-marker]:hidden"><Plus size={14} aria-hidden="true" /><Words k="Add another contact" /></summary>
            <ActionForm action={addEmergencyAction.bind(null, studentId)} submitLabel="Add contact" pendingText="Adding…" resetOnSuccess className="mt-3 grid gap-3 sm:grid-cols-3">
              <FormText name="name" label="Name" required />
              <FormSelect name="relation" label="Relation" required options={[...RELATIONS, "Grandparent", "Uncle", "Aunt", "Neighbour"].filter((r) => r !== "Other").concat("Other").map((r) => ({ value: r, label: r }))} defaultValue="Grandparent" />
              <FormText name="phone" label="Phone" required type="tel" inputMode="numeric" />
            </ActionForm>
          </details>
        </div>
      )}
    </Card>
  );
}

function NotesCard({ p, can, tz }: { p: Profile; can: StudentAbilities; tz: string }) {
  return (
    <Card>
      <CardHeader title="Notes" description="Private notes are seen only by the roles chosen and the person who wrote them" icon={StickyNote} />
      <div className="px-5 pb-5 flex flex-col gap-4">
        {can.contribute && (
          <details className="rounded-xl border border-line p-3.5 open:pb-4">
            <summary className="cursor-pointer list-none text-[14px] font-semibold text-brand flex items-center gap-1.5 [&::-webkit-details-marker]:hidden"><Plus size={15} aria-hidden="true" /><Words k="Add a note" /></summary>
            <ActionForm action={addNoteAction.bind(null, p.student.id)} submitLabel="Add note" pendingText="Adding…" resetOnSuccess className="mt-3 space-y-3">
              <FormArea name="text" label="Note" required rows={2} />
              <fieldset>
                <legend className="mb-1 text-[13px] font-semibold text-ink2"><Words k="Private to (leave all off for everyone who opens the profile)" /></legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {p.roles.map((r) => (
                    <label key={r.key} className="flex min-h-10 items-center gap-2 text-[14px]"><input type="checkbox" name="roles" value={r.key} className="size-[18px] accent-[rgb(var(--brand))]" />{r.name}</label>
                  ))}
                </div>
              </fieldset>
            </ActionForm>
          </details>
        )}
        {p.notes.length === 0 ? <p className="text-[14px] text-ink3"><Words k="No notes yet." /></p> : (
          <ul className="divide-y divide-line/70">
            {p.notes.map((n) => (
              <li key={n.id} className="py-3 first:pt-0">
                <p className="whitespace-pre-line text-[14.5px]">{n.text}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink3">
                  {formatDateTime(n.createdAt, tz)}
                  {n.visibleToRoles.length > 0 && <Pill tone="warn" className="!h-5 !text-[11px]"><Words k="Private:" /> {n.visibleToRoles.map((k) => p.roles.find((r) => r.key === k)?.name ?? k).join(", ")}</Pill>}
                  {can.manage && (
                    <ConfirmAction action={archiveNoteAction} fields={{ noteId: n.id, studentId: p.student.id }} trigger="Remove" triggerVariant="ghost" title="Remove this note?" confirmLabel="Remove note" confirmVariant="danger">
                      <Words k="The note is archived and kept in the history; it no longer shows on the profile." />
                    </ConfirmAction>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export async function AcademicsTab({ p, can, href, tz }: Base & { p: Profile; href: string }) {
  const current = await getCurrent();
  const subjects = p.now && current ? await withSchool(current.ctx, (tx) => tx.subjectClass.findMany({ where: { classId: p.now!.classId, archivedAt: null }, include: { subject: true } })) : [];
  const optional = new Set(p.now?.optionalSubjects ?? []);
  const shown = subjects.filter((x) => x.subject.type === "CORE" || optional.has(x.subjectId));
  return (
    <Split side={340}>
      <Card className="overflow-hidden">
        <CardHeader title="Class history" description="One row for every year. Past years are never changed." icon={ListChecks} />
        {p.history.length === 0 ? <p className="px-5 pb-5 text-[14px] text-ink3"><Words k="No class on record yet." /></p> : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-[14px] min-w-[480px]">
              <caption className="sr-only"><Words k="Class history" /></caption>
              <thead><tr className="text-[12px] text-ink3 text-left border-y border-line"><th className="px-5 py-2.5 font-semibold"><Words k="Year" /></th><th className="px-3 py-2.5 font-semibold"><Words k="Class" /></th><th className="px-3 py-2.5 font-semibold"><Words k="Roll" /></th><th className="px-5 py-2.5 font-semibold text-right"><Words k="Result" /></th></tr></thead>
              <tbody>
                {p.history.map((e) => {
                  const r = e.archivedAt ? "Undone" : { STUDYING: "Studying", PROMOTED: "Promoted", HELD_BACK: "Detained", LEFT: "Left" }[e.status];
                  return (
                    <tr key={e.id} className={cx("border-b border-line/70 last:border-0", e.archivedAt && "text-ink3 line-through")}>
                      <td className="px-5 py-3 tnum">{e.section?.academicYear.name ?? ""}</td>
                      <td className="px-3 py-3 font-semibold">{e.section ? classShort(e.section.schoolClass.name, e.section.name) : ""}</td>
                      <td className="px-3 py-3 tnum">{e.rollNo ?? "–"}</td>
                      <td className="px-5 py-3 text-right"><Pill tone={r === "Promoted" ? "ok" : r === "Detained" ? "warn" : r === "Studying" ? "info" : "neutral"}>{r}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Col>
        <Card>
          <CardHeader title="Subjects this year" icon={NotebookPen} />
          <div className="px-5 pb-5">
            {shown.length === 0 ? <p className="text-[14px] text-ink3">{p.now ? "No subjects are set for this class yet (Academic Management, Subjects)." : "No class this year."}</p> : (
              <ul className="flex flex-wrap gap-1.5">{shown.map((x) => <li key={x.id}><Pill tone={optional.has(x.subjectId) ? "brand" : "neutral"}>{x.subject.name}</Pill></li>)}</ul>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Previous school" description={p.previousLocked ? `Locked: ${p.previousLocked} is closed.` : undefined} icon={Award} action={editLink(href, "previous", can)} />
          {p.previous ? (
            <DL cols={1} rows={[["School", p.previous.schoolName], ["Board", p.previous.board], ["Last class", p.previous.lastClass], ["Year", p.previous.year], ["Marks or %", p.previous.marks], ["Last changed", formatDate(p.previous.updatedAt, tz)]]} />
          ) : <p className="px-5 pb-5 text-[14px] text-ink3">{p.student.previousSchool ?? "Not added."}</p>}
        </Card>
      </Col>
    </Split>
  );
}

const KIND_ICON = (kind: string): { icon: LucideIcon; tone: Tone } =>
  isPositive(kind) ? { icon: Trophy, tone: "ok" } : kind === "suspension" ? { icon: TriangleAlert, tone: "bad" } : { icon: TriangleAlert, tone: "warn" };

export async function BehaviourTab({ studentId, can, settings, tz, points }: Base & { studentId: string; settings: ResolvedSettings; points: number | null }) {
  const current = (await getCurrent())!;
  const data = await withSchool(current.ctx, async (tx) => {
    const incidents = await tx.behaviourIncidentStudent.findMany({ where: { studentId, incident: { archivedAt: null } }, include: { incident: true }, orderBy: { incident: { date: "desc" } }, take: 100 });
    const entries = settings.pointsOn ? await tx.behaviourPointEntry.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: 50 }) : [];
    const cases = can.seeCounselling ? await tx.counsellingCase.findMany({ where: { studentId, archivedAt: null }, orderBy: { openedOn: "desc" } }) : [];
    return { incidents, entries, cases };
  });
  return (
    <Split side={340}>
      <Card>
        <CardHeader title="Incidents and rewards" description="Newest first" icon={Medal} action={can.contribute ? <ButtonLink href={`${BASE}/behaviour/new?student=${studentId}`} size="sm" variant="soft" icon={Plus}><Words k="Report incident" /></ButtonLink> : undefined} />
        {data.incidents.length === 0 ? <Empty icon={Medal} title="Nothing recorded" body="Incidents, warnings, rewards and recognition show here." /> : (
          <div className="px-5">
            <Timeline items={data.incidents.map(({ incident: i }) => {
              const k = KIND_ICON(i.kind);
              return {
                icon: k.icon, tone: k.tone, href: `${BASE}/behaviour/${i.id}`,
                what: <><b className="font-semibold">{BEHAVIOUR_KIND_LABEL[i.kind as BehaviourKind] ?? i.kind}:</b> {i.description}</>,
                when: `${formatDate(i.date, tz)}${i.actionTaken ? ` · ${i.actionTaken}` : ""}${i.status === "CLOSED" ? " · Closed" : ""}`,
              };
            })} />
          </div>
        )}
      </Card>
      <Col>
        {settings.pointsOn && (
          <Card>
            <CardHeader title="Behaviour points" description="Added up this term" icon={Award} />
            <div className="px-5 pb-5 flex flex-col gap-4">
              <p className={cx("font-display text-[30px] font-semibold tnum leading-none", (points ?? 0) > 0 ? "text-ok" : (points ?? 0) < 0 ? "text-bad" : "")}>{(points ?? 0) > 0 ? "+" : ""}{points ?? 0}</p>
              {can.contribute && (
                <details className="rounded-xl border border-line p-3.5">
                  <summary className="cursor-pointer list-none text-[14px] font-semibold text-brand flex items-center gap-1.5 [&::-webkit-details-marker]:hidden"><Plus size={15} aria-hidden="true" /><Words k="Add or remove points" /></summary>
                  <ActionForm action={adjustPointsAction.bind(null, studentId)} submitLabel="Save points" pendingText="Saving…" resetOnSuccess className="mt-3 space-y-3">
                    <FormText name="points" label="Points" required inputMode="numeric" help="Use a minus sign to remove, for example -2." />
                    <FormText name="reason" label="Reason" required />
                  </ActionForm>
                </details>
              )}
              {data.entries.length > 0 && (
                <ul className="divide-y divide-line/70 text-[14px]">
                  {data.entries.map((e) => <li key={e.id} className="flex justify-between gap-2 py-2"><span className="min-w-0 truncate">{e.reason}</span><b className={cx("font-semibold tnum", e.points > 0 ? "text-ok" : "text-bad")}>{e.points > 0 ? `+${e.points}` : e.points}</b></li>)}
                </ul>
              )}
            </div>
          </Card>
        )}
        {can.seeCounselling && (
          <Card>
            <CardHeader title="Counselling" icon={HeartHandshake} />
            {data.cases.length === 0 ? <p className="px-5 pb-5 text-[14px] text-ink3"><Words k="No counselling case." /></p> : (
              <ul className="px-2 pb-2">
                {data.cases.map((c) => (
                  <li key={c.id}>
                    <Link href={`${BASE}/behaviour/counselling/${c.id}`} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                      <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", TONE_SOFT.brand)}><HeartHandshake size={19} aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1"><b className="block font-semibold text-[14.5px] truncate">{c.reason}</b><span className="text-[12.5px] text-ink3"><Words k="Opened" /> {formatDate(c.openedOn, tz)}</span></span>
                      <Pill tone={c.status === "OPEN" ? "info" : "neutral"}>{c.status === "OPEN" ? "Open" : "Closed"}</Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </Col>
    </Split>
  );
}

export function DocumentsTab({ p, can, settings, tz }: Base & { p: Profile; settings: ResolvedSettings }) {
  const have = new Set(p.documents.filter((d) => !d.guardianId).map((d) => d.kind));
  const missing = settings.requiredDocuments.filter((k) => !have.has(k));
  const total = settings.requiredDocuments.length;
  return (
    <Split side={340}>
      <Card>
        <CardHeader title="Documents" description={total ? `${p.documentsDone} of ${total} collected · links open for 15 minutes` : "Student and parent documents · links open for 15 minutes"} icon={FolderOpen}
          action={can.contribute ? <ButtonLink href="#upload-document" size="sm" variant="soft" icon={Upload}><Words k="Upload" /></ButtonLink> : undefined} />
        {p.documents.length === 0 && missing.length === 0 ? <Empty icon={FileText} title="No documents yet" body="Upload the birth certificate, transfer certificate and other papers here." /> : (
          <ul className="px-3 pb-3">
            {p.documents.map((d) => {
              const parent = d.guardianId ? p.links.find((l) => l.guardianId === d.guardianId)?.guardian.name : null;
              return (
                <FileRow key={d.id} name={<>{d.kind}{parent ? <span className="font-normal text-ink3"> · {parent}</span> : null}</>}
                  meta={`${d.file?.fileName ?? "File"} · added ${formatDate(d.createdAt, tz)}${d.note ? ` · ${d.note}` : ""}`}
                  actions={<>
                    <ButtonLink href={d.link} target="_blank" rel="noopener" size="sm" variant="ghost" icon={Eye}><Words k="View" /></ButtonLink>
                    <a href={`${d.link}&download=1`} aria-label={`Download ${d.kind}`} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-ink2 hover:bg-sunken"><Download size={15} aria-hidden="true" /></a>
                    {can.manage && (
                      <ConfirmAction action={archiveDocumentAction} fields={{ documentId: d.id, studentId: p.student.id }} trigger="Remove" triggerVariant="ghost" title={`Remove ${d.kind}?`} confirmLabel="Remove document" confirmVariant="danger">
                        <Words k="The document is archived and kept in the history; it no longer shows here." />
                      </ConfirmAction>
                    )}
                  </>} />
              );
            })}
            {missing.map((k) => <FileRow key={k} name={k} missing actions={can.contribute ? <ButtonLink href="#upload-document" size="sm" icon={Upload}><Words k="Add" /></ButtonLink> : undefined} />)}
          </ul>
        )}
      </Card>
      {can.contribute && (
        <Card id="upload-document" className="scroll-mt-24">
          <CardHeader title="Upload a document" description="Photo or PDF, up to 10 MB" icon={Upload} />
          <div className="px-5 pb-5">
            <ActionForm action={uploadDocument.bind(null, p.student.id)} submitLabel="Upload" pendingText="Uploading…" resetOnSuccess className="space-y-3.5">
              <FormSelect name="kind" label="Document" required placeholder="Choose" options={[...settings.requiredDocuments, "Other"].map((k) => ({ value: k, label: k }))} defaultValue={missing[0] ?? ""} />
              <FormText name="kindOther" label="If other, what is it?" />
              {p.links.length > 0 && <FormSelect name="guardianId" label="Belongs to" options={[{ value: "", label: "The student" }, ...p.links.map((l) => ({ value: l.guardianId, label: `${l.guardian.name} (${l.relationship})` }))]} />}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="doc-file" className="text-[13px] font-semibold text-ink2"><Words k="File" /><span className="text-bad" aria-hidden="true"> *</span></label>
                <input id="doc-file" name="file" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full rounded-xl border border-line bg-surface p-2 text-[14px] file:mr-3 file:h-9 file:rounded-xl file:border-0 file:bg-brand/10 file:px-3 file:font-semibold file:text-brand" />
              </div>
              <FormText name="note" label="Note" />
            </ActionForm>
          </div>
        </Card>
      )}
    </Split>
  );
}

const EVENT_ICON: Record<StudentEvent["kind"], { icon: LucideIcon; tone: Tone }> = {
  admission: { icon: UserRoundCheck, tone: "brand" },
  status: { icon: CalendarCheck2, tone: "neutral" },
  class: { icon: ArrowUpRight, tone: "ok" },
  behaviour: { icon: Medal, tone: "neutral" },
  certificate: { icon: FileBadge, tone: "info" },
  leaving: { icon: LogOut, tone: "warn" },
  document: { icon: FileText, tone: "neutral" },
  card: { icon: IdCard, tone: "neutral" },
};

export async function HistoryTab({ studentId, can, tz }: Base & { studentId: string }) {
  const current = (await getCurrent())!;
  const items = await withSchool(current.ctx, (tx) => studentTimeline(tx, studentId, { behaviour: can.seeBehaviour, documents: can.seeDocuments }));
  return (
    <Card className="p-5">
      {items.length === 0 ? <Empty icon={Clock} title="Nothing yet" body="Admission, class changes, certificates and more show here, newest first." /> : (
        <Timeline items={items.map((i) => ({ ...EVENT_ICON[i.kind], what: i.title, when: `${formatDateTime(i.at, tz)}${i.detail ? ` · ${i.detail}` : ""}` }))} />
      )}
    </Card>
  );
}
