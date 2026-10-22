import { Words } from "@/lib/i18n/client";
/** Export with the filters on screen to Excel, CSV and PDF (P8). */
export function ExportLinks({ href, label }: { href: string; label: string }) {
  const join = href.includes("?") ? "&" : "?";
  const link = "inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-surface-2";
  return (
    <div className="no-print flex flex-wrap items-center gap-2" role="group" aria-label={`Export ${label}`}>
      <span className="text-sm text-ink-2"><Words k="Export" /> {label.toLowerCase()}:</span>
      <a className={link} href={`${href}${join}format=xlsx`} download><Words k="Excel" /></a>
      <a className={link} href={`${href}${join}format=csv`} download><Words k="CSV" /></a>
      <a className={link} href={`${href}${join}format=pdf`} download><Words k="PDF" /></a>
    </div>
  );
}
