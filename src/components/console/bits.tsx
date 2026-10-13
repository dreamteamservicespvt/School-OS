// Small pieces shared by the console's pages.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { SchoolStatus } from "@prisma/client";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";

export const STATUS_TONE = { TRIAL: "info", ACTIVE: "ok", SUSPENDED: "warn", CLOSED: "neutral" } as const;
export const STATUS_WORD: Record<SchoolStatus, string> = { TRIAL: "Trial", ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed" };
export const SUB_TONE = { PAID: "ok", DUE: "info", GRACE: "warn", OVERDUE: "bad" } as const;
export const INV_TONE = { PAID: "ok", UNPAID: "warn", WAITING: "warn", CANCELLED: "neutral" } as const;

export function SchoolLogo({ name, size = 40 }: { name: string; size?: number }) {
  return <Avatar name={name} size={size} className={size >= 60 ? "!rounded-2xl" : "!rounded-xl"} />;
}

export function StatusPill({ status, className }: { status: SchoolStatus; className?: string }) {
  return <Pill tone={STATUS_TONE[status]} dot className={className}>{STATUS_WORD[status]}</Pill>;
}

export function BackLink({ href = "/console/schools", label = "Schools", extra }: { href?: string; label?: string; extra?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <ArrowLeft size={17} aria-hidden="true" />{label}{extra && <span className="text-ink3 font-normal"> / {extra}</span>}
    </Link>
  );
}

/** "What happens by itself" lists: one line each, with an icon. */
export function AutoList({ items, className }: { items: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <ul className={cx("flex flex-col gap-2.5 text-[13.5px]", className)}>
      {items.map(([icon, text], i) => <li key={i} className="flex gap-3 text-ink2">{icon}<span>{text}</span></li>)}
    </ul>
  );
}
