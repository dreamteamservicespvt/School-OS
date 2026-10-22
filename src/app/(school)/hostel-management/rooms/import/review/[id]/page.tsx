import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PLACES } from "@/lib/imports/places";
import { FileReview } from "@/components/import/file-review";
import { HostelHead } from "../../../../_components/head";
import { BASE, hostelGuard } from "../../../../_lib/page";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Check a file · Import rooms" };

/** One rooms file: match, fix, check every row and bring in the good ones. */
export default async function RoomsImportFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await hostelGuard("rooms");
  if (!p.can.rooms) redirect(`${BASE}/rooms`);
  return (
    <>
      <HostelHead pageName="Import rooms" href={`${BASE}/rooms/import`} mode={p.mode} sub={<Link href={`${BASE}/rooms`} className="hover:underline"><Words k={"Rooms & Beds"} /></Link>} />
      <FileReview current={p.current} place={PLACES.hostel} id={(await params).id} sp={await searchParams} />
    </>
  );
}
