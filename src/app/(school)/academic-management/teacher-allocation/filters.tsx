"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Spinner } from "@/components/ui/button";

function useSet() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v); else next.delete(k);
    start(() => router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false }));
  };
  return { set, pending };
}

/** "Only gaps" switch, kept in ?gaps=1. */
export function GapsToggle({ on }: { on: boolean }) {
  const { set, pending } = useSet();
  return (
    <label className="flex min-h-11 items-center gap-2 text-[15px]">
      <input type="checkbox" className="size-5 accent-brand" checked={on} onChange={(e) => set("gaps", e.target.checked ? "1" : null)} />
      Show only sections with gaps
      {pending && <Spinner className="size-4 text-ink-2" />}
    </label>
  );
}

/** Name or subject search, kept in ?q=. */
export function TeacherSearch({ value }: { value: string }) {
  const { set, pending } = useSet();
  const [text, setText] = useState(value);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => set("q", text.trim() || null), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <label className="flex max-w-md flex-col gap-1 text-sm">
      <span className="font-medium">Search teachers</span>
      <span className="flex items-center gap-2">
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Name, class or subject"
          className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px]" />
        {pending && <Spinner className="size-4 text-ink-2" />}
      </span>
    </label>
  );
}
