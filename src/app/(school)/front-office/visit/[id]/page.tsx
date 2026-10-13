// The page the visited staff member opens from the notification "A visitor is
// here for you" (16 §2 Visitors: "The staff member can reply Send in, Wait or
// Not available"). Any staff member reaches it, so it checks that the person is
// the one being visited (or the front desk) instead of the module's page guard.
import { notFound } from "next/navigation";
import { Clock, DoorClosed, UserRound } from "lucide-react";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { foCan, foViewer } from "@/lib/front-office/access";
import { clockAt } from "@/lib/front-office/time";
import { REPLIES, replyOf } from "@/lib/front-office/words";
import { visitorStatus } from "@/lib/front-office/visitors";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { BackLink } from "@/components/ui/module-head";
import { ActButton, type ActIcon } from "../../_components/fields";
import { replyAction } from "../../actions";
import { BASE, UUID } from "../../_lib/page";

export const metadata = { title: "Visitor for you" };

const ICON: Record<string, ActIcon> = { "send-in": "door", wait: "clock", "not-available": "cancel" };
const VARIANT = { "send-in": "primary", wait: "secondary", "not-available": "secondary" } as const;

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const current = await requireCurrent();
  const can = foCan(foViewer(current));
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => {
    const v = await tx.visitorEntry.findFirst({ where: { id, archivedAt: null } });
    if (!v) return null;
    const staff = v.meetStaffId ? await tx.staff.findFirst({ where: { id: v.meetStaffId }, select: { fullName: true, userLoginId: true } }) : null;
    return { v, staff, isMe: Boolean(staff?.userLoginId && staff.userLoginId === current.user.id) };
  });
  if (!data) notFound();
  const { v, staff, isMe } = data;
  // Only the person being visited, and the front desk, may see the visit.
  if (!isMe && !can.desk && foViewer(current).level !== "view") notFound();

  const status = visitorStatus(v);
  const reply = replyOf(v.staffReply);
  const open = status !== "Out";
  return (
    <div className="max-w-[640px]">
      {can.desk || !isMe ? <BackLink href={`${BASE}/visitors`} label="Visitors" /> : <BackLink href="/dashboard" label="Dashboard" />}
      <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-ink">{isMe ? "A visitor is here for you" : `Visitor for ${staff?.fullName ?? "staff"}`}</h1>
      <p className="text-[14.5px] text-ink2 mt-1 mb-5">{isMe ? "Tell the front desk what to do. They see your answer straight away." : "The person being visited answers from this page."}</p>
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <Avatar name={v.name} size={56} src={v.photoFileId ? fileLink(v.photoFileId, current.ctx.schoolId) : null} />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold text-ink">{v.name}{v.peopleCount > 1 && <span className="text-ink3 font-normal"> +{v.peopleCount - 1}</span>}</p>
            <p className="text-[14px] text-ink2 mt-0.5">{v.purpose}{v.note ? ` · ${v.note}` : ""}</p>
            <p className="text-[13px] text-ink3 mt-1 tnum">Pass <span className="font-mono">{v.passNo}</span> · came in at {clockAt(v.timeIn, tz)}{v.timeOut ? ` · left at ${clockAt(v.timeOut, tz)}` : ""}</p>
          </div>
          <Pill tone={status === "In" ? "ok" : status === "Expired" ? "bad" : "neutral"}>{status === "In" ? "Inside" : status === "Expired" ? "Pass expired" : "Left"}</Pill>
        </div>
        {reply && (
          <p className="mt-4 flex items-center gap-2 text-[14px] text-ink2" role="status">
            <UserRound size={16} aria-hidden="true" />
            Answer sent: <Pill tone={reply.tone}>{reply.label}</Pill>{v.staffReplyAt && <span className="text-ink3 tnum">at {clockAt(v.staffReplyAt, tz)}</span>}
          </p>
        )}
        {isMe && open && (
          <div className="mt-5 pt-5 border-t border-line">
            <p className="text-[13.5px] font-semibold text-ink mb-3">{reply ? "Change your answer" : "Your answer"}</p>
            <div className="flex flex-wrap gap-2">
              {REPLIES.map((r) => (
                <ActButton key={r.key} action={replyAction} fields={{ visitorId: v.id, reply: r.key }} label={r.label} icon={ICON[r.key]} size="md" variant={VARIANT[r.key]} pendingText="Sending…" />
              ))}
            </div>
          </div>
        )}
        {!open && (
          <p className="mt-4 flex items-center gap-2 text-[14px] text-ink2"><DoorClosed size={16} aria-hidden="true" />{v.name} has left, so no answer is needed.</p>
        )}
        {!isMe && open && !reply && (
          <p className="mt-4 flex items-center gap-2 text-[14px] text-ink2"><Clock size={16} aria-hidden="true" />Waiting for {staff?.fullName ?? "the staff member"} to answer.</p>
        )}
      </Card>
      {can.desk && <div className="mt-4"><ButtonLink href={`${BASE}/visitors?q=${encodeURIComponent(v.passNo)}`} variant="secondary">Open in the visitor log</ButtonLink></div>}
    </div>
  );
}
