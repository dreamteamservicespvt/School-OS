import { ModuleHead } from "@/components/shell/module-head";
import type { PageKey } from "@/lib/transport/words";
import { pageHref, pageName } from "@/lib/transport/words";
import { trPage, trTabs } from "../_lib/page";

/** The header and page tabs on every Transport page. The badge says what this person can do on this page. */
export async function TrHead({ page, sub, actions, href }: { page: PageKey; sub?: React.ReactNode; actions?: React.ReactNode; href?: string }) {
  const p = await trPage();
  const tabs = await trTabs();
  const mode = p.v.pages[page];
  const reach = mode === "full" ? "all" : p.v.level === "own" ? "own" : "view";
  return <ModuleHead title="Transport Management" pageName={pageName(page)} href={href ?? pageHref(page)} userId={p.current.user.id} sub={sub} actions={actions} tabs={tabs} tabsLabel="Transport pages" reach={reach} />;
}
