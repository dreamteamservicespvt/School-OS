import type { PillTone } from "@/components/ui/badge";

export const STATUS_TONE: Record<string, PillTone> = { OPEN: "ok", DRAFT: "neutral", CLOSED: "info" };
export const STATUS_LABEL: Record<string, string> = { OPEN: "Open", DRAFT: "Draft", CLOSED: "Closed" };
