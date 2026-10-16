"use client";

import { startTransition, useActionState, useState } from "react";
import { saveGateway, testDetails, type TestState } from "./actions";
import type { FormState } from "@/lib/forms";
import { ErrorSummary, SelectField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { CopyButton, TestResult } from "./parts";

export type ProviderInfo = {
  key: string;
  name: string;
  typeWords: string;
  fields: { key: string; label: string; secret: boolean; help?: string; patternHelp?: string }[];
  webhookSecret?: { label: string; help: string };
  dashboardHelp: string;
  hasWebhook: boolean;
};

type Props = {
  mode: "new" | "edit";
  id: string;
  providers: ProviderInfo[];
  /** For edit: the saved values that may be shown (never secrets). */
  saved?: { displayName: string; provider: string; environment: "test" | "live"; values: Record<string, string>; endings: Record<string, string> };
  webhookBase: string;
};

export function GatewayForm({ mode, id, providers, saved, webhookBase }: Props) {
  const [state, action] = useActionState<FormState, FormData>(saveGateway, null);
  const [test, testAction, testing] = useActionState<TestState, FormData>(testDetails, null);
  const v = state?.values ?? {};
  const [provider, setProvider] = useState(v.provider ?? saved?.provider ?? "razorpay");
  const p = providers.find((x) => x.key === provider);
  const [name, setName] = useState(v.displayName ?? saved?.displayName ?? p?.name ?? "");
  const [nameTouched, setNameTouched] = useState(mode === "edit" || Boolean(v.displayName));
  const [environment, setEnvironment] = useState<"test" | "live">((v.environment as "test" | "live") ?? saved?.environment ?? "test");
  // What the person typed in the key fields stays in the form after "Test these details" (a form action
  // resets uncontrolled fields), so they can test and then save without typing the keys again.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const keep = (name: string, fallback: string) => ({ value: typed[name] ?? fallback, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setTyped((t) => ({ ...t, [name]: e.target.value })) });
  const errors = state?.errors ?? {};
  const needsConfirm = mode === "edit" || environment === "live";
  const confirmWord = mode === "edit" ? saved?.displayName ?? name : name || "the display name";
  const webhook = `${webhookBase}&g=${id}`;

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="mode" value={mode} />
      {mode === "edit" && <input type="hidden" name="provider" value={provider} />}
      <FormMessage state={state} />
      <ErrorSummary errors={errors} />

      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "new" ? (
          <SelectField label="Provider" name="provider" required value={provider} error={errors.provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setTyped({});
              const np = providers.find((x) => x.key === e.target.value);
              if (!nameTouched && np) setName(np.name);
            }}
            options={providers.map((x) => ({ value: x.key, label: `${x.name} (${x.typeWords})` }))} />
        ) : (
          <div>
            <p className="mb-1 text-sm font-medium">Provider</p>
            <p className="flex h-11 items-center font-medium">{p?.name}</p>
          </div>
        )}
        <TextField label="Display name" name="displayName" required value={name} maxLength={60} error={errors.displayName}
          onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
          help="Use a distinct name when you add more than one account of the same provider." />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Environment <span className="text-danger" aria-hidden="true">*</span></legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["test", "live"] as const).map((env) => (
            <label key={env} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 ${environment === env ? "border-brand bg-brand-soft" : "border-line-strong"}`}>
              <input type="radio" name="environment" value={env} checked={environment === env} onChange={() => setEnvironment(env)} className="mt-1 size-5 accent-brand" />
              <span>
                <span className="font-medium">{env === "test" ? "Test (sandbox)" : "Live"}</span>
                <span className="block text-sm text-ink-2">{env === "test" ? "No real money moves. Use this first." : "Parents pay real money through this gateway."}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {p && (
        <div className="space-y-4 rounded-xl border border-line p-4">
          <p className="text-sm text-ink-2">{p.dashboardHelp}</p>
          {p.fields.map((f) => {
            const ending = saved?.endings[f.key];
            const help = f.secret
              ? mode === "edit" && ending ? `Saved, ending ${ending}. Leave blank to keep it.` : "Stored encrypted. It is never shown again after saving."
              : f.help ?? f.patternHelp;
            return (
              <TextField key={`${provider}-${f.key}`} label={f.label} name={`f_${f.key}`} required={!(f.secret && mode === "edit" && ending)}
                type={f.secret ? "password" : "text"} autoComplete="off" spellCheck={false}
                {...keep(`f_${f.key}`, f.secret ? "" : v[`f_${f.key}`] ?? saved?.values[f.key] ?? "")}
                placeholder={f.secret && ending ? `•••• ${ending}` : undefined}
                error={errors[`f_${f.key}`]} help={help} />
            );
          })}
          {p.webhookSecret && (
            <TextField label={p.webhookSecret.label} name="webhookSecret" type="password" autoComplete="off" spellCheck={false} {...keep("webhookSecret", "")}
              placeholder={saved?.endings.webhookSecret ? `•••• ${saved.endings.webhookSecret}` : undefined}
              help={saved?.endings.webhookSecret ? `Saved, ending ${saved.endings.webhookSecret}. Leave blank to keep it.` : p.webhookSecret.help} />
          )}
          {p.hasWebhook && (
            <div>
              <p className="mb-1 text-sm font-medium">Webhook address</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-surface-2 px-3 py-2.5 text-sm">{webhook}</code>
                <CopyButton text={webhook} />
              </div>
              <p className="mt-1 text-sm text-ink-2">Add this address in {p.name} so payments it confirms reach School OS. It is filled for you and cannot be changed.</p>
            </div>
          )}
        </div>
      )}

      {test && (
        <div aria-live="polite"><TestResult result={test} /></div>
      )}

      {needsConfirm && (
        <TextField label={`Type ${confirmWord} to confirm`} name="confirm" required autoComplete="off" error={errors.confirm}
          help={mode === "edit" ? "Changing gateway details affects how parents pay. The name confirms it is the right gateway." : "Live mode takes real money from parents."} />
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {/* Not a form action: React empties a form after its action runs, and the admin
            would have to type the keys again before saving. */}
        <Button variant="secondary" loading={testing} loadingText="Testing…"
          onClick={(e) => { const fd = new FormData(e.currentTarget.form ?? undefined); startTransition(() => testAction(fd)); }}>
          Test these details
        </Button>
        <SubmitButton pendingText="Saving…">{mode === "new" ? "Add gateway" : "Save changes"}</SubmitButton>
      </div>
      <p className="text-sm text-ink-2">A new gateway starts switched off. Switch it on after a test passes.</p>
    </form>
  );
}
