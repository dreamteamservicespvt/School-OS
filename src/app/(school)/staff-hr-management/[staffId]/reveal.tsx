"use client";

// A restricted number shown masked, with a Show tap for the roles allowed to see it
// in full (like the student profile's Identifiers card). Only those roles get `full`.
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Words } from "@/lib/i18n/client";

export function Reveal({ masked, full }: { masked: string; full?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono tnum">{open && full ? full : masked}</span>
      {full ? (
        <button type="button" onClick={() => setOpen(!open)} aria-pressed={open}
          className="inline-flex h-11 md:h-8 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-brand-text hover:bg-brand/8 focus-visible:outline-2">
          {open ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}<Words k={open ? "Hide" : "Show"} />
        </button>
      ) : null}
    </span>
  );
}
