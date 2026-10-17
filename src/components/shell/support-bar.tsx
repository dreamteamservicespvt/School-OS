"use client";

// The coloured bar on every screen while DREAM TEAM looks inside a school
// (07-super-admin.md §3.4, step 4): "Support access for Sunrise Public School,
// ends 3:40 PM", with End now. At the time given the browser goes back to the
// console (access ends by itself, step 5; the server refuses it from then anyway).

import { useEffect } from "react";
import { LifeBuoy } from "lucide-react";

export function SupportBar({ schoolName, ends, endsAt, who }: { schoolName: string; ends: string; endsAt: string; who: string }) {
  useEffect(() => {
    const left = new Date(endsAt).getTime() - Date.now();
    // A full page load on purpose: /support/left is a route that clears the support cookie, not a page.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    const t = setTimeout(() => window.location.assign("/support/left"), Math.max(1000, Math.min(left + 1000, 2_147_000_000)));
    return () => clearTimeout(t);
  }, [endsAt]);
  return (
    <div role="status" aria-live="polite" className="bg-[#6b21a8] text-white border-b border-black/20 no-print">
      <div className="px-4 md:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px]">
        <LifeBuoy size={17} className="shrink-0" aria-hidden="true" />
        <p className="flex-1 min-w-0">
          <b className="font-semibold">Support access for {schoolName}, ends {ends}.</b>{" "}
          <span className="opacity-90">{who}, DREAM TEAM · looking only: nothing can be changed, exported or printed.</span>
        </p>
        <form method="post" action="/support/end">
          <button type="submit" className="h-8 px-3 rounded-lg bg-white/15 hover:bg-white/25 font-semibold transition">End now</button>
        </form>
      </div>
    </div>
  );
}
