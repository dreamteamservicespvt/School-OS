"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { signOut } from "@/app/(school)/actions";

export function ProfileMenu({ name, roles }: { name: string; roles: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <details ref={ref} className="relative">
      <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-full [&::-webkit-details-marker]:hidden" aria-label="Profile menu">
        <span className="grid size-9 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-ink">{initials}</span>
      </summary>
      <div className="absolute right-0 top-12 z-40 w-64 rounded-xl border border-line bg-surface p-2 shadow-lg">
        <div className="px-3 py-2">
          <p className="font-medium">{name}</p>
          <p className="text-sm text-ink-2">{roles}</p>
        </div>
        <hr className="my-1 border-line" />
        <Link href="/profile" className="flex min-h-11 items-center rounded-lg px-3 hover:bg-surface-2">My profile</Link>
        <Link href="/profile#password" className="flex min-h-11 items-center rounded-lg px-3 hover:bg-surface-2">Change password</Link>
        <Link href="/profile#devices" className="flex min-h-11 items-center rounded-lg px-3 hover:bg-surface-2">Signed-in devices</Link>
        <Link href="/profile#whats-new" className="flex min-h-11 items-center rounded-lg px-3 hover:bg-surface-2">What&apos;s new</Link>
        <hr className="my-1 border-line" />
        <form action={signOut}>
          <button type="submit" className="flex min-h-11 w-full items-center rounded-lg px-3 text-left hover:bg-surface-2">Sign out</button>
        </form>
      </div>
    </details>
  );
}
