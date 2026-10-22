// "Kept in the old software": shown on Fee and Finance lists, reports and
// cards when the chosen dates are before go-live (src/lib/finance/go-live.ts).
import { Archive } from "lucide-react";
import { formatDate } from "@/lib/format";
import { goLiveOverlap } from "@/lib/finance/go-live";
import { Banner, Empty } from "./kit";
import { Words } from "@/lib/i18n/client";

/** Before go-live: the empty state that says where the records are. */
export function OldSoftwareEmpty({ goLive, what = "records" }: { goLive: Date; what?: string }) {
  return (
    <Empty icon={Archive} title="Kept in the old software"
      body={`School OS has ${what} from ${formatDate(goLive)}, the day the school started using it. Earlier ${what} stay in the old software; their totals came in as opening balances.`} />
  );
}

/** A range that starts before go-live and runs past it: one line saying the earlier days are not here. */
export function OldSoftwareBanner({ goLive, from, to, what = "records", className }: { goLive: Date; from: Date | null; to: Date | null; what?: string; className?: string }) {
  if (!from || goLiveOverlap(goLive, from, to) !== "partly") return null;
  return (
    <Banner tone="info" icon={Archive} title={`${what[0].toUpperCase()}${what.slice(1)} start on ${formatDate(goLive)}.`} className={className}>
      <Words k="Days before that are kept in the old software." />
    </Banner>
  );
}

/** Wholly before go-live? Then show OldSoftwareEmpty in place of the list. */
export const allBeforeGoLive = (goLive: Date, from: Date | null, to: Date | null) => goLiveOverlap(goLive, from, to) === "before";
