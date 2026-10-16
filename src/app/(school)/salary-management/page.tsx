import { redirect } from "next/navigation";
import { BASE, salaryPage } from "./_lib/page";

/** Salary Management opens on Generate Salary; staff with their own slips only open My Salary Slips. */
export default async function SalaryHome() {
  const p = await salaryPage();
  redirect(p.level === "own" ? `${BASE}/slips?mine=1` : `${BASE}/generate`);
}
