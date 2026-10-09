"use client";

// Live preview of the QR poster in each theme, and printing it as a PDF.

import { useState } from "react";
import { buttonClass } from "@/components/ui/button";

export function PosterPreview({ posters, initial, pdfHref }: { posters: { value: string; label: string; html: string }[]; initial: string; pdfHref: string }) {
  const [theme, setTheme] = useState(posters.some((p) => p.value === initial) ? initial : posters[0]?.value);
  const current = posters.find((p) => p.value === theme) ?? posters[0];
  return (
    <div className="space-y-4">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Poster theme</legend>
        {posters.map((p) => (
          <label key={p.value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 ${p.value === theme ? "border-brand bg-brand-soft font-medium text-brand-text" : "border-line bg-surface"}`}>
            <input type="radio" name="theme" value={p.value} checked={p.value === theme} onChange={() => setTheme(p.value)} className="sr-only" />
            {p.label}
          </label>
        ))}
        <a href={`${pdfHref}${pdfHref.includes("?") ? "&" : "?"}theme=${theme}`} target="_blank" rel="noopener" className={buttonClass("primary", "md", "ml-auto")}>Print as PDF</a>
      </fieldset>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-2 p-3">
        <iframe title={`Poster preview, ${current?.label}`} srcDoc={current?.html} sandbox="" className="mx-auto block aspect-[210/297] w-[320px] max-w-full rounded-lg shadow-card" />
      </div>
    </div>
  );
}
