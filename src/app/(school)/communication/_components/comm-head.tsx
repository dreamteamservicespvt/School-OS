import type { CommAccess } from "@/lib/communication/access";
import { COMM_FEATURES } from "@/lib/communication/features";
import { ModuleHead } from "@/components/shell/module-head";

/**
 * Communication's head on every page: "Communication", one line about this page, its actions, and the
 * module's pages as tabs (11-communication.md §2, in the approved design's order). WhatsApp Inbox and
 * Surveys are optional pages, shown once the school switches them on in Message Settings.
 */
export function CommHead({ access, page, href, sub, actions }: { access: CommAccess; page: string; href: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  const { current, full } = access;
  const on = (k: string) => current.features.has(k);
  const tabs = [
    ...(access.canChange ? [{ href: "/communication", label: "Send Message", exact: true }] : []),
    { href: "/communication/notices", label: "Notice Board" },
    ...(on(COMM_FEATURES.inbox) ? [{ href: "/communication/inbox", label: "WhatsApp Inbox" }] : []),
    { href: "/communication/history", label: "Message History" },
    { href: "/communication/queries", label: "Feedback & Queries" },
    ...(on(COMM_FEATURES.surveys) && full ? [{ href: "/communication/surveys", label: "Surveys" }] : []),
    { href: "/communication/templates", label: "Message Templates" },
    ...(full ? [{ href: "/communication/parent-link", label: "Parent Link" }, { href: "/communication/settings", label: "Message Settings" }] : []),
  ];
  return (
    <ModuleHead title="Communication" page={page} href={href} userId={current.user.id} sub={sub} access={full ? "full" : "own"}
      actions={access.canChange ? actions : undefined} tabs={tabs} tabsLabel="Communication pages" />
  );
}
