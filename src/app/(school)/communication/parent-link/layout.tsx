import { commOfficePage } from "@/lib/communication/access";

/** Parent Link management is for people with school-wide Communication access (Principal, School Admin); others go to the no-access page. */
export default async function ParentLinkLayout({ children }: { children: React.ReactNode }) {
  await commOfficePage();
  return <>{children}</>;
}
