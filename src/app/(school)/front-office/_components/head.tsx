import { ListChecks, Settings2 } from "lucide-react";
import { ModuleHead } from "@/components/shell/module-head";
import { MoreMenu } from "@/components/ui/more-menu";
import { BASE, addQ, foPage, foTabs } from "../_lib/page";

/** The header and page tabs on every Front Office page. */
export async function FoHead({ pageName, href, sub, actions }: { pageName: string; href: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  const p = await foPage();
  const tabs = await foTabs();
  // The badge says what this person can do on this page: the Principal books appointments but only reads the rest.
  const reach = p.v.level === "full" || (p.v.level === "principal" && href === `${BASE}/appointments`) ? "all" : p.v.level === "gate" ? "own" : "view";
  return <ModuleHead title="Front Office" pageName={pageName} href={href} userId={p.current.user.id} sub={sub} actions={actions} tabs={tabs} tabsLabel="Front Office pages" reach={reach} />;
}

/** Front Office settings and the inline lists, for the Front Office manager (16 §6). */
export function FoManageMenu({ href }: { href: string }) {
  return (
    <MoreMenu label="Front Office settings" items={[
      { label: "Front Office settings", href: addQ(href, { do: "settings" }), icon: <Settings2 size={16} aria-hidden="true" /> },
      { label: "Purposes and departments", href: addQ(href, { do: "lists" }), icon: <ListChecks size={16} aria-hidden="true" /> },
    ]} />
  );
}
