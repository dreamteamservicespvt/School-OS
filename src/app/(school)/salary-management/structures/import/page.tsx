import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PLACES } from "@/lib/imports/places";
import { ImportHome } from "@/components/import/import-home";
import { SalaryHead } from "../../_components/salary-head";
import { BASE, salaryGuard } from "../../_lib/page";

export const metadata: Metadata = { title: "Import salary structures · Salary Management" };

const ABOUT = {
  "salary-structures": "One row per staff member: staff ID, basic, conveyance, special allowance, monthly TDS and the 1st of the month it starts. Each row becomes a new version of that person's structure, as if typed on Add structure; earlier versions stay. Undo works until salary has been worked out with them.",
};

/** Salary structures from a spreadsheet (10 §2), on the same engine as Switching to School OS; full Salary Management only. */
export default async function ImportStructuresPage() {
  const p = await salaryGuard("structures");
  if (!p.change) redirect(`${BASE}/structures`);
  return (
    <>
      <SalaryHead pageName="Import salary structures" href={`${BASE}/structures/import`} sub={<Link href={`${BASE}/structures`} className="font-semibold text-brand hover:underline">Salary Structures</Link>} />
      <ImportHome current={p.current} place={PLACES.salary} about={ABOUT} />
    </>
  );
}
