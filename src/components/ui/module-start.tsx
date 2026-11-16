// A module that is switched on but has nothing in it yet (layman loop 6, L6-70: Transport,
// Library and Hostel opened on empty lists, searches and maps, which looked half-done).
// One friendly card with one next step instead of the whole page. Nothing is switched off.
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Card } from "./card";
import { ButtonLink } from "./button";
import { tx } from "@/lib/i18n/tx";

export function ModuleStart({ icon: Icon, title, body, href, action, waiting }: {
  icon: LucideIcon;
  /** "Transport is not set up yet" */
  title: string;
  /** One line: what to add first. */
  body: string;
  /** The one next step, when this person may take it. */
  href?: string;
  action?: string;
  /** Said instead of the button when someone else sets it up. */
  waiting?: string;
}) {
  return (
    <Card className="px-6 py-12 flex flex-col items-center text-center gap-3">
      <span className="w-16 h-16 rounded-2xl bg-brand/10 text-brand grid place-items-center" aria-hidden="true"><Icon size={30} /></span>
      <h2 className="font-display font-semibold text-[19px]">{tx(title)}</h2>
      <p className="text-[14.5px] text-ink2 max-w-md">{tx(body)}</p>
      {href && action
        ? <ButtonLink href={href} scroll={false} variant="primary" iconRight={ArrowRight} className="mt-1">{action}</ButtonLink>
        : waiting ? <p className="text-[13.5px] text-ink3">{tx(waiting)}</p> : null}
    </Card>
  );
}
