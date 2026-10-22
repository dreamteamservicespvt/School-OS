"use client";

import { Award } from "lucide-react";
import { SheetForm } from "@/components/ui/url-sheet";
import { issueCertificatesAction } from "./actions";
import { Words } from "@/lib/i18n/client";

export function IssueSheet({ closeHref, courseId, course, names }: { closeHref: string; courseId: string; course: string; names: string[] }) {
  return (
    <SheetForm title={`Issue ${names.length} course ${names.length === 1 ? "certificate" : "certificates"}?`} closeHref={closeHref} action={issueCertificatesAction} hidden={{ courseId }}
      submitLabel={<><Award size={16} aria-hidden="true" /><Words k="Issue" /> {names.length}</>} pendingText="Issuing…" submitDisabled={!names.length}>
      <p className="text-[14px] text-ink2"><Words k="For finishing every lesson of" /> {course}<Words k=". Each student gets a numbered PDF certificate in the school’s Course certificate design, and students with a login are told. Numbers are never reused." /></p>
      <ul className="rounded-xl border border-line divide-y divide-line/70 max-h-60 overflow-y-auto scroll-thin">
        {names.map((n) => <li key={n} className="px-3 py-1.5 text-[13.5px]">{n}</li>)}
      </ul>
    </SheetForm>
  );
}
