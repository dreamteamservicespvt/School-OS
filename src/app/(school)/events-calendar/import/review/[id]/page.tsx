import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PLACES } from "@/lib/imports/places";
import { FileReview } from "@/components/import/file-review";
import { EvHead } from "../../../_components/head";
import { BASE, evGuard } from "../../../_lib/page";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Check a file · Import holidays" };

/** One holiday list file: match, fix, check every row and bring in the good ones. */
export default async function HolidayImportFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await evGuard("calendar");
  if (!p.can.calendar) redirect(BASE);
  return (
    <>
      <EvHead pageName="Import holidays" href={`${BASE}/import`} sub={<Link href={BASE} className="font-semibold text-brand hover:underline"><Words k="School Calendar" /></Link>} />
      <FileReview current={p.current} place={PLACES.events} id={(await params).id} sp={await searchParams} />
    </>
  );
}
