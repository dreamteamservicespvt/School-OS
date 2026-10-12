import { redirect } from "next/navigation";
import { BASE, financePage } from "./_lib/page";

/** Finance Management opens on the Day Book. */
export default async function FinanceHome() {
  await financePage();
  redirect(`${BASE}/day-book`);
}
