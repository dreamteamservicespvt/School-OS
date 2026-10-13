import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Circle, Lock } from "lucide-react";
import { requireConsole } from "@/lib/console/current";
import { listLog, logChoices, readLogFilters, LOG_PAGE } from "@/lib/console/activity-log";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/console/activity";
import { CONSOLE_TZ } from "@/lib/console/list";
import { formatDate, formatTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { PageHead } from "@/components/ui/display";
import { Empty, TONE_SOFT, type Tone } from "@/components/ui/blocks";
import { buttonClass } from "@/components/ui/button";
import { ExportMenu } from "@/components/ui/kit-client";
import { ListToolbar } from "@/components/list/list-toolbar";
import { cx } from "@/components/ui/cx";
import { LOG_LOOK } from "@/components/console/activity-line";

export const metadata: Metadata = { title: "Activity Log" };

type SP = Record<string, string | string[] | undefined>;

const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: CONSOLE_TZ });
const dayWords = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: CONSOLE_TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(",", "");

export default async function ActivityPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireConsole();
  const sp = await searchParams;
  const f = readLogFilters(sp);
  const [data, choices] = await Promise.all([listLog(f), logChoices()]);
  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));

  const groups: { key: string; at: Date; items: typeof data.rows }[] = [];
  for (const l of data.rows) {
    const k = dayKey(l.at);
    const g = groups[groups.length - 1];
    if (g && g.key === k) g.items.push(l);
    else groups.push({ key: k, at: l.at, items: [l] });
  }
  const label = (g: (typeof groups)[number]) => (g.key === today ? `Today · ${dayWords(g.at)}` : g.key === yesterday ? `Yesterday · ${dayWords(g.at)}` : dayWords(g.at));

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "show") qs.set(k, v);
  const exportHref = `/console/activity/export${qs.toString() ? `?${qs}` : ""}`;
  const more = new URLSearchParams(qs);
  more.set("show", String(f.limit + LOG_PAGE));
  const filtered = Boolean(f.q || f.who || f.school || f.type || f.range);

  return (
    <div>
      <PageHead title="Activity Log" sub="Every action anyone in the console took. Nobody can edit or delete a line."
        actions={data.matching > 0 ? <ExportMenu href={exportHref} /> : null} />
      <ListToolbar placeholder="Search what happened" showArchived={false}
        period={{ timeZone: CONSOLE_TZ, allLabel: "Any date" }}
        filters={[
          { key: "who", label: "Who", options: choices.who, allLabel: "Everyone" },
          { key: "school", label: "School", options: choices.schools, allLabel: "All schools" },
          { key: "type", label: "Type", options: choices.types, allLabel: "Every type of action" },
        ]} />
      <Card className="overflow-hidden">
        {data.rows.length === 0 ? (
          <Empty title={filtered ? "No lines match" : "Nothing yet"} body={filtered ? "Try a different person, school, type or date." : "Every console action will be listed here."}
            action={filtered ? <Link href="/console/activity" className={buttonClass("secondary")}>Clear filters</Link> : undefined} />
        ) : groups.map((g) => (
          <div key={g.key}>
            <p className="eyebrow text-ink3 px-5 pt-4 pb-2">{label(g)}</p>
            <ul>
              {g.items.map((l) => {
                const [Ic, tone] = LOG_LOOK[l.type] ?? [Circle, "neutral" as Tone];
                return (
                  <li key={l.id} className="flex gap-3 px-4 sm:px-5 py-3 border-t border-line/70">
                    <span className={cx("w-9 h-9 rounded-xl grid place-items-center shrink-0", TONE_SOFT[tone])}><Ic size={17} aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] leading-snug break-words"><span className="font-semibold tnum">{formatDate(l.at)}, {formatTime(l.at)}.</span> {l.actorName}{l.actorRole ? ` (${l.actorRole})` : ":"} {l.text}</p>
                      {(l.fromValue || l.toValue) && (
                        <p className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[12.5px]">
                          <span className="px-2 h-6 rounded-md bg-sunken text-ink2 inline-flex items-center">{l.fromValue ?? "None"}</span>
                          <ArrowRight size={13} className="text-ink3" aria-label="changed to" />
                          <span className="px-2 h-6 rounded-md bg-brand/10 text-brand font-semibold inline-flex items-center">{l.toValue ?? "None"}</span>
                        </p>
                      )}
                      <p className="text-[12.5px] text-ink3 mt-1 flex items-center gap-1.5 flex-wrap">
                        <span>{ACTIVITY_TYPES[l.type as ActivityType] ?? l.type}</span>
                        {l.forSchoolId && l.schoolName && <><span aria-hidden="true">·</span><Link href={`/console/schools/${l.forSchoolId}`} className="font-semibold text-brand hover:underline">{l.schoolName}</Link></>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {data.matching > data.rows.length && (
          <div className="px-4 py-3 border-t border-line flex justify-center">
            <Link href={`/console/activity?${more}`} scroll={false} className={buttonClass("secondary", "sm")}>Show older lines</Link>
          </div>
        )}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-1 px-4 py-3 border-t border-line text-[13px] text-ink3">
          <span className="tnum">Showing {data.rows.length} of {data.matching === data.total ? data.total : `${data.matching} matching (${data.total} in all)`} lines</span>
          <span className="flex items-center gap-1.5"><Lock size={13} aria-hidden="true" />Read-only. Lines cannot be edited or deleted.</span>
        </div>
      </Card>
    </div>
  );
}
