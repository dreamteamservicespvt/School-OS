import type { ModuleKey } from "@/lib/modules";

export type MenuItem = { key: ModuleKey; name: string; href: string };
export type PageLink = { label: string; href: string; hint?: string };
