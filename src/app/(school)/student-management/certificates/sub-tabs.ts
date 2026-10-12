// The two tabs inside Certificates & ID Cards.
import { withSchool } from "@/lib/db";
import type { Tab } from "@/components/ui/tabs";
import { BASE, studentPage } from "../_lib/page";

export async function certificateTabs(): Promise<Tab[]> {
  const { current } = await studentPage();
  const C = `${BASE}/certificates`;
  const count = await withSchool(current.ctx, (tx) => tx.certificate.count());
  return [
    { href: C, label: "Certificates", exact: true, also: [`${C}/new`], count },
    { href: `${C}/id-cards`, label: "ID cards" },
  ];
}
