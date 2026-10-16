"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { ErrorSummary, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { archive, removeLinkedAccount, restore, saveLinkedAccount, switchGateway, testSaved, type TestState } from "./actions";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button variant="secondary" size="sm" onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopied(false);
      }
    }}>
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}

export function TestResult({ result }: { result: NonNullable<TestState> }) {
  return (
    <div className={`rounded-xl border p-4 ${result.ok ? "border-success/30 bg-success-soft" : "border-danger/30 bg-danger-soft"}`} role={result.ok ? "status" : "alert"}>
      <p className={`font-medium ${result.ok ? "text-success" : "text-danger"}`}>{result.message}</p>
      {result.checks && (
        <ul className="mt-2 space-y-1.5 text-sm text-ink">
          {result.checks.map((c) => (
            <li key={c.label} className="flex gap-2">
              <span aria-hidden="true" className={c.ok ? "text-success" : "text-danger"}>{c.ok ? "✓" : "✕"}</span>
              <span><span className="sr-only">{c.ok ? "Passed: " : "Problem: "}</span><strong className="font-medium">{c.label}.</strong> {c.note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TestSavedButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<TestState, FormData>(testSaved, null);
  return (
    <div className="space-y-3">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="secondary" loading={pending} loadingText="Testing…">Test connection</Button>
      </form>
      {state && <TestResult result={state} />}
    </div>
  );
}

export function SwitchGateway({ id, name, on, tested }: { id: string; name: string; on: boolean; tested: boolean }) {
  if (!on && !tested) {
    return <p className="text-sm text-ink-2">Switch on becomes available after a test passes.</p>;
  }
  return (
    <ConfirmButton
      trigger={on ? "Switch off" : "Switch on"}
      triggerVariant={on ? "danger-outline" : "primary"}
      title={on ? `Switch off ${name}?` : `Switch on ${name}?`}
      confirmLabel={on ? `Switch off ${name}` : `Switch on ${name}`}
      confirmVariant={on ? "danger" : "primary"}
      typeToConfirm={name}
      onConfirm={() => switchGateway(id, !on, name)}>
      {on
        ? "Parents will not be able to pay online through this gateway until it is switched on again. Counter payments carry on."
        : "Parents can pay through this gateway in the classes Fee Settings sends to it."}
    </ConfirmButton>
  );
}

export function ArchiveGateway({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmButton trigger="Archive" triggerVariant="danger-outline" title={`Archive ${name}?`} confirmLabel={`Archive ${name}`} confirmVariant="danger" typeToConfirm={name}
      onConfirm={() => archive(id, name)}>
      The gateway is switched off and hidden. Payments already made through it keep their record. You can restore it later.
    </ConfirmButton>
  );
}

export function RestoreGateway({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div>
      <Button variant="secondary" loading={busy} onClick={async () => { setBusy(true); const p = await restore(id); if (p) setProblem(p); setBusy(false); }}>Restore</Button>
      {problem && <p role="alert" className="mt-2 text-sm text-danger">{problem}</p>}
    </div>
  );
}

export function LinkedAccountForm({ gatewayId }: { gatewayId: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveLinkedAccount, null);
  const v = state?.ok ? {} : state?.values ?? {};
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate key={state?.ok ? state.message : "form"}>
      <input type="hidden" name="gatewayId" value={gatewayId} />
      <FormMessage state={state} />
      <ErrorSummary errors={e} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Account name" name="label" required defaultValue={v.label} error={e.label} placeholder="Trust account" help="The name the office uses, shown on receipts." />
        <TextField label="Bank" name="bankName" required defaultValue={v.bankName} error={e.bankName} placeholder="State Bank of India" />
        <TextField label="Last 4 digits of the account number" name="accountLast4" required inputMode="numeric" maxLength={4} defaultValue={v.accountLast4} error={e.accountLast4} help="Only the last 4 digits are kept here." />
        <TextField label="IFSC" name="ifsc" required defaultValue={v.ifsc} error={e.ifsc} maxLength={11} autoCapitalize="characters" />
        <TextField label="Razorpay linked account ID" name="linkedAccountId" required defaultValue={v.linkedAccountId} error={e.linkedAccountId} className="sm:col-span-2" spellCheck={false}
          placeholder="acc_XXXXXXXXXXXXXX" help="From Razorpay, Route, Linked Accounts, after Razorpay has verified the bank account." />
      </div>
      <div className="flex justify-end"><SubmitButton pendingText="Adding…">Add bank account</SubmitButton></div>
    </form>
  );
}

export function RemoveLinkedAccount({ gatewayId, id, label }: { gatewayId: string; id: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Archive" triggerVariant="ghost" title={`Archive ${label}?`} confirmLabel={`Archive ${label}`} confirmVariant="danger"
      onConfirm={async () => { const p = await removeLinkedAccount(gatewayId, id); if (!p) router.refresh(); return p; }}>
      Online payments will no longer be split into {label}. Fee heads linked to it will need another account in Fee Settings. Payments already made keep their account.
    </ConfirmButton>
  );
}
