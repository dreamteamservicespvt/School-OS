"use client";

// The go-live button (workflow 15, step 10). The buttons for each file are
// shared by every import page: src/components/import/file-buttons.tsx.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { goLiveAction } from "./actions";
import { Words } from "@/lib/i18n/client";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function GoLiveButton({ students, staff, guardians, owedBefore }: { students: number; staff: number; guardians: number; owedBefore?: { amount: string; students: number } | null }) {
  const router = useRouter();
  const [send, setSend] = useState(true);
  return (
    <div className="space-y-3">
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} className="mt-1 size-5 accent-[var(--brand)]" />
        <span><span className="font-medium"><Words k="Send each parent their Parent Link now" /></span><span className="block text-sm text-ink-2">{plural(guardians, "parent")} <Words k="get a link to check their child's details and give consent (DPDP Act 2023)." /></span></span>
      </label>
      <ConfirmButton trigger="Go live" triggerVariant="primary" title="Go live on School OS?" confirmLabel={send ? "Go live and send Parent Links" : "Go live"} typeToConfirm="go live"
        onConfirm={async () => { const p = await goLiveAction(send); if (!p) router.refresh(); return p; }}>
        <p><Words k="School OS becomes your school's record from today, with" /> {plural(students, "student")} <Words k="and" /> {plural(staff, "staff member", "staff")}<Words k=". This summary is kept as it is now." /></p>
        <p className="mt-2"><Words k="Automatic messages to parents, fee reminders and late fees start now." /></p>
        {owedBefore && <p className="mt-2 font-medium text-ink">{owedBefore.amount} <Words k="of fees due before go-live is still owed by" /> {plural(owedBefore.students, "student")}<Words k=". Reminders and late fees will go for it. Settle it first under “Fees due before go-live” if the old software collected it or it is in the old dues." /></p>}
        {send ? <p className="mt-2"><Words k="Every parent is sent their Parent Link with the consent request, by WhatsApp or SMS as set up in Settings." /></p> : <p className="mt-2"><Words k="Parent Links are not sent now. Send them from Communication, Parent Link, when you are ready." /></p>}
      </ConfirmButton>
    </div>
  );
}
