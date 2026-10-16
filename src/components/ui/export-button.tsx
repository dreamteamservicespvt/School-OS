import { Download, FileSpreadsheet, FileText, Sheet } from "lucide-react";
import { buttonClass, type ButtonSize } from "./button";
import { cx } from "./cx";

/**
 * Export (P8) in the approved design (kit.jsx ExportButton): Excel, CSV or PDF of
 * the list with the filters on screen. The file has the school name, the
 * filters and who exported it on top, and the export is logged.
 */
export function ExportButton({ href, label = "Export", size = "md", className, always }: { href: string; label?: string; size?: ButtonSize; className?: string; always?: boolean }) {
  const join = href.includes("?") ? "&" : "?";
  return (
    <details className={cx("relative group", !always && "hidden md:block", className)}>
      <summary className={cx(buttonClass("secondary", size), "list-none cursor-pointer [&::-webkit-details-marker]:hidden")}>
        <Download size={size === "sm" ? 15 : 17} strokeWidth={2.2} aria-hidden="true" />{label}
      </summary>
      <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-40 w-48 max-w-[calc(100vw-2rem)] bg-surface border border-line rounded-2xl shadow-pop p-1.5 animate-rise">
        {([["xlsx", "Excel", FileSpreadsheet], ["csv", "CSV", Sheet], ["pdf", "PDF", FileText]] as const).map(([f, l, Ic]) => (
          <a key={f} role="menuitem" href={`${href}${join}format=${f}`} download className="w-full flex items-center gap-2.5 h-10 px-3 rounded-xl hover:bg-sunken text-[14px]">
            <Ic size={17} className="text-ink3" aria-hidden="true" />{l}
          </a>
        ))}
      </div>
    </details>
  );
}
