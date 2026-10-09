"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/** Choose several classes to print, one page each (Done when 9). */
export function PrintPicker({ sections, base }: { sections: { id: string; label: string }[]; base: string }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const href = `${base}${base.includes("?") ? "&" : "?"}${chosen.map((id) => `section=${id}`).join("&")}`;
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Print several</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Print several classes">
        <p className="mb-3 text-ink-2">Each class prints on its own page with the legend and the date.</p>
        <div className="mb-3 flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setChosen(sections.map((s) => s.id))}>Choose all</Button>
          <Button variant="ghost" size="sm" onClick={() => setChosen([])}>Clear</Button>
        </div>
        <fieldset className="grid max-h-[50vh] grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
          <legend className="sr-only">Classes</legend>
          {sections.map((s) => (
            <label key={s.id} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-surface-2">
              <input type="checkbox" className="size-5" checked={chosen.includes(s.id)} onChange={() => toggle(s.id)} />
              {s.label}
            </label>
          ))}
        </fieldset>
        <div className="mt-4 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          {chosen.length === 0 ? <Button disabled>Choose at least one class</Button> : (
            <a href={href} target="_blank" rel="noopener" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 font-medium text-brand-ink hover:bg-brand-hover">
              Print {chosen.length} {chosen.length === 1 ? "class" : "classes"}
            </a>
          )}
        </div>
      </Dialog>
    </>
  );
}
