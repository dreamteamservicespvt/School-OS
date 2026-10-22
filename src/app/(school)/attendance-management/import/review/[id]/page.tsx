import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { PLACES } from "@/lib/imports/places";
import { FileReview } from "@/components/import/file-review";
import { AttHead } from "../../../_components/att-head";

export const metadata: Metadata = { title: "Check a file · Import attendance so far" };

/** One file of attendance so far: match, fix, check every row and bring in the good ones. */
export default async function AttendanceImportFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, access, features } = await attendancePage("create");
  if (!access.full || access.see !== "all") redirect(`${BASE}/register`);
  return (
    <>
      <AttHead access={access} features={features} userId={current.user.id} href={`${BASE}/import`} sub={<Link href={`${BASE}/import`} className="font-semibold text-brand hover:underline">Import attendance so far</Link>} />
      <FileReview current={current} place={PLACES.attendance} id={(await params).id} sp={await searchParams} />
    </>
  );
}
