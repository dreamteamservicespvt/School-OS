import { notFound } from "next/navigation";
import { CircleCheck, Eye, Hourglass, ListChecks, NotebookText, Send, Upload, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { givenToWords, homeworkDetail, seenFor, messagedHomework, sectionStudents } from "@/lib/homework/homework";
import { previewResend } from "@/lib/homework/notify-parents";
import { mayWork } from "@/lib/homework/scope";
import { dayDate, HW_TONE, momentWords } from "@/lib/homework/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Col, DL, Split, Stack, Stats } from "@/components/money/kit";
import { UrlSearch } from "@/components/money/url-filters";
import { BackLink, FileRow, SubIcon } from "../../_components/bits";
import { BASE, homeworkGuard, one, qs, UUID, type SearchParams } from "../../_lib/page";
import { ArchiveSheet, CardMenu, EditSheet, ResendSheet } from "../../sheets";


export const metadata = { title: "Homework details" };

/** One homework (mod-homework.jsx HomeworkDetail): instructions, counts and who has seen it, with "Resend to N". */
export default async function HomeworkDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const p = await homeworkGuard("homework");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const s = p.scope;
  const q = one(sp.q).trim().toLowerCase();
  const doing = one(sp.do);
  const href = `${BASE}/homework/${id}`;
  const here = (extra: Record<string, string | null> = {}) => qs(href, { q: q || null, ...extra });

  const data = await withSchool(p.current.ctx, async (tx) => {
    const d = await homeworkDetail(tx, s, id, p.today);
    if (!d) return null;
    const [roster, seen, messaged] = await Promise.all([sectionStudents(tx, d.hw.academicYearId, d.hw.sectionId), seenFor(tx, [id]), messagedHomework(tx, [id])]);
    const given = new Set(d.subs.filter((x) => x.status !== "EXCUSED").map((x) => x.studentId));
    const students = roster.filter((r) => given.has(r.id));
    const links = await tx.studentGuardian.findMany({ where: { studentId: { in: students.map((x) => x.id) }, archivedAt: null }, orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }], select: { studentId: true, guardianId: true } });
    const guardians = await tx.guardian.findMany({ where: { id: { in: [...new Set(links.map((l) => l.guardianId))] } }, select: { id: true, name: true } });
    const gName = new Map(guardians.map((g) => [g.id, g.name]));
    const parentOf = new Map<string, string>();
    for (const l of links) if (!parentOf.has(l.studentId)) parentOf.set(l.studentId, gName.get(l.guardianId) ?? "");
    const editable = p.edits("homework") && mayWork(s, d.hw);
    const resend = doing === "resend" && editable ? await previewResend(tx, s, id).catch((e: Error) => ({ students: 0, parents: 0, channel: "WhatsApp", problem: e.message, credits: 0 })) : null;
    return { ...d, students, seen: seen.get(id) ?? new Map(), messaged: messaged.has(id), parentOf, editable, resend };
  });
  if (!data) notFound();

  const h = data.hw;
  const c = data.counts;
  const rows = data.students.map((st) => ({ st, parent: data.parentOf.get(st.id) ?? "", seen: data.seen.get(st.id) as { at: Date; via: string } | undefined }))
    .filter((r) => !q || r.st.name.toLowerCase().includes(q) || r.parent.toLowerCase().includes(q))
    .sort((a, b) => Number(!!a.seen) - Number(!!b.seen) || (a.st.rollNo ?? 999) - (b.st.rollNo ?? 999));
  const unseen = data.students.filter((st) => !data.seen.has(st.id)).length;
  const seenN = data.students.length - unseen;
  const subsOpen = p.may("submissions");
  const checkLabel = p.edits("submissions") ? "Check work" : "Who handed in";
  const current = data.status === "Current";
  const notYet = c.notIn;

  return (
    <div>
      <BackLink href={BASE} label="Homework" sub={`${data.subject} · ${data.sectionLabel}`} />
      <Stack>
        <Card className="p-4 md:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
          <SubIcon subject={data.subject} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-[22px] md:text-[26px] font-semibold tracking-tight leading-tight">{h.title}</h1>
              <Pill tone={h.archivedAt ? "neutral" : HW_TONE[data.status]} dot>{h.archivedAt ? "Archived" : data.status}</Pill>
            </div>
            <p className="text-[13.5px] text-ink3 mt-0.5">{data.subject} · Class {data.sectionLabel}{data.teacher && ` · ${data.teacher}`} · given {dayDate(h.startDate)} · due {dayDate(h.dueDate)} · out of {h.maxMarks}</p>
          </div>
          <div className="flex gap-2">
            {subsOpen && <ButtonLink href={`${BASE}/submissions?hw=${h.id}`} variant={p.edits("submissions") ? "primary" : "secondary"} icon={ListChecks}>{checkLabel}</ButtonLink>}
            {data.editable && !h.archivedAt && (
              <CardMenu size="md" edit={here({ do: "edit" })} copy={qs(BASE, { do: "give" })} archive={here({ do: "archive" })} />
            )}
          </div>
        </Card>
        <Stats items={[
          { label: "Assigned", value: String(c.assigned), sub: givenToWords(h.givenTo, c.assigned, data.sectionLabel).split(" · ")[0], icon: Users },
          { label: "Submitted", value: String(c.submitted), sub: c.late ? `${c.late} late` : "On time", tone: "info", icon: Upload },
          { label: "Checked", value: String(c.graded), tone: "ok", icon: CircleCheck },
          { label: current ? "Not yet" : "Missing", value: String(notYet), tone: !current && notYet ? "bad" : undefined, icon: Hourglass },
        ]} />
        <Split side={380}>
          <Col>
            <Card>
              <CardHeader title="Instructions" icon={NotebookText} />
              <p className="px-5 pb-4 text-[14.5px] text-ink2 leading-relaxed whitespace-pre-line">{h.instructions || (h.attachments.length ? "See the attached photo." : "No instructions were typed.")}</p>
              {h.attachments.length > 0 && <ul className="px-3 pb-3">{h.attachments.map((a) => <FileRow key={a.id} name={a.name} kind={a.kind} meta={a.kind === "link" ? "Link" : a.kind === "photo" ? "Photo" : "File"} href={a.kind === "link" ? a.url : a.fileId ? fileLink(a.fileId, p.current.ctx.schoolId) : null} />)}</ul>}
              <DL rows={[
                ["Given to", givenToWords(h.givenTo, c.assigned, data.sectionLabel)],
                ["Online submission", h.onlineSubmission && p.settings.onlineSubmission ? "On · photos or PDF" : "Off · handed in class"],
                ["Start date", dayDate(h.startDate)],
                ["Due date", `${dayDate(h.dueDate)}, 11:59 PM`],
              ]} />
            </Card>
          </Col>
          <Col>
            <Card className="overflow-hidden">
              <CardHeader title="Seen by parent" icon={Eye}
                description={data.messaged ? `${seenN} of ${data.students.length} · from WhatsApp read receipts and Parent Link` : "No homework message has gone to parents yet"}
                action={data.editable && data.messaged && unseen > 0 && !h.archivedAt ? <ButtonLink href={here({ do: "resend" })} scroll={false} size="sm" variant="soft" icon={Send}>Resend to {unseen}</ButtonLink> : undefined} />
              <div className="px-3 pb-2"><UrlSearch id="seen-search" placeholder="Student name" label="Search students" /></div>
              <ul className="px-2 pb-2 max-h-[420px] overflow-y-auto scroll-thin">
                {rows.map((r) => (
                  <li key={r.st.id} className="flex items-center gap-3 px-3 py-2 rounded-xl">
                    <Avatar name={r.st.name} size={32} />
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{r.st.name}</p><p className="text-[12px] text-ink3 truncate">{r.parent || "No parent on record"}</p></div>
                    {r.seen ? <span className="text-right text-[12px] text-ink3 tnum">{momentWords(r.seen.at, p.tz)}<span className="block">{r.seen.via}</span></span>
                      : <Pill tone={data.messaged ? "warn" : "neutral"}>Not seen</Pill>}
                  </li>
                ))}
                {rows.length === 0 && <li className="px-3 py-6 text-center text-[13.5px] text-ink3">No student matches.</li>}
              </ul>
            </Card>
          </Col>
        </Split>
      </Stack>
      {doing === "edit" && data.editable && !h.archivedAt && (
        <EditSheet closeHref={here({ do: null })} onlineOn={p.settings.onlineSubmission}
          hw={{ id: h.id, title: h.title, instructions: h.instructions ?? "", startDate: h.startDate.toISOString().slice(0, 10), dueDate: h.dueDate.toISOString().slice(0, 10), maxMarks: h.maxMarks, onlineSubmission: h.onlineSubmission, label: data.sectionLabel }}
          files={h.attachments.map((a) => ({ id: a.id, name: a.name }))} />
      )}
      {doing === "archive" && data.editable && !h.archivedAt && <ArchiveSheet closeHref={here({ do: null })} id={h.id} title={h.title} />}
      {data.resend && (
        <ResendSheet closeHref={here({ do: null })} id={h.id} title={h.title} parents={data.resend.parents} credits={data.resend.credits}
          channel={data.resend.channel === "whatsapp" ? "WhatsApp" : data.resend.channel === "sms" ? "SMS" : data.resend.channel === "app" ? "the parents’ app" : data.resend.channel} problem={data.resend.problem ?? null} />
      )}
    </div>
  );
}
