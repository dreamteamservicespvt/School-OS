import { ModuleHead } from "@/components/shell/module-head";
import type { HomeworkPageKey } from "@/lib/homework/access";
import { homeworkPage, homeworkTabs, PAGE_HREF } from "../_lib/page";

/**
 * The header and page tabs on every Homework & Learning page. "Only yours" for
 * teachers and students, "View only" for people who read this page but do not
 * do its work. `actions` show only to people who do the work on this page.
 */
export async function HomeworkHead({ page, pageName, href, sub, actions, viewActions }: {
  page: HomeworkPageKey;
  pageName: string;
  href?: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  viewActions?: React.ReactNode;
}) {
  const p = await homeworkPage();
  const tabs = await homeworkTabs();
  const edits = p.edits(page);
  const access = p.student || p.own ? "own" : edits ? "full" : "view";
  const shown = <>{viewActions}{edits ? actions : null}</>;
  return (
    <ModuleHead title="Homework & Learning" pageName={pageName} href={href ?? PAGE_HREF[page]} userId={p.current.user.id} sub={sub}
      actions={viewActions || (edits && actions) ? shown : null} tabs={tabs} tabsLabel="Homework & Learning pages" access={access} />
  );
}
