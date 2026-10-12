import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "danger-soft" | "danger-outline";
export type ButtonSize = "sm" | "md" | "lg";

// The approved design's buttons (design/ui-prototype/src/ui.jsx).
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brandink hover:brightness-110 active:brightness-95 shadow-sm",
  secondary: "bg-surface text-ink border border-line hover:bg-sunken active:bg-line/60",
  soft: "bg-brand/10 text-brand hover:bg-brand/15 active:bg-brand/20",
  ghost: "text-ink2 hover:bg-sunken hover:text-ink active:bg-line/60",
  danger: "bg-bad text-white hover:brightness-110",
  "danger-soft": "bg-bad/10 text-bad hover:bg-bad/15",
  "danger-outline": "bg-bad/10 text-bad hover:bg-bad/15",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-xl",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = "") {
  return cx(
    "inline-flex items-center justify-center font-semibold whitespace-nowrap transition select-none disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none",
    VARIANTS[variant], SIZES[size], extra,
  );
}

const iconSize = (size: ButtonSize) => (size === "sm" ? 15 : 17);

type Common = { variant?: ButtonVariant; size?: ButtonSize; icon?: LucideIcon; iconRight?: LucideIcon };

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & Common & { loading?: boolean; loadingText?: string };

export function Button({ variant = "primary", size = "md", icon: Icon, iconRight: IconR, loading, loadingText, className = "", children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : Icon && <Icon size={iconSize(size)} strokeWidth={2.2} aria-hidden="true" />}
      {loading && loadingText ? loadingText : children}
      {IconR && <IconR size={16} strokeWidth={2.2} aria-hidden="true" />}
    </button>
  );
}

export function ButtonLink({ href, variant = "secondary", size = "md", icon: Icon, iconRight: IconR, className = "", children, ...rest }: React.ComponentProps<typeof Link> & Common) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {Icon && <Icon size={iconSize(size)} strokeWidth={2.2} aria-hidden="true" />}
      {children}
      {IconR && <IconR size={16} strokeWidth={2.2} aria-hidden="true" />}
    </Link>
  );
}

/** A square icon-only button with a name for screen readers, and an optional count. */
export function IconButton({ icon: Icon, label, badge, className, size = 40, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; badge?: number | null; size?: number }) {
  return (
    <button type="button" aria-label={badge ? `${label}, ${badge} new` : label} title={label} {...rest}
      className={cx("relative inline-flex items-center justify-center rounded-xl text-ink2 hover:bg-sunken hover:text-ink transition shrink-0", className)}
      style={{ width: size, height: size }}>
      <Icon size={19} strokeWidth={2} aria-hidden="true" />
      <CountDot count={badge} />
    </button>
  );
}

export function IconLink({ icon: Icon, label, badge, className, size = 40, ...rest }: React.ComponentProps<typeof Link> & { icon: LucideIcon; label: string; badge?: number | null; size?: number }) {
  return (
    <Link aria-label={badge ? `${label}, ${badge} new` : label} title={label} {...rest}
      className={cx("relative inline-flex items-center justify-center rounded-xl text-ink2 hover:bg-sunken hover:text-ink transition shrink-0", className)}
      style={{ width: size, height: size }}>
      <Icon size={19} strokeWidth={2} aria-hidden="true" />
      <CountDot count={badge} />
    </Link>
  );
}

export function CountDot({ count }: { count?: number | null }) {
  if (!count || count <= 0) return null;
  return (
    <span aria-hidden="true" className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-bad text-white text-[10px] font-bold grid place-items-center ring-2 ring-surface tnum">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cx("animate-spin", className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
