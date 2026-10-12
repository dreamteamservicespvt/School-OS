import { Eye, User } from "lucide-react";
import { PageHeader } from "./page-header";
import { Tabs, type Tab } from "@/components/ui/tabs";
import { Pill } from "@/components/ui/badge";

/**
 * A module page's header in the approved design (design/ui-prototype/src/kit.jsx
 * ModuleHead): the module's short title with a "View only" or "Only yours" pill,
 * one line of context, the actions, then the module's page tabs.
 */
export function ModuleHead({ title, pageName, href, userId, sub, actions, tabs, tabsLabel, reach = "all" }: {
  title: string;
  /** The page's own name, used when it is pinned to Search. */
  pageName: string;
  href: string;
  userId: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: Tab[] | null;
  tabsLabel?: string;
  /** "view" shows View only, "own" shows Only yours. */
  reach?: "all" | "view" | "own";
}) {
  const badge = reach === "view"
    ? <Pill tone="neutral" className="align-middle ml-2 !h-6 relative -top-1"><Eye size={13} aria-hidden="true" />View only</Pill>
    : reach === "own"
      ? <Pill tone="brand" className="align-middle ml-2 !h-6 relative -top-1"><User size={13} aria-hidden="true" />Only yours</Pill>
      : null;
  return (
    <>
      <PageHeader title={title} pinLabel={pageName} href={href} userId={userId} sub={sub} badge={badge}>{actions || null}</PageHeader>
      {tabs && tabs.length > 1 && <Tabs tabs={tabs} label={tabsLabel ?? `${title} pages`} />}
    </>
  );
}
