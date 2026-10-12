// Parent Link, attendance this month (05 §4 Sends; 11 Communication owns the
// page). Read-only: the chosen child's month as a calendar with the same
// colours and % as the register. Today's mark is shown as not final until
// the lock time. Imported by src/lib/parent-link/section-list.ts.
import "server-only";

import { registerSection, type GuardianView } from "../parent-link/sections";
import { schoolDateOf } from "./time";
import { lockState } from "./marks";
import { ensureAttendanceDefaults } from "./settings";
import { parentLinkAttendance } from "./integrations";
import { percentText } from "./summary";

type Data = Awaited<ReturnType<typeof parentLinkAttendance>>["children"][number] & {
  statuses: { key: string; name: string; letter: string; tone: string }[];
  lockText: string;
  todayIso: string;
};

const CELL: Record<string, string> = {
  present: "bg-ok/15 text-ok", late: "bg-warn/20 text-warn", absent: "bg-bad text-surface", "half-day": "bg-warn/12 text-warn",
  leave: "bg-info/15 text-info", medical: "bg-info/10 text-info", excused: "bg-sunken text-ink2",
};
const WEEK = ["S", "M", "T", "W", "T", "F", "S"];

function AttendanceSection({ data }: { data: Data; view: GuardianView }) {
  const names = new Map(data.statuses.map((s) => [s.key, s]));
  const m = data.month;
  const s = m.summary;
  const lead = m.cells[0]?.weekday ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-ink2">{m.label}</p>
        <p><span className="font-display text-2xl font-semibold tnum">{percentText(s.percent)}</span> <span className="text-sm text-ink3">present</span></p>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {([["Present", s.present], ["Absent", s.absent], ["Leave", s.leave]] as const).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-sunken px-2 py-2"><dt className="text-xs text-ink3">{k}</dt><dd className="font-semibold tnum">{v}</dd></div>
        ))}
      </dl>
      <div role="grid" aria-label={`Attendance in ${m.label}`} className="grid grid-cols-7 gap-1 text-center">
        {WEEK.map((w, i) => <div key={i} role="columnheader" className="text-[11px] font-medium text-ink3">{w}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} />)}
        {m.cells.map((c) => {
          const st = c.statusKey ? names.get(c.statusKey) : null;
          const cls = c.off || c.future || !c.statusKey ? "text-ink3" : CELL[c.statusKey] ?? "bg-brand/10 text-ink";
          const title = c.off ?? (c.future ? "" : st?.name ?? "Not marked");
          const isToday = c.date === data.todayIso;
          return (
            <div key={c.date} role="gridcell" title={title} aria-label={`${c.day}: ${title || "Not yet"}${isToday && !data.todayFinal ? ", not final yet" : ""}`}
              className={`aspect-square rounded-lg grid place-items-center text-[13px] tnum ${cls} ${isToday ? "ring-2 ring-brand/50" : ""}`}>
              {c.day}
            </div>
          );
        })}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink2">
        <span><span className="inline-block size-2.5 rounded bg-ok/40 mr-1" />Present</span>
        <span><span className="inline-block size-2.5 rounded bg-warn/40 mr-1" />Late</span>
        <span><span className="inline-block size-2.5 rounded bg-bad mr-1" />Absent</span>
        <span><span className="inline-block size-2.5 rounded bg-info/30 mr-1" />Leave</span>
      </p>
      {!data.todayFinal && <p className="text-sm text-ink2">Today&apos;s attendance can still change until {data.lockText}.</p>}
    </div>
  );
}

registerSection<Data>({
  key: "attendance",
  label: "Attendance",
  description: "This month's attendance as a calendar, with the %",
  order: 30,
  load: async (tx, ctx, view) => {
    const settings = await ensureAttendanceDefaults(tx, ctx);
    const now = new Date();
    const today = schoolDateOf(now, view.timeZone);
    const lock = lockState(settings, today, now, view.timeZone);
    const r = await parentLinkAttendance(tx, ctx, [view.child.id], today, { lockPassed: lock.locked });
    const child = r.children[0];
    if (!child || child.month.summary.workingDays === 0) return null;
    return { ...child, statuses: r.statuses, lockText: lock.atText, todayIso: today.toISOString().slice(0, 10) };
  },
  Render: AttendanceSection,
});
