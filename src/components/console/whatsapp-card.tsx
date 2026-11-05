// Console, one school's WhatsApp (console school page): which number it sends
// from, whether it works, and how much it was used. Counts from the school's
// console card (measureSchool, whatsapp-usage.ts); nothing here is made up.
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { DL } from "@/components/ui/blocks";
import { formatDateTime } from "@/lib/format";
import { withConsole } from "@/lib/db";
import { readWhatsappSummary, whatsappHealth, WHATSAPP_MODE_LABEL } from "@/lib/console/whatsapp-usage";

const n = (x: number) => x.toLocaleString("en-IN");

export function WhatsappCard({ raw, measuredAt, connectHref }: { raw: unknown; measuredAt: Date | null; connectHref: string | null }) {
  const s = readWhatsappSummary(raw);
  const h = whatsappHealth(s);
  return (
    <Card>
      <CardHeader title="WhatsApp" description="Which number the school sends from, and how much it was used. Counts only." icon={MessageCircle}
        action={<span className="flex items-center gap-2"><Pill tone={h.tone} dot>{h.label}</Pill>{connectHref && <Link href={connectHref} className={buttonClass("soft", "sm")}>Change</Link>}</span>} />
      {!s ? (
        <p className="px-5 pb-5 text-[14px] text-ink2">Not counted yet. The numbers appear at the next count, within the hour.</p>
      ) : (
        <>
          <DL rows={[
            ["Number", <>{WHATSAPP_MODE_LABEL[s.mode]}{s.number ? <span className="text-ink2"> · {s.number}</span> : null}</>],
            ["Status", h.key === "test" ? "Test mode: messages are recorded, nothing is sent" : h.key === "not-set-up" ? (s.mode === "dream-team" ? "DREAM TEAM's number is not set up on the server" : "The school's number is missing its ID or access token") : h.label],
            ["Sent today", <span key="t" className="tnum">{n(s.sentToday)}</span>],
            ["Sent this month", <span key="m" className="tnum">{n(s.sentMonth)}</span>],
            ["Failed today", <span key="ft" className={s.failedToday ? "tnum text-bad font-semibold" : "tnum"}>{n(s.failedToday)}</span>],
            ["Failed this month", <span key="fm" className={s.failedMonth ? "tnum text-bad" : "tnum"}>{n(s.failedMonth)}</span>],
            ["Credits used this month", <span key="c" className="tnum">{n(s.creditsUsedMonth)}</span>],
            ["Credits left", <span key="l" className="tnum">{n(s.creditsLeft)}</span>],
            ["Last sent", s.lastSentAt ? formatDateTime(new Date(s.lastSentAt)) : "Nothing sent yet"],
            ["Last error", s.lastError ? <>{s.lastError}{s.lastErrorAt ? <span className="text-ink3"> ({formatDateTime(new Date(s.lastErrorAt))})</span> : null}</> : "None"],
          ]} />
          {measuredAt && <p className="px-5 pb-4 -mt-2 text-[12px] text-ink3">Counted {formatDateTime(measuredAt)}. Today and this month are in Indian time.</p>}
        </>
      )}
    </Card>
  );
}

const ORDER: Record<string, number> = { failing: 0, "not-set-up": 1, working: 2, test: 3, off: 4, unknown: 5 };

/**
 * Console Dashboard, "WhatsApp by school": each open school's number, status
 * and use, failing ones first. Read from the console cards only.
 */
export async function WhatsappSchoolsCard({ limit = 8 }: { limit?: number }) {
  const cards = await withConsole((tx) => tx.consoleSchool.findMany({ where: { status: { not: "CLOSED" } }, select: { id: true, name: true, whatsapp: true } }));
  const rows = cards
    .map((c) => ({ ...c, s: readWhatsappSummary(c.whatsapp) }))
    .map((c) => ({ ...c, h: whatsappHealth(c.s) }))
    .sort((a, b) => ORDER[a.h.key] - ORDER[b.h.key] || (b.s?.sentMonth ?? 0) - (a.s?.sentMonth ?? 0) || a.name.localeCompare(b.name));
  const shown = rows.slice(0, limit);
  const total = rows.reduce((t, r) => ({ today: t.today + (r.s?.sentToday ?? 0), month: t.month + (r.s?.sentMonth ?? 0), failed: t.failed + (r.s?.failedMonth ?? 0), credits: t.credits + (r.s?.creditsUsedMonth ?? 0) }), { today: 0, month: 0, failed: 0, credits: 0 });
  const shared = rows.filter((r) => r.s?.mode === "dream-team").length;
  const own = rows.filter((r) => r.s?.mode === "own").length;
  return (
    <Card>
      <CardHeader title="WhatsApp by school" description={`${n(shared)} on DREAM TEAM's number · ${n(own)} on their own · this month ${n(total.month)} sent, ${n(total.failed)} failed, ${n(total.credits)} credits used`} icon={MessageCircle} />
      {shown.length === 0 ? <p className="px-5 pb-5 text-[13px] text-ink3">No schools yet.</p> : (
        <ul className="px-2 pb-2">
          {shown.map((r) => (
            <li key={r.id}>
              <Link href={`/console/schools/${r.id}`} className="flex items-start gap-3 px-3 py-2 rounded-xl hover:bg-sunken">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold leading-tight truncate">{r.name}</p>
                  <p className="text-[12px] text-ink3 truncate">{r.s ? `${WHATSAPP_MODE_LABEL[r.s.mode]}${r.s.number ? ` · ${r.s.number}` : ""}` : "Not counted yet"}</p>
                  {r.s && <p className="text-[12px] text-ink2 tnum">{n(r.s.sentToday)} today · {n(r.s.sentMonth)} this month · {n(r.s.failedMonth)} failed · {n(r.s.creditsUsedMonth)} credits</p>}
                  {r.h.key === "failing" && r.s?.lastError && <p className="text-[12px] text-bad line-clamp-2">{r.s.lastError}</p>}
                </div>
                <Pill tone={r.h.tone} dot className="shrink-0">{r.h.label}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length > shown.length && <p className="px-5 pb-4 -mt-1 text-[12px] text-ink3">{n(rows.length - shown.length)} more schools. Open a school to see its WhatsApp.</p>}
    </Card>
  );
}
