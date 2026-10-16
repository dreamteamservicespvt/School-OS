import { Download } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";

// Export a list as Excel, CSV or PDF with the filters on screen (P8). The approved design's
// secondary "Export" button, with the three formats in a small menu under it.
export function ExportMenu({ href, label = "Export", className }: { href: string; label?: string; className?: string }) {
  const join = href.includes("?") ? "&" : "?";
  return (
    <details className={cx("relative hidden md:block shrink-0 group", className)}>
      <summary className={buttonClass("secondary", "md", "list-none cursor-pointer [&::-webkit-details-marker]:hidden")}>
        <Download size={17} strokeWidth={2.2} aria-hidden="true" />{label}
      </summary>
      <ul className="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-pop animate-rise">
        {[["xlsx", "Excel"], ["csv", "CSV"], ["pdf", "PDF"]].map(([f, l]) => (
          <li key={f}><a href={`${href}${join}format=${f}`} className="flex h-10 items-center rounded-xl px-3 text-[14px] hover:bg-sunken" download>{l}</a></li>
        ))}
      </ul>
    </details>
  );
}
