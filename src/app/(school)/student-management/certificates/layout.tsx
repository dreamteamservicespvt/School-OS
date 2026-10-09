import { redirect } from "next/navigation";
import { BASE, studentPage } from "../_lib/page";
import { SubTabs } from "../_lib/sub-tabs";

/** Certificates & ID Cards (03 §2): two tabs. */
export default async function CertificatesLayout({ children }: { children: React.ReactNode }) {
  const { can } = await studentPage();
  if (can.reach !== "all" || can.lookupOnly) redirect(BASE);
  const C = `${BASE}/certificates`;
  return (
    <>
      <SubTabs label="Certificates & ID Cards" tabs={[
        { href: C, label: "Certificates", not: [`${C}/id-cards`] },
        { href: `${C}/id-cards`, label: "ID cards" },
      ]} />
      {children}
    </>
  );
}
