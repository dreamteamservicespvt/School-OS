// The Dashboard's filters (01-dashboard.md §2 Controls): a campus, for people
// who see more than one, and the day, on the control centre. Both are kept in
// the page address; the cards and the lists they open follow them (gap list G36).
import Link from "next/link";
import { UrlDate, UrlSelect } from "@/components/ui/url-controls";
import { Words } from "@/lib/i18n/client";

export function DashFilterBar({ campuses, day, today, showing }: {
  campuses: { id: string; name: string }[];
  /** The day chosen ("" for today), or null when the home has no day filter. */
  day: string | null;
  today: string;
  /** Words for the filters in use, such as "North Campus · 09-10-2026"; empty for none. */
  showing: string;
}) {
  if (!campuses.length && day === null) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
      {campuses.length > 0 && (
        <UrlSelect param="campus" label="Campus" className="sm:w-56"
          options={[{ value: "", label: "All campuses" }, ...campuses.map((c) => ({ value: c.id, label: c.name }))]} />
      )}
      {day !== null && <UrlDate label="Day" value={day || today} max={today} className="sm:w-44" />}
      {showing && (
        <p className="text-[13px] text-ink2">
          <Words k="Showing" /> {showing}<Words k=". Each number opens its list with the same filter." />{" "}
          <Link href="/dashboard?view=dashboard" className="font-semibold text-brand hover:underline"><Words k="Reset" /></Link>
        </p>
      )}
    </div>
  );
}
