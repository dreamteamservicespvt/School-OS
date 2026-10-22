"use client";

import Link from "next/link";
import { Bookmark, Siren } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Words } from "@/lib/i18n/client";

/** Asks the Send Message form to switch to an emergency broadcast. */
export const EMERGENCY_EVENT = "sos:emergency-broadcast";

/** Send Message's head actions: the saved groups, and the red emergency broadcast button for permitted roles. */
export function SendHeadActions({ full, groups, canEmergency }: { full: boolean; groups: { id: string; name: string }[]; canEmergency: boolean }) {
  return (
    <>
      {full && (
        <details className="relative hidden md:block">
          <summary className={buttonClass("secondary", "md", "list-none cursor-pointer [&::-webkit-details-marker]:hidden")}>
            <Bookmark size={17} aria-hidden="true" /><Words k="Saved groups" />
          </summary>
          <div className="absolute right-0 z-30 mt-1.5 w-72 rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
            {groups.length === 0 ? (
              <p className="px-3 py-2.5 text-[13.5px] text-ink3"><Words k="No saved groups yet. Choose who gets a message, then “Save as group”." /></p>
            ) : (
              <ul>
                {groups.map((g) => (
                  <li key={g.id}><Link href={`/communication?group=${g.id}`} className="block rounded-xl px-3 py-2.5 text-[14px] font-semibold hover:bg-sunken">{g.name}</Link></li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}
      {canEmergency && (
        <Button variant="danger-soft" icon={Siren} onClick={() => window.dispatchEvent(new Event(EMERGENCY_EVENT))}><Words k="Emergency broadcast" /></Button>
      )}
    </>
  );
}
