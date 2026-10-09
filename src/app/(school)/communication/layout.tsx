import { requirePage } from "@/lib/current";
import { Tabs } from "@/components/ui/tabs";

/** Communication's pages, in the order of 11-communication.md §2. */
export default async function CommunicationLayout({ children }: { children: React.ReactNode }) {
  const current = await requirePage("communication");
  const full = current.permissions.communication?.change === "all";
  const tabs = [
    { href: "/communication", label: "Send Message", exact: true },
    { href: "/communication/notices", label: "Notice Board" },
    { href: "/communication/history", label: "Message History" },
    { href: "/communication/queries", label: "Feedback & Queries" },
    { href: "/communication/templates", label: "Message Templates" },
    ...(full ? [{ href: "/communication/parent-link", label: "Parent Link" }, { href: "/communication/settings", label: "Message Settings" }] : []),
  ];
  return (
    <>
      <Tabs tabs={tabs} label="Communication pages" />
      {children}
    </>
  );
}
