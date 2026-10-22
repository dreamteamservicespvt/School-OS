import { ArrowRight, Award, Clock, LayoutGrid, MessageCircle, ShieldCheck, Sparkles, ToggleRight, Upload } from "lucide-react";
import { withSchool } from "@/lib/db";
import { reachFor } from "@/lib/permissions";
import { ruleStates } from "@/lib/messaging/automatic";
import { OPTIONAL_PAGES } from "@/lib/homework/access";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Banner } from "@/components/money/kit";
import { HomeworkHead } from "../_components/homework-head";
import { homeworkGuard } from "../_lib/page";
import { GradeBands, OptionalSwitch, SettingsRows, type Row } from "./forms";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Homework Settings") };
}

const CHANNEL: Record<string, string> = { app: "App", whatsapp: "WhatsApp", sms: "SMS", email: "Email" };
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const grace = (min: number) => (min === 0 ? "None" : min % 60 === 0 ? `${min / 60} hour${min === 60 ? "" : "s"}` : `${min} minutes`);

/** Homework Settings (17 §6): one card per group, each saved on its own. The Principal reads them. */
export default async function HomeworkSettingsPage() {
  const p = await homeworkGuard("settings");
  const edit = p.edits("settings");
  const st = p.settings;
  const rules = (await withSchool(p.current.ctx, (tx) => ruleStates(tx, p.current.ctx))).filter((r) => r.module === "Homework & Learning");
  const canMsg = reachFor(p.current.permissions, "communication", "edit") === "all";

  const submission: Row[] = [
    { kind: "switch", name: "onlineSubmission", title: "Online submission", sub: "Students with a login hand in photos or files", value: st.onlineSubmission },
    { kind: "number", name: "maxFileMb", title: "Allowed files", sub: "Photos, PDF and Word, up to this size each", value: st.maxFileMb, suffix: "MB", min: 1, max: 10 },
    { kind: "select", name: "resubmit", title: "Hand in again", sub: "Whether a student may hand in again after handing in", value: st.resubmit, options: [{ value: "per-student", label: "Per student" }, { value: "always", label: "Always" }] },
    { kind: "switch", name: "discussionOn", title: "Discussion on each homework", sub: "Comments between the teacher and the student", value: st.discussionOn },
  ];
  const late: Row[] = [
    { kind: "number", name: "graceMinutes", title: "Grace time", sub: `Counts as late after the due date, 11:59 PM, plus this time`, value: st.graceMinutes, suffix: "minutes", min: 0, max: 1440 },
    { kind: "switch", name: "missingOn", title: "Missing after the due date", sub: "Students who did not hand in show as Missing", value: st.missingOn },
  ];
  const grading: Row[] = [
    { kind: "select", name: "gradingShow", title: "Show", value: st.gradingShow, options: [{ value: "both", label: "Score and grade" }, { value: "score", label: "Score only" }, { value: "grade", label: "Grade only" }] },
    { kind: "number", name: "defaultMaxMarks", title: "Default maximum marks", value: st.defaultMaxMarks, min: 1, max: 100 },
    { kind: "switch", name: "feedbackVisible", title: "Students see the feedback", value: st.feedbackVisible },
  ];
  const access: Row[] = [
    { kind: "select", name: "studentCourses", title: "Students", sub: "Which courses a student sees", value: st.studentCourses, options: [{ value: "section", label: "Their own class and section" }, { value: "class", label: "Every section of their class" }] },
    { kind: "switch", name: "classTeacherReadsCourses", title: "Class teachers", sub: "Read all subjects of their class", value: st.classTeacherReadsCourses },
  ];
  const display: Row[] = [
    { kind: "select", name: "listView", title: "Homework list shows as", value: st.listView, options: [{ value: "cards", label: "Cards" }, { value: "list", label: "List" }] },
    { kind: "switch", name: "cardShowsSeen", title: "Show “Seen by parent” on cards", value: st.cardShowsSeen },
    { kind: "switch", name: "cardShowsFiles", title: "Show attachments count on cards", value: st.cardShowsFiles },
  ];
  const fixed = (
    <ul className="divide-y divide-line/70 border-t border-line/70">
      {[["Subject teachers", "Their own classes and subjects"], ["Academic Head and Principal", "All courses"]].map(([k, v]) => (
        <li key={k} className="flex items-center gap-3 px-5 py-3.5 text-[14px]"><b className="font-semibold flex-1">{k}</b><span className="text-ink2 text-right">{v}</span></li>
      ))}
    </ul>
  );

  return (
    <div className="max-w-4xl">
      <HomeworkHead page="settings" pageName="Homework Settings" sub="Submission rules, late marking, grading and who can see which course" />
      <div className="flex flex-col gap-5 lg:gap-6">
        <Card><CardHeader title="Submission rules" icon={Upload} /><SettingsRows section="Submission rules" rows={submission} editable={edit} /></Card>
        <Card><CardHeader title="Late marking" icon={Clock} description={`Late after the due date, 11:59 PM · Grace time: ${grace(st.graceMinutes)}`} /><SettingsRows section="Late marking" rows={late} editable={edit} /></Card>
        <Card><CardHeader title="Grading" icon={Award} /><SettingsRows section="Grading" rows={grading} editable={edit} extra={<GradeBands bands={st.gradeBands} editable={edit} />} /></Card>
        <Card><CardHeader title="Course access" description="Who can see which course" icon={ShieldCheck} /><SettingsRows section="Course access" rows={access} editable={edit} extra={fixed} /></Card>
        <Card><CardHeader title="Display" icon={LayoutGrid} /><SettingsRows section="Display" rows={display} editable={edit} /></Card>
        <Card>
          <CardHeader title="Homework messages to parents" description="Set in Communication, Message Settings" icon={MessageCircle} action={canMsg ? <ButtonLink href="/communication/settings" size="sm" variant="ghost" iconRight={ArrowRight}><Words k="Change" /></ButtonLink> : undefined} />
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {rules.map((r) => (
              <li key={r.key} className="flex items-center gap-3 px-5 py-3.5 text-[14px]">
                <span className="flex-1">{r.label}<span className="block text-ink3 text-[12.5px]">{r.when}</span></span>
                <span className="text-ink2 font-semibold text-right">{r.isOn ? ["On", r.channels.map((c) => CHANNEL[c] ?? c).join(", "), r.timing.time ? `${clock(r.timing.time)} on the due date` : ""].filter(Boolean).join(" · ") : "Off"}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Optional pages" description="Turn off what your school does not use" icon={ToggleRight} />
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {OPTIONAL_PAGES.map((o) => <OptionalSwitch key={o.feature} feature={o.feature} label={o.label} sub={o.sub} on={p.features.has(o.feature)} editable={edit} />)}
          </ul>
        </Card>
        {p.ai && (
          <Banner tone="brand" icon={Sparkles} title="AI teacher assistant is on.">
            <Words k="Drafts for homework, feedback and remarks are always shown as suggestions for the teacher to edit. Only the School Admin can switch it off, in Settings, Modules On/Off." />
          </Banner>
        )}
      </div>
    </div>
  );
}
