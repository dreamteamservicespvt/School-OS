import { requirePage } from "@/lib/current";

/** Each page draws the module header and tabs itself, so the header carries the page's own line and actions (design ModuleHead). */
export default async function ExamLayout({ children }: { children: React.ReactNode }) {
  await requirePage("examination-results");
  return <>{children}</>;
}
