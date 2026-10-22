import type { LucideIcon } from "lucide-react";
import { cx } from "./cx";
import { tx } from "@/lib/i18n/tx";
import { Words } from "@/lib/i18n/client";

// White work surfaces on the tinted canvas (design/ui-prototype/src/ui.jsx).
export function Card({ children, className = "", as: Tag = "section", ...rest }: { children: React.ReactNode; className?: string; as?: "section" | "div" | "article" | "aside" } & React.HTMLAttributes<HTMLElement>) {
  return <Tag className={cx("bg-surface rounded-2xl border border-line/70 shadow-card", className)} {...rest}>{children}</Tag>;
}

/** A card's title row: optional icon tile, title, one line under it, and an action on the right. */
export function CardHeader({ title, description, action, id, icon: Icon, divided = false }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; id?: string; icon?: LucideIcon; divided?: boolean }) {
  return (
    // On a phone a wide action goes under the title rather than squeezing it into a narrow column.
    <div className={cx("flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3", divided && "border-b border-line")}>
      <div className="min-w-[min(100%,13rem)] flex-1 flex items-center gap-2.5">
        {Icon && <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand grid place-items-center shrink-0"><Icon size={17} aria-hidden="true" /></span>}
        <div className="min-w-0">
          <h2 id={id} className="font-semibold text-[15px] leading-tight">{tx(title)}</h2>
          {description && <p className="text-[13px] text-ink3 mt-0.5">{tx(description)}</p>}
        </div>
      </div>
      {action && <div className="ml-auto max-w-full min-w-0 flex flex-wrap justify-end gap-2 [&>div]:flex-wrap [&>div]:justify-end">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("px-5 pb-5 first:pt-5", className)}>{children}</div>;
}

/** A label and value pair for details screens. */
export function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-ink3">{tx(label)}</dt>
      <dd className="text-[14.5px] font-medium break-words mt-0.5">{children ?? <span className="text-ink3 font-normal"><Words k="Not added" /></span>}</dd>
    </div>
  );
}
