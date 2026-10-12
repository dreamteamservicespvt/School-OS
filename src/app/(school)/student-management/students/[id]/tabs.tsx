// The Student Profile tabs this module owns: Overview, Academics, Behaviour,
// Documents and the timeline (03 §2). Each shows only what the person may see.

import Link from "next/link";
import { SettingsLink } from "@/components/settings-link";
import { withSchool } from "@/lib/db";
import { getCurrent } from "@/lib/current";
import { formatDate, formatDateTime } from "@/lib/format";
import { languageLabel, BEHAVIOUR_KIND_LABEL, isPositive, type BehaviourKind } from "@/lib/students/labels";
import type { StudentAbilities } from "@/lib/students/access";
import type { ResolvedSettings } from "@/lib/students/settings";
import { studentTimeline } from "@/lib/students/timeline";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ActionForm, FormArea, FormSelect, FormText } from "@/components/students/action-form";
import { ActionButton, ConfirmAction } from "@/components/students/confirm-action";
import type { Profile } from "../../_lib/profile";
import { BASE } from "../../_lib/page";
import { addEmergencyAction, addNoteAction, archiveDocumentAction, archiveNoteAction, emergencyAction, uploadDocument } from "../../_actions/students";
import { pickupAction, setPrimaryAction, unlinkGuardianAction } from "../../_actions/guardians";
import { adjustPointsAction } from "../../_actions/behaviour";
import { RELATIONS } from "@/lib/students/labels";

type Base = { can: StudentAbilities; tz: string };

const editLink = (href: string, section: string, can: StudentAbilities) =>
  can.manage ? <Link href={`${href}/edit/${section}`} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2">Edit</Link> : undefined;

export function OverviewTab({ p, can, settings, href, tz }: Base & { p: Profile; settings: ResolvedSettings; href: string }) {
  const s = p.student;
  const restrictedIds = p.identifiers.filter((i) => i.value || can.seeRestricted);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Personal" action={editLink(href, "personal", can)} />
        <CardBody>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Full name">{s.fullName}</Detail>
            <Detail label="Date of birth">{s.dateOfBirth ? formatDate(s.dateOfBirth, tz) : null}</Detail>
            <Detail label="Gender">{s.gender}</Detail>
            <Detail label="Blood group">{s.bloodGroup}</Detail>
            {!can.lookupOnly && <Detail label="Category">{s.category}</Detail>}
            {!can.lookupOnly && <Detail label="Religion">{s.religion}</Detail>}
            {!can.lookupOnly && <Detail label="Mother tongue">{s.motherTongue}</Detail>}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Contact" action={editLink(href, "contact", can)} />
        <CardBody>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Address">{[s.address, s.city, s.state, s.pinCode].filter(Boolean).join(", ") || null}</Detail>
            <Detail label="Permanent address">{p.permanentAddress}</Detail>
            <Detail label="Student's phone">{p.studentPhone}</Detail>
            <Detail label="Student's email">{p.studentEmail}</Detail>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Enrolment" action={editLink(href, "enrolment", can)} />
        <CardBody>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Admission number">{s.admissionNo}</Detail>
            <Detail label="Admission date">{s.joiningDate ? formatDate(s.joiningDate, tz) : null}</Detail>
            <Detail label="Class and section">{p.now?.section ? `${p.now.section.schoolClass.name} ${p.now.section.name}` : "No class this year"}</Detail>
            <Detail label="Roll number">{p.now?.rollNo ?? null}</Detail>
          </dl>
        </CardBody>
      </Card>

      <ParentsCard p={p} can={can} href={href} />

      <EmergencyCard p={p} can={can} />

      {!can.lookupOnly && (
        <Card>
          <CardHeader title="Pickup list" description="Who may collect the student. Front Office, Student Pickup uses this list." />
          <CardBody>
            {p.pickups.allowed.length ? (
              <ul className="space-y-1">{p.pickups.allowed.map((g) => <li key={g.guardianId}>{g.name} <span className="text-ink-2">({g.relationship}, {g.phone})</span></li>)}</ul>
            ) : <p className="text-ink-2">No one is on the pickup list. Tick &quot;May pick up&quot; on a parent.</p>}
            {p.pickups.restricted.map((g) => (
              <p key={g.guardianId} className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-danger"><strong>Do not release to {g.name}</strong> ({g.relationship}). See note.</p>
            ))}
          </CardBody>
        </Card>
      )}

      {(restrictedIds.length > 0 || can.seeRestricted) && !can.lookupOnly && (
        <Card>
          <CardHeader title="Identifiers" description={can.seeRestricted ? "Restricted. You can see these in full." : "Restricted. Shown masked."} action={can.seeRestricted ? editLink(href, "identifiers", can) : undefined} />
          <CardBody>
            <dl className="grid gap-3 sm:grid-cols-2">
              {p.identifiers.map((i) => <Detail key={i.key} label={i.label}>{i.value}</Detail>)}
            </dl>
            <p className="mt-3 text-sm text-ink-2">APAAR and PEN are exported from Reports &amp; Analytics, Government Reports.</p>
          </CardBody>
        </Card>
      )}

      {p.customFields.length > 0 && (
        <Card>
          <CardHeader title="Extra fields" description={<>Added by the school in <SettingsLink href="/settings/forms-approvals">Settings, Forms &amp; Approvals</SettingsLink>.</>} action={editLink(href, "extra", can)} />
          <CardBody>
            <dl className="grid gap-3 sm:grid-cols-2">
              {p.customFields.map((f) => <Detail key={f.id} label={f.label}>{f.fieldType === "date" && p.extra[f.key] ? formatDate(new Date(`${p.extra[f.key]}T00:00:00Z`), tz) : p.extra[f.key] ?? null}</Detail>)}
            </dl>
          </CardBody>
        </Card>
      )}

      {!can.lookupOnly && <NotesCard p={p} can={can} tz={tz} />}

      {settings.rfidOn && can.reach === "all" && !can.lookupOnly && (
        <Card>
          <CardHeader title="RFID card" description="For attendance devices." />
          <CardBody><p className="text-ink-2">The card number is recorded when the ID card is printed, on Certificates &amp; ID Cards.</p></CardBody>
        </Card>
      )}
    </div>
  );
}

function ParentsCard({ p, can, href }: { p: Profile; can: StudentAbilities; href: string }) {
  const studentId = p.student.id;
  return (
    <Card>
      <CardHeader title="Parents and guardians" action={can.manage ? (
        <div className="flex flex-wrap gap-1">
          <Link href={`${BASE}/guardians/new?student=${studentId}`} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2">Add</Link>
          <Link href={`${BASE}/guardians/link?student=${studentId}`} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2">Link existing</Link>
        </div>
      ) : undefined} />
      <CardBody>
        {p.links.length === 0 ? <p className="text-ink-2">No parent or guardian is linked yet.</p> : (
          <ul className="divide-y divide-line">
            {p.links.map((l) => (
              <li key={l.id} className={`py-3 first:pt-0 last:pb-0 ${l.restriction ? "rounded-lg border-l-4 border-danger pl-3" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`${BASE}/guardians/${l.guardianId}`} className="font-medium text-brand-text hover:underline">{l.guardian.name}</Link>
                    <span className="text-ink-2"> · {l.relationship}</span>
                    <p className="text-[15px]"><a href={`tel:+91${l.guardian.phone}`} className="hover:underline">{l.guardian.phone}</a>{l.guardian.email ? ` · ${l.guardian.email}` : ""}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {l.isPrimary && <Badge tone="brand">Primary contact</Badge>}
                      {l.canPickUp && !l.restriction && <Badge tone="success">May pick up</Badge>}
                      {l.restriction && <Badge tone="danger">Custody restriction</Badge>}
                      {l.guardian.optedOut && <Badge tone="warning">Opted out of messages</Badge>}
                      <Badge>Messages in {languageLabel(l.guardian.language)}</Badge>
                    </div>
                    {l.restriction && !can.lookupOnly && <p className="mt-1 text-sm text-danger">Do not release to this person. Note: {l.restriction}</p>}
                  </div>
                  {can.manage && (
                    <div className="flex flex-wrap gap-1">
                      {!l.isPrimary && !l.restriction && <ActionButton action={setPrimaryAction} fields={{ linkId: l.id, studentId }}>Make primary</ActionButton>}
                      {!l.restriction && <ActionButton action={pickupAction} fields={{ linkId: l.id, studentId, on: l.canPickUp ? "0" : "1" }}>{l.canPickUp ? "Remove from pickup" : "May pick up"}</ActionButton>}
                      <Link href={`${href}/parents/${l.id}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-brand-text hover:bg-surface-2">Settings</Link>
                      {p.links.length > 1 && (
                        <ConfirmAction action={unlinkGuardianAction} fields={{ linkId: l.id, studentId }} trigger="Unlink" triggerVariant="ghost"
                          title={`Unlink ${l.guardian.name}?`} confirmLabel={`Unlink ${l.guardian.name}`} confirmVariant="danger">
                          {l.guardian.name} will no longer be linked to {p.student.fullName}. Their record and other children stay as they are.
                        </ConfirmAction>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function EmergencyCard({ p, can }: { p: Profile; can: StudentAbilities }) {
  const studentId = p.student.id;
  const notListed = p.links.filter((l) => !l.emergencyOrder && !l.restriction);
  return (
    <Card>
      <CardHeader title="Emergency contacts" description="Called in this order." />
      <CardBody className="space-y-4">
        {p.emergency.length === 0 ? <p className="text-ink-2">No emergency contacts yet.</p> : (
          <ol className="space-y-2">
            {p.emergency.map((e, i) => (
              <li key={`${e.kind}-${e.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                <span><strong>{i + 1}.</strong> {e.name} <span className="text-ink-2">({e.relation})</span> · <a className="hover:underline" href={`tel:+91${e.phone}`}>{e.phone}</a>{e.restricted && <Badge tone="danger" className="ml-1">Restricted</Badge>}</span>
                {can.manage && (
                  <span className="flex gap-1">
                    {i > 0 && <ActionButton action={emergencyAction} fields={{ studentId, op: "up", kind: e.kind, itemId: e.id }}><span aria-hidden="true">↑</span><span className="sr-only">Move {e.name} up</span></ActionButton>}
                    {i < p.emergency.length - 1 && <ActionButton action={emergencyAction} fields={{ studentId, op: "down", kind: e.kind, itemId: e.id }}><span aria-hidden="true">↓</span><span className="sr-only">Move {e.name} down</span></ActionButton>}
                    <ActionButton action={emergencyAction} fields={{ studentId, op: "remove", kind: e.kind, itemId: e.id }} variant="ghost">Remove</ActionButton>
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
        {can.manage && notListed.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {notListed.map((l) => <ActionButton key={l.id} action={emergencyAction} fields={{ studentId, op: "add-guardian", kind: "guardian", itemId: l.id }}>Add {l.guardian.name}</ActionButton>)}
          </div>
        )}
        {can.manage && (
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand-text">Add another contact</summary>
            <ActionForm action={addEmergencyAction.bind(null, studentId)} submitLabel="Add contact" pendingText="Adding…" resetOnSuccess className="mt-2 grid gap-3 sm:grid-cols-3">
              <FormText name="name" label="Name" required />
              <FormSelect name="relation" label="Relation" required options={[...RELATIONS, "Grandparent", "Uncle", "Aunt", "Neighbour"].filter((r) => r !== "Other").concat("Other").map((r) => ({ value: r, label: r }))} defaultValue="Grandparent" />
              <FormText name="phone" label="Phone" required type="tel" inputMode="numeric" />
            </ActionForm>
          </details>
        )}
      </CardBody>
    </Card>
  );
}

function NotesCard({ p, can, tz }: { p: Profile; can: StudentAbilities; tz: string }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Notes" description="Private notes are seen only by the roles chosen and the person who wrote them." />
      <CardBody className="space-y-4">
        {can.contribute && (
          <ActionForm action={addNoteAction.bind(null, p.student.id)} submitLabel="Add note" pendingText="Adding…" resetOnSuccess>
            <FormArea name="text" label="Note" required rows={2} />
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Private to (leave all unticked for everyone who opens the profile)</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {p.roles.map((r) => (
                  <label key={r.key} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="roles" value={r.key} className="size-5 accent-brand" />{r.name}</label>
                ))}
              </div>
            </fieldset>
          </ActionForm>
        )}
        {p.notes.length === 0 ? <p className="text-ink-2">No notes yet.</p> : (
          <ul className="divide-y divide-line">
            {p.notes.map((n) => (
              <li key={n.id} className="py-3">
                <p className="whitespace-pre-line">{n.text}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                  {formatDateTime(n.createdAt, tz)}
                  {n.visibleToRoles.length > 0 && <Badge tone="warning">Private: {n.visibleToRoles.map((k) => p.roles.find((r) => r.key === k)?.name ?? k).join(", ")}</Badge>}
                  {(can.manage) && (
                    <ConfirmAction action={archiveNoteAction} fields={{ noteId: n.id, studentId: p.student.id }} trigger="Remove" triggerVariant="ghost" title="Remove this note?" confirmLabel="Remove note" confirmVariant="danger">
                      The note is archived and kept in the history; it no longer shows on the profile.
                    </ConfirmAction>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export async function AcademicsTab({ p, can, href, tz }: Base & { p: Profile; href: string }) {
  const current = await getCurrent();
  const subjects = p.now && current ? await withSchool(current.ctx, (tx) => tx.subjectClass.findMany({ where: { classId: p.now!.classId, archivedAt: null }, include: { subject: true } })) : [];
  const optional = new Set(p.now?.optionalSubjects ?? []);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader title="Class history" description="One row for every year. Past years are never changed." />
        <CardBody>
          {p.history.length === 0 ? <p className="text-ink-2">No class on record yet.</p> : (
            <table className="w-full text-left text-[15px]">
              <caption className="sr-only">Class history</caption>
              <thead className="text-sm text-ink-2"><tr><th className="py-2 pr-3 font-medium">Year</th><th className="py-2 pr-3 font-medium">Class</th><th className="py-2 pr-3 font-medium">Roll</th><th className="py-2 font-medium">Result</th></tr></thead>
              <tbody className="divide-y divide-line">
                {p.history.map((e) => (
                  <tr key={e.id} className={e.archivedAt ? "text-ink-2 line-through" : ""}>
                    <td className="py-2 pr-3">{e.section?.academicYear.name ?? ""}</td>
                    <td className="py-2 pr-3">{e.section ? `${e.section.schoolClass.name} ${e.section.name}` : ""}</td>
                    <td className="py-2 pr-3">{e.rollNo ?? ""}</td>
                    <td className="py-2">{e.archivedAt ? "Undone" : { STUDYING: "Studying", PROMOTED: "Promoted", HELD_BACK: "Detained", LEFT: "Left" }[e.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Subjects this year" />
        <CardBody>
          {subjects.length === 0 ? <p className="text-ink-2">{p.now ? "No subjects are set for this class yet (Academic Management, Subjects)." : "No class this year."}</p> : (
            <ul className="flex flex-wrap gap-2">
              {subjects.filter((x) => x.subject.type === "CORE" || optional.has(x.subjectId)).map((x) => <li key={x.id}><Badge tone={optional.has(x.subjectId) ? "brand" : "neutral"}>{x.subject.name}</Badge></li>)}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Previous school" description={p.previousLocked ? `Locked: ${p.previousLocked} is closed.` : undefined} action={editLink(href, "previous", can)} />
        <CardBody>
          {p.previous ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="School">{p.previous.schoolName}</Detail>
              <Detail label="Board">{p.previous.board}</Detail>
              <Detail label="Last class">{p.previous.lastClass}</Detail>
              <Detail label="Year">{p.previous.year}</Detail>
              <Detail label="Marks or %">{p.previous.marks}</Detail>
              <Detail label="Last changed">{formatDate(p.previous.updatedAt, tz)}</Detail>
            </dl>
          ) : <p className="text-ink-2">{p.student.previousSchool ?? "Not added."}</p>}
        </CardBody>
      </Card>
    </div>
  );
}

export async function BehaviourTab({ studentId, can, settings, tz, points }: Base & { studentId: string; settings: ResolvedSettings; points: number | null }) {
  const current = (await getCurrent())!;
  const data = await withSchool(current.ctx, async (tx) => {
    const incidents = await tx.behaviourIncidentStudent.findMany({ where: { studentId, incident: { archivedAt: null } }, include: { incident: true }, orderBy: { incident: { date: "desc" } }, take: 100 });
    const entries = settings.pointsOn ? await tx.behaviourPointEntry.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: 50 }) : [];
    const cases = can.seeCounselling ? await tx.counsellingCase.findMany({ where: { studentId, archivedAt: null }, orderBy: { openedOn: "desc" } }) : [];
    return { incidents, entries, cases };
  });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Behaviour timeline" action={can.contribute ? <ButtonLink href={`${BASE}/behaviour/new?student=${studentId}`} size="sm">Report incident</ButtonLink> : undefined} />
        <CardBody>
          {data.incidents.length === 0 ? <p className="text-ink-2">Nothing recorded. Incidents, warnings, rewards and recognition show here.</p> : (
            <ol className="space-y-3">
              {data.incidents.map(({ incident: i }) => (
                <li key={i.id} className={`rounded-lg border-l-4 bg-surface-2 px-3 py-2 ${isPositive(i.kind) ? "border-success" : i.kind === "suspension" ? "border-danger" : "border-warn"}`}>
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge tone={isPositive(i.kind) ? "success" : i.kind === "suspension" ? "danger" : "warning"}>{BEHAVIOUR_KIND_LABEL[i.kind as BehaviourKind] ?? i.kind}</Badge>
                    <span className="text-sm text-ink-2">{formatDate(i.date, tz)}</span>
                    {i.status === "CLOSED" && <Badge>Closed</Badge>}
                  </p>
                  <Link href={`${BASE}/behaviour/${i.id}`} className="mt-1 block hover:underline">{i.description}</Link>
                  {i.actionTaken && <p className="text-sm text-ink-2">Action taken: {i.actionTaken}</p>}
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
      <div className="space-y-4">
        {settings.pointsOn && (
          <Card>
            <CardHeader title="Behaviour points" description={`Total: ${points ?? 0}`} />
            <CardBody className="space-y-3">
              {can.contribute && (
                <ActionForm action={adjustPointsAction.bind(null, studentId)} submitLabel="Save points" pendingText="Saving…" resetOnSuccess className="space-y-3">
                  <FormText name="points" label="Points" required inputMode="numeric" help="Use a minus sign to remove, for example -2." />
                  <FormText name="reason" label="Reason" required />
                </ActionForm>
              )}
              <ul className="divide-y divide-line text-[15px]">
                {data.entries.map((e) => <li key={e.id} className="flex justify-between gap-2 py-1.5"><span>{e.reason}</span><strong className={e.points > 0 ? "text-success" : "text-danger"}>{e.points > 0 ? `+${e.points}` : e.points}</strong></li>)}
              </ul>
            </CardBody>
          </Card>
        )}
        {can.seeCounselling && (
          <Card>
            <CardHeader title="Counselling" />
            <CardBody>
              {data.cases.length === 0 ? <p className="text-ink-2">No counselling case.</p> : (
                <ul className="space-y-2">
                  {data.cases.map((c) => <li key={c.id}><Link className="font-medium text-brand-text hover:underline" href={`${BASE}/behaviour/counselling/${c.id}`}>{c.reason}</Link> <Badge tone={c.status === "OPEN" ? "warning" : "neutral"}>{c.status === "OPEN" ? "Open" : "Closed"}</Badge></li>)}
                </ul>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

export function DocumentsTab({ p, can, settings, tz }: Base & { p: Profile; settings: ResolvedSettings }) {
  const have = new Set(p.documents.filter((d) => !d.guardianId).map((d) => d.kind));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Documents" description="Student and parent documents. Links open for 15 minutes." />
        <CardBody>
          {p.documents.length === 0 ? <EmptyState title="No documents yet">Upload the birth certificate, transfer certificate and other papers here.</EmptyState> : (
            <ul className="divide-y divide-line">
              {p.documents.map((d) => {
                const parent = d.guardianId ? p.links.find((l) => l.guardianId === d.guardianId)?.guardian.name : null;
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-medium">{d.kind}{parent ? <span className="font-normal text-ink-2"> · {parent}</span> : null}</p>
                      <p className="text-sm text-ink-2">{d.file?.fileName ?? "File"} · {formatDate(d.createdAt, tz)}{d.note ? ` · ${d.note}` : ""}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <a href={d.link} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2">Preview</a>
                      <a href={`${d.link}&download=1`} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2">Download</a>
                      {can.manage && (
                        <ConfirmAction action={archiveDocumentAction} fields={{ documentId: d.id, studentId: p.student.id }} trigger="Remove" triggerVariant="ghost" title={`Remove ${d.kind}?`} confirmLabel="Remove document" confirmVariant="danger">
                          The document is archived and kept in the history; it no longer shows here.
                        </ConfirmAction>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
      <div className="space-y-4">
        {settings.requiredDocuments.length > 0 && (
          <Card>
            <CardHeader title="Checklist" description={`${p.documentsDone} of ${settings.requiredDocuments.length} complete`} />
            <CardBody>
              <ul className="space-y-1">
                {settings.requiredDocuments.map((k) => <li key={k} className="flex items-center gap-2"><span aria-hidden="true" className={have.has(k) ? "text-success" : "text-ink-2"}>{have.has(k) ? "✓" : "○"}</span>{k}<span className="sr-only">{have.has(k) ? " (uploaded)" : " (missing)"}</span></li>)}
              </ul>
            </CardBody>
          </Card>
        )}
        {can.contribute && (
          <Card>
            <CardHeader title="Upload a document" />
            <CardBody>
              <ActionForm action={uploadDocument.bind(null, p.student.id)} submitLabel="Upload" pendingText="Uploading…" resetOnSuccess>
                <FormSelect name="kind" label="Document" required placeholder="Choose" options={[...settings.requiredDocuments, "Other"].map((k) => ({ value: k, label: k }))} />
                <FormText name="kindOther" label="If other, what is it?" />
                {p.links.length > 0 && <FormSelect name="guardianId" label="Belongs to" options={[{ value: "", label: "The student" }, ...p.links.map((l) => ({ value: l.guardianId, label: `${l.guardian.name} (${l.relationship})` }))]} />}
                <div>
                  <label htmlFor="doc-file" className="mb-1 block text-sm font-medium">File<span className="text-danger" aria-hidden="true"> *</span></label>
                  <input id="doc-file" name="file" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:text-brand-text" />
                  <p className="mt-1 text-sm text-ink-2">Photo or PDF, up to 10 MB.</p>
                </div>
                <FormText name="note" label="Note" />
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

export async function HistoryTab({ studentId, can, tz }: Base & { studentId: string }) {
  const current = (await getCurrent())!;
  const items = await withSchool(current.ctx, (tx) => studentTimeline(tx, studentId, { behaviour: can.seeBehaviour, documents: can.seeDocuments }));
  return (
    <Card>
      <CardHeader title="Timeline" description="Everything that happened to the student, newest first." />
      <CardBody>
        {items.length === 0 ? <p className="text-ink-2">Nothing yet.</p> : (
          <ol className="relative space-y-4 border-l border-line pl-5">
            {items.map((i, n) => (
              <li key={n} className="relative">
                <span aria-hidden="true" className="absolute -left-[1.6rem] top-1.5 size-3 rounded-full border-2 border-surface bg-brand" />
                <p className="font-medium">{i.title}</p>
                <p className="text-sm text-ink-2">{formatDateTime(i.at, tz)}{i.detail ? ` · ${i.detail}` : ""}</p>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
