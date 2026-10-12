import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "./avatar";
import { cx } from "./cx";
import { TONE_SOFT, type SoftTone } from "./stats";

// One row in a simple list, and a settings row (design/ui-prototype/src/kit.jsx Row, SettingRow, DL).

export function Row({ avatar, icon: Ic, iconTone = "neutral", title, sub, right, href, className }: {
  avatar?: string; icon?: LucideIcon; iconTone?: SoftTone; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; href?: string; className?: string;
}) {
  const body = (
    <>
      {avatar ? <Avatar name={avatar} size={38} /> : Ic ? <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", TONE_SOFT[iconTone])}><Ic size={19} aria-hidden="true" /></span> : null}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[14.5px] leading-snug truncate">{title}</p>
        {sub && <p className="text-[12.5px] text-ink3 truncate">{sub}</p>}
      </div>
      {right && <div className="shrink-0 text-right">{right}</div>}
    </>
  );
  const cls = cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left", className);
  return href ? <Link href={href} className={cx(cls, "hover:bg-sunken/70 transition")}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function SettingRow({ title, sub, children, id }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; id?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <label htmlFor={id} className="min-w-0 flex-1 text-[14px]">
        <b className="font-semibold block">{title}</b>
        {sub && <span className="block text-[12.5px] text-ink3 mt-0.5">{sub}</span>}
      </label>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/** Definition list: label above value. */
export function DL({ rows, cols = 2, className }: { rows: [string, React.ReactNode][]; cols?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-3.5 px-5 pb-5", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-2 xl:grid-cols-3", className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] text-ink3 font-semibold">{k}</dt>
          <dd className="text-[14.5px] mt-0.5 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Newest first. */
export function Timeline({ items }: { items: { icon: LucideIcon; tone?: SoftTone; what: React.ReactNode; when: React.ReactNode }[] }) {
  return (
    <ol className="flex flex-col">
      {items.map((t, i) => {
        const Ic = t.icon;
        return (
          <li key={i} className="grid grid-cols-[36px_1fr] gap-3">
            <span className="flex flex-col items-center">
              <span className={cx("w-9 h-9 rounded-full grid place-items-center", TONE_SOFT[t.tone ?? "neutral"])}><Ic size={16} aria-hidden="true" /></span>
              {i < items.length - 1 && <span className="w-px flex-1 bg-line my-1" />}
            </span>
            <div className="pb-5 pt-1.5 min-w-0">
              <p className="text-[14.5px] leading-snug">{t.what}</p>
              <p className="text-[12.5px] text-ink3 mt-0.5">{t.when}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Main column and side column. */
export function Split({ children, side = 340, className }: { children: React.ReactNode; side?: 300 | 340 | 380; className?: string }) {
  return <div className={cx("grid gap-5 lg:gap-6 items-start", side === 380 ? "xl:grid-cols-[minmax(0,1fr)_380px]" : side === 300 ? "xl:grid-cols-[minmax(0,1fr)_300px]" : "xl:grid-cols-[minmax(0,1fr)_340px]", className)}>{children}</div>;
}
export function Col({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("flex flex-col gap-5 lg:gap-6 min-w-0", className)}>{children}</div>;
}

/** Legend dots under a chart. */
export function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex gap-4 flex-wrap text-[12.5px] text-ink2">
      {items.map(([cls, l]) => <span key={l} className="flex items-center gap-1.5"><span className={cx("w-2.5 h-2.5 rounded-sm", cls)} aria-hidden="true" />{l}</span>)}
    </div>
  );
}
