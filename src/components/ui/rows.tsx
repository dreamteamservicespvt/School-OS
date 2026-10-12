import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "./avatar";
import { cx } from "./cx";
import { TONE_SOFT, type Tone } from "./stats";

// One row in a simple list, and a settings row (design/ui-prototype/src/kit.jsx Row, SettingRow).

export function Row({ avatar, icon: Ic, iconTone = "neutral", title, sub, right, href, className }: { avatar?: string; icon?: LucideIcon; iconTone?: Tone | "neutral"; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; href?: string; className?: string }) {
  const cls = cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left", href && "hover:bg-sunken/70 transition", className);
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
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function SettingRow({ title, sub, children, id }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; id?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <label htmlFor={id} className="min-w-0 flex-1 text-[14px]">
        <b className="font-semibold block">{title}</b>
        {sub && <span className="block text-[12.5px] text-ink3 mt-0.5">{sub}</span>}
      </label>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
