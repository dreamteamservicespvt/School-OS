import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Check, CircleCheck, Flag, KeyRound, ListChecks, MessageCircle, Plus, School } from "lucide-react";
import { requireConsolePage } from "@/lib/console/current";
import { withConsole } from "@/lib/db";
import { maskMobile } from "@/lib/console/activity";
import { CORE_MODULES, ROLE_WORDS } from "@/lib/console/schools";
import { appUrl, supportPhone } from "@/lib/console/outbox";
import { formatDate, formatTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { PageHead } from "@/components/ui/display";
import { Col, Split } from "@/components/ui/blocks";
import { BackLink } from "@/components/console/bits";
import { InvitePreview } from "@/components/console/add-school-form";
import { testMessageNote } from "@/components/console/test-code-note";
import { mayLogCode } from "@/lib/dev-codes";

export const metadata: Metadata = { title: "School added" };

const CH = { whatsapp: "WhatsApp", sms: "SMS", email: "email" } as Record<string, string>;
const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export default async function AddDone({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireConsolePage("add");
  const { id } = await searchParams;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await withConsole(async (tx) => {
    const card = await tx.consoleSchool.findUnique({ where: { id } });
    if (!card) return null;
    const [invite, messages] = await Promise.all([
      tx.schoolInvite.findFirst({ where: { forSchoolId: id, kind: "INVITE" }, orderBy: { sentAt: "asc" } }),
      tx.consoleMessage.findMany({ where: { forSchoolId: id, purpose: "invite" }, orderBy: { createdAt: "asc" } }),
    ]);
    return { card, invite, messages };
  });
  if (!data) notFound();
  const { card: s, invite, messages } = data;
  const time = formatTime(s.createdAt);
  const channels = [...new Set(messages.map((m) => CH[m.channel] ?? m.channel))];
  const failed = messages.filter((m) => m.status === "FAILED");
  const test = messages.length > 0 && messages.every((m) => m.status === "TEST");
  // On a tester's computer a message in test mode went to the server log (dev-codes.ts).
  const inLog = mayLogCode("none");
  const optional = s.modulesOn.length - CORE_MODULES.length;
  const role = ROLE_WORDS[invite?.roleKey ?? "school-admin"] ?? "School Admin";
  const admin = invite?.name ?? s.adminName ?? "The School Admin";
  const steps = [
    <>The school record was made with school code <span className="font-mono text-[12.5px]">{s.code}</span>, and its first campus.</>,
    "Its own data space was made, kept apart from every other school.",
    "The starting roles were made: Principal / Owner, School Admin, Accountant, Teacher and the rest.",
    `${s.modulesOn.length} modules were switched on${optional > 0 ? `, ${optional} of them optional` : ""}, with the ${s.board} defaults ready to apply.`,
    invite ? `${admin}’s login was made with status Invited, as ${role}.` : `${admin} already had a login in the group, so only a School Access entry for this school was added.`,
    invite ? `The invite went out on ${joinAnd(channels) || "the channels chosen"} at ${time}.` : "No invite was needed.",
    `The school appears in Schools as ${s.startedAs === "TRIAL" ? "Trial" : "Active"}, and in the Activity Log.`,
  ];
  return (
    <div>
      <BackLink label="Schools" />
      <PageHead title="School added" sub={`${s.name} · ${s.city} · added ${formatDate(s.createdAt)} at ${time} by ${s.addedByName ?? "DREAM TEAM"}`} />
      <Split side={380}>
        <Col>
          <Card className="p-5 md:p-6 flex flex-col md:flex-row gap-4 md:items-center">
            <span className="w-14 h-14 rounded-2xl bg-ok/10 text-ok grid place-items-center animate-pop shrink-0"><Check size={28} strokeWidth={2.6} aria-hidden="true" /></span>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-[22px] font-semibold tracking-tight leading-tight">{s.name} is ready</h2>
              <p className="text-[14px] text-ink3 mt-1">School code <span className="font-mono text-[12.5px] text-ink2">{s.code}</span> · {s.startedAs === "TRIAL" ? "Trial" : "Active"}{s.trialEndsOn ? ` until ${formatDate(s.trialEndsOn)}` : ""}{invite ? ` · invite sent to ${admin}` : ""}</p>
            </div>
            <Link href={`/console/schools/${s.id}`} className={buttonClass("primary")}><School size={17} aria-hidden="true" />Open school</Link>
          </Card>
          <Card>
            <CardHeader title="What happened by itself" description={`All done at ${time}`} icon={CircleCheck} />
            <ol className="px-5 pb-4 flex flex-col">
              {steps.map((t, i) => (
                <li key={i} className="flex gap-3 py-2.5 border-t border-line/70 first:border-t-0">
                  <span className="w-7 h-7 rounded-full bg-ok/15 text-ok grid place-items-center shrink-0"><Check size={15} strokeWidth={3} aria-hidden="true" /></span>
                  <p className="text-[14px] leading-snug pt-1 min-w-0">{t}</p>
                </li>
              ))}
            </ol>
          </Card>
          <div className="flex gap-2 flex-wrap">
            <Link href="/console/schools/new" className={buttonClass("secondary")}><Plus size={17} aria-hidden="true" />Add another school</Link>
            <Link href="/console/schools" className={buttonClass("ghost")}>Back to Schools</Link>
          </div>
        </Col>
        <Col>
          {invite && (
            <Card>
              <CardHeader title="Invite on WhatsApp" description={failed.length ? `${failed.length} of ${messages.length} could not be sent. Resend from the school’s page.` : test ? testMessageNote(inLog) : `Sent to ${admin} at ${time}`} icon={MessageCircle}
                action={<Pill tone={failed.length || (test && !inLog) ? "bad" : test ? "info" : "ok"} dot>{failed.length ? "Not sent" : test ? (inLog ? "Test mode" : "Not sent") : "Sent"}</Pill>} />
              <InvitePreview school={s.name} admin={admin} role={role} mobile={invite.phone} time={time} sent={!failed.length && !test} help={supportPhone()} host={appUrl().replace(/^https?:\/\//, "")} />
            </Card>
          )}
          <Card>
            <CardHeader title="What happens next" icon={CalendarClock} />
            <ul className="px-5 pb-5 flex flex-col gap-3 text-[13.5px] text-ink2 leading-snug">
              <li className="flex gap-2.5"><KeyRound size={16} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span>{admin} taps the link, confirms the code sent to {maskMobile(invite?.phone ?? s.adminPhone)} and sets their own password. This console then shows “Signed in”.</span></li>
              <li className="flex gap-2.5"><ListChecks size={16} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span>They land on the Setup checklist and create every other login in the school.</span></li>
              <li className="flex gap-2.5"><Flag size={16} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span>If the invite is not opened in 2 days, or setup does not move for 7 days, the school shows in Needs attention.</span></li>
            </ul>
          </Card>
        </Col>
      </Split>
    </div>
  );
}
