import type { Metadata } from "next";
import Link from "next/link";
import { Clock, DoorOpen, EyeOff, Hourglass, LifeBuoy, Lock, School } from "lucide-react";
import { requireConsole } from "@/lib/console/current";
import { supportRequests, type SupportRow } from "@/lib/console/support";
import { ENDED_WORDS, endsWords, lengthWords, SUPPORT_STATUS_WORDS, type EndHow } from "@/lib/console/support-entry";
import { formatDate, formatTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHead } from "@/components/ui/display";
import { Banner, Empty } from "@/components/ui/blocks";
import { Pill, type PillTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ActSheet } from "@/components/console/sheets";
import { endSupportAction, enterSupportAction, withdrawSupportAction } from "./actions";

export const metadata: Metadata = { title: "Support Access" };

type SP = Promise<{ act?: string; entry?: string; school?: string }>;

const TONE: Record<SupportRow["status"], PillTone> = { WAITING: "info", ALLOWED: "ok", DECLINED: "bad", ENDED: "neutral" };
const when = (d: Date) => `${formatDate(d)}, ${formatTime(d)}`;
const ENTRY_WORDS: Record<string, { tone: "info" | "warn"; text: string }> = {
  ended: { tone: "info", text: "You ended your support access. The school’s Audit Log shows when." },
  over: { tone: "info", text: "Your support access has ended: the time given ran out, the school or DREAM TEAM ended it, or you were signed out of the console." },
  expired: { tone: "warn", text: "That link to the school no longer works. Open the school again from here." },
};

/** Support Access (07-super-admin.md §3.4): requests to look inside a school's School Master, and their history. */
export default async function SupportPage({ searchParams }: { searchParams: SP }) {
  const c = await requireConsole();
  const { act, entry, school } = await searchParams;
  const now = new Date();
  const rows = await supportRequests({ schoolId: school && /^[0-9a-f-]{36}$/i.test(school) ? school : null });
  const live = rows.filter((r) => r.live);
  const waiting = rows.filter((r) => r.status === "WAITING");
  const past = rows.filter((r) => !r.live && r.status !== "WAITING");
  const can = c.can("support");
  const close = `/console/support${school ? `?school=${school}` : ""}`;
  const to = (a: string) => `${close}${close.includes("?") ? "&" : "?"}act=${a}`;

  const [kind, arg] = (act ?? "").split(":");
  const target = arg ? rows.find((r) => r.id === arg) : undefined;
  const sheet = !can || !target ? null
    : kind === "end" && target.live ? (
      <ActSheet title={`End support access to ${target.schoolName}?`} sub={`Allowed until ${endsWords(target.endsAt!, now)}`} closeHref={close} action={endSupportAction} submitLabel="End now" danger hidden={{ requestId: target.id }}>
        <p>{target.requestedById === c.user.id ? "You" : target.requestedByName} can no longer look inside {target.schoolName}, at once. This goes in the school’s Audit Log and the Activity Log.</p>
      </ActSheet>
    ) : kind === "withdraw" && target.status === "WAITING" ? (
      <ActSheet title={`Withdraw the request to ${target.schoolName}?`} closeHref={close} action={withdrawSupportAction} submitLabel="Withdraw request" danger hidden={{ requestId: target.id }}>
        <p>The request disappears from the school’s Approvals. You can ask again later.</p>
      </ActSheet>
    ) : null;

  const line = (r: SupportRow) => (
    <li key={r.id} id={`r-${r.id}`} className="flex flex-col gap-2 px-5 py-3.5 border-t border-line/70 scroll-mt-24">
      <div className="flex items-start gap-3 min-w-0">
        <span className="w-10 h-10 rounded-xl bg-sunken grid place-items-center shrink-0"><School size={18} className="text-ink3" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[14.5px] leading-tight flex items-center gap-2 flex-wrap">
            <Link href={`/console/schools/${r.forSchoolId}`} className="hover:underline">{r.schoolName}</Link>
            <Pill tone={TONE[r.status]} className="!h-5 !text-[11px]">{r.live ? "Open now" : r.status === "ALLOWED" ? "Time ended" : SUPPORT_STATUS_WORDS[r.status]}</Pill>
          </p>
          <p className="text-[13.5px] text-ink2 mt-0.5 break-words">“{r.reason}”</p>
          <p className="text-[12.5px] text-ink3 mt-0.5">
            {r.requestedByName} asked {when(r.createdAt)} · {lengthWords(r.lengthMinutes)}
            {r.decidedByName && r.decidedAt ? ` · ${r.status === "DECLINED" ? "declined" : "allowed"} by ${r.decidedByName}, ${formatTime(r.decidedAt)}` : ""}
            {r.live && r.endsAt ? ` · until ${endsWords(r.endsAt, now)}` : ""}
            {r.status === "ENDED" && r.endedHow ? ` · ${ENDED_WORDS[r.endedHow as EndHow] ?? "Ended"}${r.endedAt ? `, ${when(r.endedAt)}` : ""}` : ""}
          </p>
          {r.status === "DECLINED" && r.declineReason && <p className="text-[12.5px] text-ink3">The school’s reason: “{r.declineReason}”</p>}
        </div>
      </div>
      {can && (r.live || r.status === "WAITING") && (
        <div className="flex gap-2 flex-wrap pl-[52px]">
          {r.live && r.requestedById === c.user.id && (
            <form action={enterSupportAction}>
              <input type="hidden" name="requestId" value={r.id} />
              <button type="submit" className={buttonClass("primary", "sm")}><DoorOpen size={15} aria-hidden="true" />Open School Master</button>
            </form>
          )}
          {r.live && <Link href={to(`end:${r.id}`)} scroll={false} className={buttonClass("secondary", "sm")}>End now</Link>}
          {r.status === "WAITING" && <Link href={to(`withdraw:${r.id}`)} scroll={false} className={buttonClass("ghost", "sm")}>Withdraw</Link>}
        </div>
      )}
    </li>
  );

  return (
    <div>
      <PageHead title="Support Access" sub="Requests to look inside a school’s School Master to help, and their history. Nothing opens until the school taps Allow." />
      {entry && ENTRY_WORDS[entry] && <Banner tone={ENTRY_WORDS[entry].tone} className="mb-5">{ENTRY_WORDS[entry].text}</Banner>}
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Open now" description="Allowed by the school, for the time it gave" icon={DoorOpen} />
          {live.length === 0 ? <p className="px-5 pb-4 text-[13.5px] text-ink3">No school has support access open now.</p> : <ul>{live.map(line)}</ul>}
        </Card>
        <Card>
          <CardHeader title="Waiting for the school" description="In the school’s Approvals, for its School Admin and Principal" icon={Hourglass} />
          {waiting.length === 0
            ? <p className="px-5 pb-4 text-[13.5px] text-ink3">Nothing waiting. {can ? <>To ask a school, open its page in <Link href="/console/schools" className="font-semibold text-brand hover:underline">Schools</Link> and tap Request support access.</> : null}</p>
            : <ul>{waiting.map(line)}</ul>}
        </Card>
        <Card>
          <CardHeader title="History" description="Every request, newest first" icon={Clock} />
          {past.length === 0 ? <Empty icon={LifeBuoy} title="No requests yet" body="Requests and how each one ended appear here." /> : <ul>{past.map(line)}</ul>}
        </Card>
        <p className="text-[12.5px] text-ink3 flex gap-1.5"><EyeOff size={13} className="shrink-0 mt-0.5" aria-hidden="true" />Inside a school, support access is for looking only: nothing can be changed, exported, printed or cancelled, and Aadhaar and other ID numbers, salaries and counselling notes stay hidden. Every page opened is written in the school’s own Audit Log, marked “DREAM TEAM support”.</p>
        {!can && <p className="text-[12.5px] text-ink3 flex gap-1.5"><Lock size={13} className="shrink-0 mt-0.5" aria-hidden="true" />Only Support and the Owner can ask a school for support access.</p>}
      </div>
      {sheet}
    </div>
  );
}
