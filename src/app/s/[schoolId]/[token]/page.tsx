// A survey answer page (no login): one person's own link from a message. Checked on the server
// inside the school's walls; each person answers once.
import type { Metadata } from "next";
import { CircleCheck, ClipboardList, LinkIcon, Lock } from "lucide-react";
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { findInvite, isOpen, questionsWhere } from "@/lib/communication/surveys";
import { formatDate } from "@/lib/format";
import { PhoneCard, PhoneNotice, PhoneShell } from "@/components/parent-link/phone-shell";
import { AnswerForm } from "./answer-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Survey", robots: { index: false, follow: false }, referrer: "no-referrer" };

const uuid = /^[0-9a-f-]{36}$/;

export default async function SurveyAnswerPage({ params }: { params: Promise<{ schoolId: string; token: string }> }) {
  const { schoolId, token } = await params;
  const device = await deviceInfo();
  const limited = await hitLimit(`survey-open:ip:${device.ipAddress ?? "unknown"}`, 60, 600);
  if (!limited.ok) return <PhoneShell kind="Survey"><PhoneNotice title="Please wait a moment">{limitMessage(limited)}</PhoneNotice></PhoneShell>;

  const found = uuid.test(schoolId) ? await withSchool({ schoolId, userId: null }, async (tx) => {
    const ctx = { schoolId, userId: null };
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { name: true, phone: true, timeZone: true } });
    if (!school) return null;
    const invite = await findInvite(tx, ctx, token);
    if (!invite) return { school, invite: null } as const;
    const survey = await tx.survey.findFirst({ where: { id: invite.surveyId, schoolId, archivedAt: null } });
    const questions = survey ? await tx.surveyQuestion.findMany({ where: questionsWhere(ctx, survey.id), orderBy: { sortOrder: "asc" } }) : [];
    const name = invite.personType === "guardian"
      ? (await tx.guardian.findFirst({ where: { id: invite.personId, schoolId }, select: { name: true } }))?.name
      : (await tx.staff.findFirst({ where: { id: invite.personId, schoolId }, select: { fullName: true } }))?.fullName;
    return { school, invite, survey, questions, name: name ?? null } as const;
  }) : null;

  if (!found || !found.invite || !found.survey) {
    await hitLimit(`survey-open:ip:${device.ipAddress ?? "unknown"}`, 60, 600);
    return (
      <PhoneShell schoolName={found?.school.name} kind="Survey" schoolPhone={found?.school.phone}>
        <PhoneNotice title="This link does not work" icon={<LinkIcon size={26} />}>Please check you opened the whole link from the school&rsquo;s message.</PhoneNotice>
      </PhoneShell>
    );
  }
  const { school, invite, survey, questions } = found;
  const tz = school.timeZone;
  const shell = (body: React.ReactNode) => (
    <PhoneShell schoolName={school.name} kind="Survey" hello="Namaste," name={found.name ?? "Thank you for your time"} schoolPhone={school.phone}>{body}</PhoneShell>
  );
  if (invite.answeredAt) {
    return shell(<PhoneNotice title="You have already answered" icon={<CircleCheck size={26} className="text-ok" />}>Thank you. Each person answers once.</PhoneNotice>);
  }
  if (!isOpen(survey, tz)) {
    return shell(<PhoneNotice title="This survey is closed" icon={<Lock size={24} />}>{survey.closesOn ? `It closed on ${formatDate(survey.closesOn, "UTC")}.` : "No more answers are taken."}</PhoneNotice>);
  }
  return shell(
    <>
      <PhoneCard className="flex items-start gap-3.5">
        <span className="w-12 h-12 rounded-2xl bg-brand/10 text-brand grid place-items-center shrink-0"><ClipboardList size={22} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="font-semibold text-[17px] leading-snug">{survey.title}</h2>
          <p className="text-[13px] text-ink3 mt-0.5">{questions.length} {questions.length === 1 ? "question" : "questions"}{survey.closesOn ? ` · closes ${formatDate(survey.closesOn, "UTC")}` : ""}</p>
          <p className="text-[13px] text-ink2 mt-2">{survey.anonymous ? "Your answers are anonymous: your name is not kept with them." : "The school sees your name with your answers."}</p>
        </div>
      </PhoneCard>
      <AnswerForm schoolId={survey.schoolId} token={token} questions={questions.map((q) => ({ id: q.id, kind: q.kind, text: q.text, options: q.options, required: q.required }))} />
    </>,
  );
}
