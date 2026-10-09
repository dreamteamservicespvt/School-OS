"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ChevronIcon } from "@/components/icons";
import { switchSchool } from "@/app/(school)/actions";

type School = { id: string; name: string };

/** Shown only to people who work in more than one school (00-global.md §1.3). */
export function SchoolSwitcher({ current, schools }: { current: School; schools: School[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-2 font-medium hover:bg-surface-2 [&::-webkit-details-marker]:hidden" aria-label={`School: ${current.name}. Switch school`}>
        <span className="max-w-[12rem] truncate">{current.name}</span>
        <ChevronIcon className="size-4" />
      </summary>
      <div className="absolute left-0 top-12 z-40 w-72 rounded-xl border border-line bg-surface p-2 shadow-lg">
        <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-2">Switch school</p>
        {schools.map((s) => (
          <form key={s.id} action={switchSchool}>
            <input type="hidden" name="schoolId" value={s.id} />
            <input type="hidden" name="back" value={pathname} />
            <button type="submit" aria-current={s.id === current.id ? "true" : undefined}
              className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left ${s.id === current.id ? "bg-brand-soft font-medium text-brand-text" : "hover:bg-surface-2"}`}>
              {s.name}
            </button>
          </form>
        ))}
      </div>
    </details>
  );
}
