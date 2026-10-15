// One trip in detail (12 §2 Trips): the stops in trip order with the planned
// and reached times, and the students at each with Boarded, Not boarded or
// Dropped. The in-charge can run the trip from here when the driver cannot.
import { Check, CircleDot, School, Square, X } from "lucide-react";
import type { tripSheet } from "@/lib/transport/trips";
import { minutesLate } from "@/lib/transport/views";
import { TRIP_STATUS, clockOf, showPlate, tripKind } from "@/lib/transport/words";
import { clockAt } from "@/lib/front-office/time";
import { Pill } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";
import { ActButton, ConfirmAct } from "./fields";
import { TripLine } from "./map";
import { endTripAction, markBoardingAction, markStopAction, startTripAction } from "../actions";

type Sheet = Awaited<ReturnType<typeof tripSheet>>;

const BOARD_WORDS: Record<string, { label: string; tone: "ok" | "bad" | "info" }> = {
  BOARDED: { label: "Boarded", tone: "ok" }, NOT_BOARDED: { label: "Not boarded", tone: "bad" }, DROPPED: { label: "Dropped", tone: "info" },
};

export function TripPanel({ sheet, tz, canRun, driver }: { sheet: Sheet; tz: string; canRun: boolean; driver: string | null }) {
  const t = sheet.trip;
  const running = t.status === "STARTED";
  const morning = t.kind === "MORNING";
  const reached = sheet.stops.filter((s) => s.reached?.status === "REACHED").length;
  const students = sheet.stops.reduce((n, s) => n + s.students.length, 0);
  const marked = sheet.stops.reduce((n, s) => n + s.students.filter((x) => x.status).length, 0);
  const allDone = sheet.stops.length > 0 && sheet.stops.every((s) => s.reached);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={TRIP_STATUS[t.status]?.tone ?? "neutral"} dot>{TRIP_STATUS[t.status]?.label}</Pill>
        <span className="text-[13.5px] text-ink2">{tripKind(t.kind)} · starts {clockOf(t.plannedStartMin)}{t.startedAt ? ` · started ${clockAt(t.startedAt, tz)}` : ""}{t.endedAt ? ` · ended ${clockAt(t.endedAt, tz)}` : ""}</span>
      </div>
      <p className="text-[13.5px] text-ink3">{sheet.vehicle ? `${sheet.vehicle.label ?? "Vehicle"} · ${showPlate(sheet.vehicle.number)}` : "No vehicle"} · {driver ?? "no driver"}{t.changedForDay ? ` · changed for this day${t.changeNote ? `: ${t.changeNote}` : ""}` : ""}{t.cancelReason ? ` · cancelled: ${t.cancelReason}` : ""}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-sunken/70 py-2"><p className="text-[11.5px] font-semibold text-ink3">Stops reached</p><p className="font-display font-semibold text-[18px] tnum">{reached} of {sheet.stops.length}</p></div>
        <div className="rounded-xl bg-sunken/70 py-2"><p className="text-[11.5px] font-semibold text-ink3">Students</p><p className="font-display font-semibold text-[18px] tnum">{students}</p></div>
        <div className="rounded-xl bg-sunken/70 py-2"><p className="text-[11.5px] font-semibold text-ink3">Marked</p><p className="font-display font-semibold text-[18px] tnum">{marked} of {students}</p></div>
      </div>
      <TripLine stops={sheet.stops.map((s) => ({ id: s.id, name: s.name, reached: s.reached?.status === "REACHED", missed: s.reached?.status === "MISSED" }))}
        bus={!running ? "none" : allDone ? "end" : "between"} end={morning ? "School" : "Last stop"} ariaLabel={`Progress of Route ${sheet.route.number}`} />
      {canRun && (
        <div className="flex flex-wrap gap-2">
          {t.status === "SCHEDULED" && <ActButton action={startTripAction} fields={{ tripId: t.id }} label="Start trip" icon="Play" variant="primary" size="md" pendingText="Starting…" />}
          {running && (
            <ConfirmAct action={endTripAction} fields={{ tripId: t.id }} trigger={<><Square size={15} aria-hidden="true" />End trip</>} title="End this trip?" confirmLabel="End trip">
              {sheet.stops.length - reached > 0 ? `${sheet.stops.length - reached} stops not reached will be marked missed.` : "Every stop is reached."} {morning ? "Students marked boarded are marked dropped at school, and their parents get the drop message when it is on." : ""} No more locations are kept.
            </ConfirmAct>
          )}
        </div>
      )}
      <ol className="flex flex-col">
        {sheet.stops.map((s, i) => {
          const late = s.reached?.status === "REACHED" ? minutesLate(s.reached.at, s.reached.plannedMin, tz) : null;
          return (
            <li key={s.id} className="relative pl-9 pb-4 last:pb-1">
              <span className={cx("absolute left-[11px] top-6 bottom-0 w-0.5", s.reached ? "bg-ok/40" : "bg-line")} aria-hidden="true" />
              <span className={cx("absolute left-0 top-0.5 w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold", s.reached?.status === "REACHED" ? "bg-ok text-white" : s.reached?.status === "MISSED" ? "bg-bad/15 text-bad" : "bg-sunken text-ink2")}>
                {s.reached?.status === "REACHED" ? <Check size={13} aria-hidden="true" /> : s.reached?.status === "MISSED" ? <X size={13} aria-hidden="true" /> : i + 1}
              </span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="font-semibold text-[14.5px] min-w-0">{s.name}</p>
                <span className="text-[12.5px] text-ink3 tnum">Planned {clockOf(s.planned)}</span>
                {s.reached?.status === "REACHED" && <span className={cx("text-[12.5px] tnum font-semibold", late != null && late > 5 ? "text-warn" : "text-ok")}>Reached {clockAt(s.reached.at, tz)}{late != null && late > 0 ? ` · ${late} min late` : ""}{s.reached.source === "GEOFENCE" ? " · automatic" : ""}</span>}
                {s.reached?.status === "MISSED" && <span className="text-[12.5px] text-bad font-semibold">Missed</span>}
                {canRun && running && !s.reached && <ActButton action={markStopAction} fields={{ tripId: t.id, stopId: s.id }} label="Reached" icon="Flag" pendingText="Saving…" />}
              </div>
              {s.students.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {s.students.map((st) => (
                    <li key={st.id} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                      <CircleDot size={12} className="text-ink3" aria-hidden="true" />
                      <span className="min-w-0">{st.name}</span>
                      {st.status && <Pill tone={BOARD_WORDS[st.status].tone} className="!h-5 !text-[11px]">{BOARD_WORDS[st.status].label}</Pill>}
                      {canRun && running && (
                        <span className="flex gap-1 ml-auto">
                          {morning ? <>
                            {st.status !== "BOARDED" && <ActButton action={markBoardingAction} fields={{ tripId: t.id, studentId: st.id, status: "BOARDED" }} label="Boarded" variant="ghost" />}
                            {st.status !== "NOT_BOARDED" && <ActButton action={markBoardingAction} fields={{ tripId: t.id, studentId: st.id, status: "NOT_BOARDED" }} label="Not boarded" variant="ghost" />}
                          </> : <>
                            {st.status !== "BOARDED" && st.status !== "DROPPED" && <ActButton action={markBoardingAction} fields={{ tripId: t.id, studentId: st.id, status: "BOARDED" }} label="Boarded" variant="ghost" />}
                            {st.status !== "DROPPED" && <ActButton action={markBoardingAction} fields={{ tripId: t.id, studentId: st.id, status: "DROPPED" }} label="Dropped" variant="ghost" />}
                          </>}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        <li className="relative pl-9">
          <span className="absolute left-0 top-0.5 w-6 h-6 rounded-full grid place-items-center bg-brand text-brandink"><School size={13} aria-hidden="true" /></span>
          <p className="font-semibold text-[14.5px]">{morning ? "School" : "Trip ends"}</p>
        </li>
      </ol>
    </div>
  );
}
