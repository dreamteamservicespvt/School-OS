// Small display parts shared by the Fee Management pages (mod-fees.jsx).
import { Banknote, Building2, CreditCard, FileSignature, Globe, Landmark, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import { Pill } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";
import type { DueStatus } from "@/lib/fees/dues";

export const MODE_ICON: Record<string, LucideIcon> = {
  CASH: Banknote, UPI: Smartphone, CARD: CreditCard, CHEQUE: FileSignature, BANK_TRANSFER: Landmark, GATEWAY: Globe, NET_BANKING: Building2,
};
export const MODE_WORD: Record<string, string> = {
  CASH: "Cash", UPI: "UPI", CARD: "Card", CHEQUE: "Cheque", BANK_TRANSFER: "Bank transfer", GATEWAY: "Online (Razorpay)", NET_BANKING: "Net banking",
};
export const modeWord = (m: string) => MODE_WORD[m] ?? m;

export function ModeIcon({ mode, size = 15 }: { mode: string; size?: number }) {
  const Ic = MODE_ICON[mode] ?? Wallet;
  return <Ic size={size} className="text-ink3 shrink-0" aria-hidden="true" />;
}

const PAY: Record<string, { label: string; short: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
  POSTED: { label: "Posted", short: "Posted", tone: "ok" },
  WAITING: { label: "Waiting for verification", short: "To verify", tone: "warn" },
  CANCELLED: { label: "Cancelled", short: "Cancelled", tone: "bad" },
  FAILED: { label: "Failed", short: "Failed", tone: "bad" },
  BROUGHT_IN: { label: "Brought in", short: "Brought in", tone: "neutral" },
};

export function PayPill({ status, short, broughtIn }: { status: string; short?: boolean; broughtIn?: boolean }) {
  const w = PAY[broughtIn && status === "POSTED" ? "BROUGHT_IN" : status] ?? { label: status, short: status, tone: "neutral" as const };
  return <Pill tone={w.tone} className={short ? "!h-5 !text-[11px]" : ""}>{short ? w.short : w.label}</Pill>;
}

export const DUE_WORD: Record<DueStatus, { label: string; tone: "ok" | "warn" | "bad" | "neutral" | "info" }> = {
  NOT_DUE: { label: "Not due", tone: "neutral" },
  DUE: { label: "Due", tone: "warn" },
  OVERDUE: { label: "Overdue", tone: "bad" },
  PAID: { label: "Paid", tone: "ok" },
  REMOVED: { label: "Removed", tone: "neutral" },
};

export function DuePill({ status, small, className }: { status: DueStatus; small?: boolean; className?: string }) {
  const w = DUE_WORD[status];
  return <Pill tone={w.tone} className={cx(small && "!h-5 !text-[11px]", className)}>{w.label}</Pill>;
}

/** The CANCELLED stamp on a cancelled receipt. */
export function Stamp({ children = "CANCELLED" }: { children?: React.ReactNode }) {
  return <span className="pointer-events-none absolute right-4 top-14 -rotate-12 border-2 border-bad text-bad rounded-lg px-3 py-0.5 font-display font-bold tracking-[.2em] text-[17px] bg-surface/80" aria-hidden="true">{children}</span>;
}

export const pct = (a: bigint | number, b: bigint | number) => (Number(b) ? Math.round((Number(a) / Number(b)) * 100) : 0);
