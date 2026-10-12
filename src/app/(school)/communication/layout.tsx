import { requirePage } from "@/lib/current";

/**
 * Communication's pages. Each list page draws its own head with the module's tabs (CommHead);
 * a record opened from a list shows a back link instead, as in the approved design.
 */
export default async function CommunicationLayout({ children }: { children: React.ReactNode }) {
  await requirePage("communication");
  return <>{children}</>;
}
