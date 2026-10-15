// Small display pieces shared by the Transport pages (no browser code).
import { cx } from "@/components/ui/cx";

const TONES = { brand: "bg-brand/10 text-brand", warn: "bg-warn/12 text-warn", ok: "bg-ok/10 text-ok", bad: "bg-bad/10 text-bad", info: "bg-info/10 text-info", neutral: "bg-sunken text-ink2" } as const;
export type BadgeTone = keyof typeof TONES;

/** The route number in a rounded square (the prototype's BusBadge). */
export function RouteBadge({ n, tone = "brand", size = 36 }: { n: number | string; tone?: BadgeTone; size?: number }) {
  return <span className={cx("rounded-xl grid place-items-center font-display font-semibold shrink-0 tnum", TONES[tone])} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">{n}</span>;
}

/** A label and a value in a small sunken box (trip numbers). */
export function Figure({ k, v, tone }: { k: string; v: React.ReactNode; tone?: "warn" | "bad" | "ok" }) {
  return (
    <div className="rounded-xl bg-sunken/70 px-3 py-2.5 min-w-0">
      <p className="text-[11.5px] text-ink3 font-semibold truncate">{k}</p>
      <p className={cx("font-display font-semibold text-[18px] tnum truncate", tone === "warn" && "text-warn", tone === "bad" && "text-bad", tone === "ok" && "text-ok")}>{v}</p>
    </div>
  );
}

/** "Call" as a phone link (the phone's dialler). */
export function telHref(phone: string) {
  return `tel:+91${phone.replace(/\D/g, "").slice(-10)}`;
}

export function showPhone(phone: string) {
  const d = phone.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : phone;
}
