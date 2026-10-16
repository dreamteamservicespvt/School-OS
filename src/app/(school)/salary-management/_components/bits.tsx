// Small shared pieces of the Salary pages (mod-salary.jsx): the run's status
// pill and step bar, a money line in a card, and a breakdown row.
import { Pill } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";
import { RUN_STATUS_LABEL, RUN_STATUS_TONE, RUN_STEPS } from "@/lib/salary/words";

export function RunPill({ s, small }: { s: string; small?: boolean }) {
  return <Pill tone={RUN_STATUS_TONE[s] ?? "neutral"} dot className={small ? "!h-5 !text-[11px]" : undefined}>{RUN_STATUS_LABEL[s] ?? s}</Pill>;
}

export function RunSteps({ status }: { status: string }) {
  const at = RUN_STEPS.findIndex((s) => s[0] === status);
  return (
    <>
      <ol className="px-5 pb-4 grid grid-cols-6 gap-1.5" aria-label="Salary run steps">
        {RUN_STEPS.map(([k, l], i) => {
          const done = i < at, on = i === at;
          return (
            <li key={k} className="min-w-0" aria-current={on ? "step" : undefined}>
              <span className={cx("block h-1.5 rounded-full", done ? "bg-ok" : on ? "bg-brand" : "bg-sunken")} />
              <span className={cx("hidden md:block text-[11.5px] font-semibold mt-1.5 truncate", on ? "text-brand" : done ? "text-ink2" : "text-ink3")}>{l}</span>
            </li>
          );
        })}
      </ol>
      <p className="md:hidden px-5 -mt-2 pb-3 text-[12.5px] text-ink3">Step {at + 1} of 6 · {RUN_STATUS_LABEL[status]}</p>
    </>
  );
}

/** A label and an amount in a totals card. */
export function MoneyLi({ k, v, sub, strong }: { k: React.ReactNode; v: React.ReactNode; sub?: boolean; strong?: boolean }) {
  return (
    <li className={cx("flex justify-between gap-3", sub && "text-[13px]")}>
      <span className={sub ? "text-ink3 pl-3" : "text-ink2"}>{k}</span>
      {strong ? <b className="font-semibold">{v}</b> : <span>{v}</span>}
    </li>
  );
}

/** One line of "how the pay was worked out". */
export function WorkRow({ k, v, sub, tone }: { k: React.ReactNode; v: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <li className="flex items-start justify-between gap-3 py-1.5">
      <span className="min-w-0"><span className="block">{k}</span>{sub && <span className="block text-[12px] text-ink3">{sub}</span>}</span>
      <span className={cx("tnum font-medium shrink-0", tone)}>{v}</span>
    </li>
  );
}

/** A flag on a staff row: adjustments in brand blue, leaving neutral, the rest a warning. */
export function FlagPill({ f, phone }: { f: string; phone?: boolean }) {
  const tone = f === "Adjustment added" ? "brand" : f.startsWith("Leaving") || f.startsWith("No longer") ? "neutral" : "warn";
  return <Pill tone={tone} className={phone ? "!h-[22px] !text-[11.5px]" : "!h-5 !text-[11px]"}>{f}</Pill>;
}
