// Go-live: the first day the school keeps its fees and accounts in School OS
// (Finance Settings, 1 Apr 2026 unless the school changes it). Fee and finance
// records start that day; anything earlier stays in the old software, so a
// date range before it shows "Kept in the old software" instead of "nothing".
// The opening balances on go-live carry the old software's totals.

export const DEFAULT_GO_LIVE = "2026-04-01";

/** How a chosen date range sits against go-live: wholly before it, partly, or not at all. */
export function goLiveOverlap(goLive: Date, from: Date | null, to: Date | null): "before" | "partly" | "after" {
  if (to && to.getTime() < goLive.getTime()) return "before";
  if (!from || from.getTime() < goLive.getTime()) return "partly";
  return "after";
}
