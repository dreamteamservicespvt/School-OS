import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { PLACES } from "@/lib/imports/places";
import { ImportHome } from "@/components/import/import-home";
import { AttHead } from "../_components/att-head";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Import attendance so far · Attendance" };

const ABOUT = {
  "attendance-so-far": "Starting part way through the year: one row per student with the admission number, the days the school met and the days present, up to the day before you started on School OS. Each becomes one opening total for the year, not daily marks. The year's attendance %, Early Warnings and forecasts count it from the first day. Undo takes the totals back.",
};

/** Workflow 15 (gap list G19): attendance so far, on the same engine as Switching to School OS; full Attendance Management only. */
export default async function ImportAttendancePage() {
  const { current, access, features } = await attendancePage("create");
  if (!access.full || access.see !== "all") redirect(`${BASE}/register`);
  return (
    <>
      <AttHead access={access} features={features} userId={current.user.id} href={`${BASE}/import`} sub={<Link href={`${BASE}/register`} className="font-semibold text-brand hover:underline"><Words k="Attendance Register" /></Link>} />
      <ImportHome current={current} place={PLACES.attendance} about={ABOUT} />
    </>
  );
}
