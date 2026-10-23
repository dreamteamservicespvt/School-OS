import Link from "next/link";
import { Banner } from "@/components/ui/banner";
import { Words } from "@/lib/i18n/client";

// The strip on a list opened for another academic year (?year=, from the
// Dashboard's year filter; src/lib/academic/view-year.ts): the year shown, that
// a year which is over is read-only (P18), and the way back to this year.

export function ViewYearStrip({ year, back, className = "mb-4" }: { year: { name: string; past: boolean } | null; back: string; className?: string }) {
  if (!year) return null;
  return (
    <Banner tone="warn" className={className} title={<Words k="You are viewing {year}" vars={{ year: year.name }} />}
      action={<Link href={back} className="font-semibold underline text-[14px]"><Words k="Back to this year" /></Link>}>
      {year.past
        ? <Words k="This year is over, so its numbers are shown as they stood at its end and nothing can be changed from here." />
        : <Words k="This list shows that year, as the Dashboard counted it." />}
    </Banner>
  );
}
