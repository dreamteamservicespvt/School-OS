// Export a list as Excel, CSV or PDF with the filters on screen (P8).
export function ExportMenu({ href, label = "Export" }: { href: string; label?: string }) {
  const join = href.includes("?") ? "&" : "?";
  return (
    <details className="relative">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-line-strong bg-surface px-4 font-medium hover:bg-surface-2">{label}</summary>
      <ul className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
        {[["xlsx", "Excel"], ["csv", "CSV"], ["pdf", "PDF"]].map(([f, l]) => (
          <li key={f}><a href={`${href}${join}format=${f}`} className="flex min-h-11 items-center px-4 hover:bg-surface-2" download>{l}</a></li>
        ))}
      </ul>
    </details>
  );
}
