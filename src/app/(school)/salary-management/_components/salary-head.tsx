import { ModuleHead } from "@/components/shell/module-head";
import { salaryPage, salaryTabs } from "../_lib/page";

/** The header and page tabs on every Salary Management page. `actions` show only to people who may change things. */
export async function SalaryHead({ pageName, href, sub, actions, viewActions }: {
  pageName: string;
  href: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  /** Actions that need no change permission, like Export. */
  viewActions?: React.ReactNode;
}) {
  const p = await salaryPage();
  const tabs = await salaryTabs();
  const shown = <>{viewActions}{p.change ? actions : null}</>;
  return (
    <ModuleHead title="Salary" pageName={pageName} href={href} userId={p.current.user.id} sub={sub}
      actions={viewActions || (p.change && actions) ? shown : null} tabs={tabs} tabsLabel="Salary Management pages"
      access={p.level === "full" ? "full" : p.level === "view" ? "view" : "own"} />
  );
}
