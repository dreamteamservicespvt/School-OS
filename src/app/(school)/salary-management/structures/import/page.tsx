import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PLACES } from "@/lib/imports/places";
import { ImportHome } from "@/components/import/import-home";
import { SalaryHead } from "../../_components/salary-head";
import { BASE, salaryGuard } from "../../_lib/page";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Import salary · Salary Management") };
}

const ABOUT = {
  "salary-structures": "One row per staff member: staff ID, basic, conveyance, special allowance, monthly TDS and the 1st of the month it starts. Each row becomes a new version of that person's structure, as if typed on Add structure; earlier versions stay. Undo works until salary has been worked out with them.",
  "salary-to-date": "Starting part way through the financial year: one row per staff member with the gross pay, PF, ESI, Professional Tax and TDS already paid this year in the old software, up to the month before go-live. The year's totals on salary slips and in the reports, and the TDS check in Generate Salary, count it. It never reaches the Day Book. Undo takes it back.",
};

/** Salary structures from a spreadsheet (10 §2), on the same engine as Switching to School OS; full Salary Management only. */
export default async function ImportStructuresPage() {
  const p = await salaryGuard("structures");
  if (!p.change) redirect(`${BASE}/structures`);
  return (
    <>
      <SalaryHead pageName="Import salary" href={`${BASE}/structures/import`} sub={<Link href={`${BASE}/structures`} className="font-semibold text-brand hover:underline"><Words k="Salary Structures" /></Link>} />
      <ImportHome current={p.current} place={PLACES.salary} about={ABOUT} />
    </>
  );
}
