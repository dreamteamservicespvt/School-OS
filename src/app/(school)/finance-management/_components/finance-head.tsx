import { ModuleHead } from "@/components/shell/module-head";
import { financePage, financeTabs } from "../_lib/page";

/** The header and page tabs on every Finance Management page. `actions` show only to people who may change things. */
export async function FinanceHead({ pageName, href, sub, actions, viewActions, title = "Finance" }: {
  pageName: string;
  href: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  /** Actions that need no change permission, like Export. */
  viewActions?: React.ReactNode;
  title?: string;
}) {
  const p = await financePage();
  const tabs = await financeTabs();
  const shown = <>{viewActions}{p.change ? actions : null}</>;
  return (
    <ModuleHead title={title} pageName={pageName} href={href} userId={p.current.user.id} sub={sub}
      actions={viewActions || (p.change && actions) ? shown : null} tabs={tabs} tabsLabel="Finance Management pages" reach={p.change ? "all" : "view"} />
  );
}
