import { commPage } from "@/lib/communication/access";
import { Alert } from "@/components/ui/alert";

/** Parent Link management is for people with school-wide Communication access (Principal, School Admin). */
export default async function ParentLinkLayout({ children }: { children: React.ReactNode }) {
  const access = await commPage();
  if (!access.full) {
    return <Alert tone="info" title="Parent Link is managed by the office">Only the Principal and School Admin can see and manage parents&rsquo; links. Ask them if a parent has lost their link.</Alert>;
  }
  return <>{children}</>;
}
