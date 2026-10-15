"use client";

// One Transport Settings card's form in a sheet: the fields come from the
// page; the section name goes with them for the toast and the audit log.

import { SheetForm } from "@/components/ui/url-sheet";
import { saveSettingsAction } from "../actions";

export function SettingsSheet({ closeHref, title, sub, section, children }: { closeHref: string; title: string; sub?: string; section: string; children: React.ReactNode }) {
  return (
    <SheetForm title={title} sub={sub} closeHref={closeHref} action={saveSettingsAction} submitLabel="Save" pendingText="Saving…" hidden={{ section }}>
      {children}
    </SheetForm>
  );
}
