"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { archiveTemplateAction, refreshApprovalAction, submitApprovalAction } from "../actions";
import { Words } from "@/lib/i18n/client";

function useRun() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<string | void>) => start(async () => {
    setMsg(null);
    const m = await fn();
    if (m) setMsg(m);
    else router.refresh();
  });
  return { msg, pending, run };
}

export function ApprovalButton({ versionId }: { versionId: string }) {
  const { msg, pending, run } = useRun();
  return (
    <div>
      <Button variant="soft" icon={Send} loading={pending} loadingText="Sending" onClick={() => run(() => submitApprovalAction(versionId))}><Words k="Send for WhatsApp approval" /></Button>
      {msg && <p role="alert" className="mt-1 text-[13px] text-bad">{msg}</p>}
    </div>
  );
}

export function RefreshApproval({ id }: { id: string }) {
  const { msg, pending, run } = useRun();
  return (
    <div>
      <Button variant="secondary" icon={RefreshCw} loading={pending} loadingText="Checking" onClick={() => run(() => refreshApprovalAction(id))}><Words k="Check approval status" /></Button>
      {msg && <p role="alert" className="mt-1 text-[13px] text-bad">{msg}</p>}
    </div>
  );
}

export function ArchiveTemplate({ id, name, archived, usedBy }: { id: string; name: string; archived: boolean; usedBy: string[] }) {
  const router = useRouter();
  if (archived) {
    return (
      <ConfirmButton trigger="Restore" title={`Restore "${name}"?`} confirmLabel="Restore"
        onConfirm={async () => { const m = await archiveTemplateAction(id, false); if (!m) router.refresh(); return m; }}>
        <Words k="It can be chosen for messages again." />
      </ConfirmButton>
    );
  }
  return (
    <ConfirmButton trigger="Archive" triggerVariant="danger-outline" title={`Archive "${name}"?`} confirmLabel="Archive" confirmVariant="danger"
      onConfirm={async () => { const m = await archiveTemplateAction(id, true); if (!m) router.push("/communication/templates"); return m; }}>
      {usedBy.length ? `Automatic messages use it: ${usedBy.join(", ")}. They will use another template of the same kind, or stop until you choose one. ` : ""}
      <Words k="Messages already sent keep their text. You can restore it from the archived list." />
    </ConfirmButton>
  );
}
