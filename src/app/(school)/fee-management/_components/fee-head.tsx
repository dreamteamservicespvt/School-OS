import { ModuleHead } from "@/components/shell/module-head";
import { feePage, feeTabs } from "../_lib/page";

/** The header and page tabs on every Fee Management page. Actions show only to people who may change things. */
export async function FeeHead({ pageName, href, sub, actions, title = "Fees", viewActions }: {
  pageName: string;
  href: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  /** Actions that need no change permission, like Export. */
  viewActions?: React.ReactNode;
  title?: string;
}) {
  const p = await feePage();
  const tabs = await feeTabs();
  const shown = <>{viewActions}{p.can.change ? actions : null}</>;
  return (
    <ModuleHead title={title} pageName={pageName} href={href} userId={p.current.user.id} sub={sub}
      actions={viewActions || (p.can.change && actions) ? shown : null} tabs={tabs} tabsLabel="Fee Management pages" reach={p.reach} />
  );
}
