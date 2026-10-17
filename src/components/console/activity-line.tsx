// One line of the console's Activity Log, the same on the Dashboard, a
// school's page and the Activity Log page.
import { Activity, Building2, Circle, Download, Flag, KeyRound, LifeBuoy, LogIn, Pencil, ReceiptIndianRupee, Send, StickyNote, UsersRound, type LucideIcon } from "lucide-react";
import { TONE_SOFT, type Tone } from "@/components/ui/blocks";
import { cx } from "@/components/ui/cx";
import { formatDate, formatTime } from "@/lib/format";

export const LOG_LOOK: Record<string, [LucideIcon, Tone]> = {
  school: [Building2, "brand"],
  invite: [Send, "info"],
  login: [KeyRound, "neutral"],
  status: [Flag, "warn"],
  billing: [ReceiptIndianRupee, "ok"],
  note: [StickyNote, "neutral"],
  team: [UsersRound, "neutral"],
  details: [Pencil, "neutral"],
  signin: [LogIn, "neutral"],
  support: [LifeBuoy, "info"],
  export: [Download, "neutral"],
  system: [Activity, "bad"],
};

export type LogLine = { id: string; at: Date; actorName: string; actorRole: string | null; type: string; text: string; fromValue?: string | null; toValue?: string | null };

const istDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export function whenWords(at: Date, now = new Date()) {
  const day = istDate(at);
  if (day === istDate(now)) return `Today, ${formatTime(at)}`;
  if (day === istDate(new Date(now.getTime() - 86_400_000))) return `Yesterday, ${formatTime(at)}`;
  return `${formatDate(at)}, ${formatTime(at)}`;
}

export function ActivityLine({ l, showDay = true, showChange = false }: { l: LogLine; showDay?: boolean; showChange?: boolean }) {
  const [Ic, tone] = LOG_LOOK[l.type] ?? [Circle, "neutral" as Tone];
  return (
    <li className="flex gap-3 px-3 py-2.5">
      <span className={cx("w-8 h-8 rounded-lg grid place-items-center shrink-0", TONE_SOFT[tone])}><Ic size={15} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-snug break-words"><b className="font-semibold">{l.actorName}</b>{l.actorRole ? ` (${l.actorRole})` : ":"} {l.text}</p>
        {showChange && (l.fromValue || l.toValue) && (
          <p className="text-[12.5px] mt-1 flex flex-wrap items-center gap-1.5">
            <span className="px-1.5 rounded bg-sunken text-ink2 line-through decoration-ink3/60">{l.fromValue ?? "none"}</span>
            <span className="text-ink3" aria-label="changed to">→</span>
            <span className="px-1.5 rounded bg-brand/10 text-brand font-semibold">{l.toValue ?? "none"}</span>
          </p>
        )}
        <p className="text-[12px] text-ink3 mt-0.5 tnum">{showDay ? whenWords(l.at) : formatTime(l.at)}</p>
      </div>
    </li>
  );
}
