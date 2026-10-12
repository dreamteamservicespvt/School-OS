"use client";

// A "…" menu whose items come from a server page: icons are named, since
// components cannot be passed from the server.

import { CalendarDays, PencilLine, Timer, Eye, Settings2, Link2 } from "lucide-react";
import { MoreMenu } from "@/components/ui/more-menu";

const ICONS = { calendar: CalendarDays, edit: PencilLine, timer: Timer, view: Eye, settings: Settings2, link: Link2 };
export type RowMenuItem = { icon: keyof typeof ICONS; label: string; href: string };

export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  return <MoreMenu size="sm" label={label} items={items.map((i) => { const Ic = ICONS[i.icon]; return { icon: <Ic size={17} aria-hidden="true" />, label: i.label, href: i.href }; })} />;
}
