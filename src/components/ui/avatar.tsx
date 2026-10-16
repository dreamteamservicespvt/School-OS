import { cx } from "./cx";

const HUES = [168, 200, 220, 260, 290, 330, 15, 35, 140, 190];

/** Initials on a soft colour picked from the name, so the same person always looks the same. */
export function Avatar({ name, size = 36, src, className, ring }: { name: string; size?: number; src?: string | null; className?: string; ring?: boolean }) {
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived file links
    return <img src={src} alt="" width={size} height={size} className={cx("rounded-full object-cover shrink-0", ring && "ring-2 ring-surface", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden="true"
      className={cx("inline-grid place-items-center rounded-full font-bold shrink-0 select-none", ring && "ring-2 ring-surface", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 70% 50% / .16)`, color: `hsl(${hue} 60% var(--av-l))` }}>
      {initials}
    </span>
  );
}
