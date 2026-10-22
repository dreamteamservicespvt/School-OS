"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { requestExportAction, setTwoStepAction, undoImportAction } from "./actions";
import { Words } from "@/lib/i18n/client";

/** Refreshes the page while background work is running, so it shows when it is done. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return <p className="sr-only" aria-live="polite"><Words k="This page updates by itself while work is running." /></p>;
}

export function ExportButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  if (disabled) return <p className="text-sm text-ink-2"><Words k="An export is being prepared. This page updates by itself." /></p>;
  return (
    <ConfirmButton trigger="Prepare full export" triggerVariant="primary" title="Prepare a full export of school data?" confirmLabel="Prepare full export"
      onConfirm={async () => { const p = await requestExportAction(); if (!p) router.refresh(); return p; }}>
      <Words k="It holds personal details of students, parents and staff. Keep the file safe and delete it from your computer when you no longer need it. School Admins will see this export in the security alerts and the export log." />
    </ConfirmButton>
  );
}

export function TwoStepSwitch({ on }: { on: boolean }) {
  const router = useRouter();
  return on ? (
    <ConfirmButton trigger="Switch off two-step login" triggerVariant="danger-outline" title="Switch off two-step login?" confirmLabel="Switch off two-step login" confirmVariant="danger" typeToConfirm="switch off"
      onConfirm={async () => { const p = await setTwoStepAction(false); if (!p) router.refresh(); return p; }}>
      <Words k="Anyone who learns a School Admin's, Principal's or Accountant's password could then sign in. Keep it on unless email is not working." />
    </ConfirmButton>
  ) : (
    <ConfirmButton trigger="Switch on two-step login" triggerVariant="primary" title="Switch on two-step login?" confirmLabel="Switch on two-step login"
      onConfirm={async () => { const p = await setTwoStepAction(true); if (!p) router.refresh(); return p; }}>
      <Words k={"People in roles that need it will be asked for a one-time code at their next sign-in. Check each of them has an email address or phone number in Users & Permissions first."} />
    </ConfirmButton>
  );
}

export function UndoImportButton({ batchId, label, added }: { batchId: string; label: string; added: number }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Undo" triggerVariant="ghost" title={`Undo this ${label.toLowerCase()} import?`} confirmLabel={`Undo import of ${added} record${added === 1 ? "" : "s"}`} confirmVariant="danger"
      onConfirm={async () => { const p = await undoImportAction(batchId); if (!p) router.refresh(); return p; }}>
      <Words k="The" /> {added} <Words k="record" />{added === 1 ? "" : "s"} <Words k="this import added will be archived. Records it updated keep their new values. This is written to the audit log." />
    </ConfirmButton>
  );
}
