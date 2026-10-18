// One "Looking ahead" view (19 Early Warnings, AI signals; the lead's review of
// 18 Oct 2026): the most important few first, then every area with its count,
// and everything else behind "See all". The list comes ranked from
// forecastsFor (impact, how soon and how sure); this only shapes it, so it is a
// pure function, tested on its own.
import { FORECAST_AREA_LABEL, type ForecastArea } from "./forecasts";

/** Shown first on Early Warnings and on the Dashboard. */
export const TOP_COUNT = 5;
/** At most this many of one area among the first few, so one kind never crowds out the rest. */
export const TOP_PER_AREA = 2;
/** Shown for each area in "See all" before "and N more". */
export const GROUP_COUNT = 3;

type Item = { key: string; area?: string; strength?: string };

export type AheadGroup<T> = { area: ForecastArea; label: string; count: number; actNow: number; items: T[]; more: number };

/**
 * The view of a ranked list: `top` (the first few, at most TOP_PER_AREA of one
 * area), `groups` (every area in order of its most important item, with the
 * count, the Act now count, the first GROUP_COUNT items and how many more), and
 * the total. `area` limits the groups to one area, every item shown.
 */
export function lookingAheadView<T extends Item>(ranked: T[], opts: { area?: string | null } = {}) {
  const top: T[] = [];
  const per = new Map<string, number>();
  for (const s of ranked) {
    if (top.length >= TOP_COUNT) break;
    const a = s.area ?? "students";
    if ((per.get(a) ?? 0) >= TOP_PER_AREA) continue;
    per.set(a, (per.get(a) ?? 0) + 1);
    top.push(s);
  }
  const by = new Map<string, T[]>();
  for (const s of ranked) by.set(s.area ?? "students", [...(by.get(s.area ?? "students") ?? []), s]);
  const groups: AheadGroup<T>[] = [...by.entries()]
    .filter(([a]) => !opts.area || a === opts.area)
    .map(([a, items]) => {
      const shown = opts.area ? items : items.slice(0, GROUP_COUNT);
      return {
        area: a as ForecastArea, label: FORECAST_AREA_LABEL[a as ForecastArea] ?? a, count: items.length,
        actNow: items.filter((s) => s.strength === "ACT_NOW").length, items: shown, more: items.length - shown.length,
      };
    });
  return { top, groups, total: ranked.length };
}
