import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PLACES } from "@/lib/imports/places";
import { ImportHome } from "@/components/import/import-home";
import { EvHead } from "../_components/head";
import { BASE, evGuard } from "../_lib/page";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Import holidays · Events & Calendar") };
}

const ABOUT = {
  "calendar-holidays": "One row per holiday or vacation, with its date (and a vacation's last day). Each is added as if typed on the School Calendar: attendance is off on those days. A holiday already on the calendar is not added twice.",
};

/** The holiday list from a spreadsheet (18 §2 School Calendar), for whoever keeps the School Calendar; no Settings needed. */
export default async function HolidayImportPage() {
  const p = await evGuard("calendar");
  if (!p.can.calendar) redirect(BASE);
  return (
    <>
      <EvHead pageName="Import holidays" href={`${BASE}/import`}
        sub={<><Words k="The holiday list from a spreadsheet." /> <Link href={BASE} className="font-semibold text-brand hover:underline"><Words k="School Calendar" /></Link></>} />
      <ImportHome current={p.current} place={PLACES.events} about={ABOUT} />
    </>
  );
}
