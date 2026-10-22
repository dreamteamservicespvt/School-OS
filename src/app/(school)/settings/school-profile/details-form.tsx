"use client";

import { useActionState, useState } from "react";
import { ErrorSummary, TextArea, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { BRAND_PRESETS, HEX, checkGstin, inkOn } from "@/lib/settings/profile-rules";
import { saveDetailsAction } from "./actions";
import { Words } from "@/lib/i18n/client";

export type Details = { name: string; address: string; phone: string; email: string; website: string; affiliationNumber: string; gstin: string; brandColor: string };

export function DetailsForm({ initial, logoHref }: { initial: Details; logoHref: string | null }) {
  const [state, action] = useActionState(saveDetailsAction, null);
  const v = (k: keyof Details) => state?.values?.[k] ?? initial[k];
  const [color, setColor] = useState(v("brandColor") || "#1d4ed8");
  const [name, setName] = useState(v("name"));
  const [gstError, setGstError] = useState<string | null>(null);
  const err = (k: string) => (k === "gstin" && gstError) || state?.errors?.[k];

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_20rem]" noValidate>
      <div className="space-y-4">
        <FormMessage state={state} />
        <ErrorSummary errors={state?.errors} />
        <TextField label="School name" name="name" required defaultValue={v("name")} error={err("name")} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
        <TextArea label="Address" name="address" required defaultValue={v("address")} error={err("address")} rows={2} autoComplete="street-address" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Phone" name="phone" required type="tel" inputMode="tel" defaultValue={v("phone")} error={err("phone")} help="Mobile or landline with STD code." />
          <TextField label="Email" name="email" required type="email" inputMode="email" defaultValue={v("email")} error={err("email")} />
          <TextField label="Website address" name="website" defaultValue={v("website")} error={err("website")} placeholder="www.yourschool.edu.in" help="Text only; shown on documents." />
          <TextField label="Affiliation number" name="affiliationNumber" defaultValue={v("affiliationNumber")} error={err("affiliationNumber")} />
        </div>
        <TextField label="GSTIN" name="gstin" defaultValue={v("gstin")} error={err("gstin")} maxLength={15} className="sm:max-w-sm"
          help="Only if some fee heads are taxable. Printed on tax invoices."
          onBlur={(e) => setGstError(e.target.value.trim() ? checkGstin(e.target.value) : null)}
          onChange={() => gstError && setGstError(null)} style={{ textTransform: "uppercase" }} />
        <fieldset>
          <legend className="mb-1 block text-sm font-medium"><Words k="Brand colour" /></legend>
          <div className="flex flex-wrap items-center gap-2">
            {BRAND_PRESETS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Use colour ${c}`} aria-pressed={color.toLowerCase() === c}
                className={`size-11 rounded-full border-2 ${color.toLowerCase() === c ? "border-ink" : "border-transparent"}`} style={{ background: c }} />
            ))}
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-2 text-sm">
              <span><Words k="Other" /></span>
              <input type="color" value={HEX.test(color) ? color : "#1d4ed8"} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 cursor-pointer bg-transparent" aria-label="Choose any colour" />
            </label>
            <input name="brandColor" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Brand colour code" className="h-11 w-28 rounded-lg border border-line-strong bg-surface px-3 font-mono text-sm" />
          </div>
          {err("brandColor") ? <p className="mt-1 text-sm text-danger">{err("brandColor")}</p> : <p className="mt-1 text-sm text-ink-2"><Words k="Used on receipts, certificates and ID cards with the logo." /></p>}
        </fieldset>
        <SubmitButton pendingText="Saving…"><Words k="Save school details" /></SubmitButton>
      </div>
      <BrandPreview name={name} color={HEX.test(color) ? color : "#1d4ed8"} logoHref={logoHref} />
    </form>
  );
}

/** How the logo and colour look on a screen header, a receipt and a certificate. */
function BrandPreview({ name, color, logoHref }: { name: string; color: string; logoHref: string | null }) {
  const ink = inkOn(color);
  const logo = logoHref ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoHref} alt="" className="size-8 rounded bg-white object-contain p-0.5" />
  ) : (
    <span className="grid size-8 place-items-center rounded bg-white/90 text-xs font-bold" style={{ color }}>{name.trim().slice(0, 1).toUpperCase() || "S"}</span>
  );
  return (
    <aside aria-label="Preview" className="space-y-3">
      <p className="text-sm font-medium text-ink-2"><Words k="Preview" /></p>
      <div className="overflow-hidden rounded-xl border border-line">
        <div className="flex items-center gap-2 px-3 py-2" style={{ background: color, color: ink }}>{logo}<span className="truncate text-sm font-semibold">{name || "School name"}</span></div>
        <p className="bg-surface px-3 py-2 text-xs text-ink-2"><Words k="On screens" /></p>
      </div>
      <div className="rounded-xl border border-line bg-white p-3 text-[11px] text-neutral-900">
        <div className="flex items-center gap-2 border-b-2 pb-1.5" style={{ borderColor: color }}>{logo}<span className="font-semibold">{name || "School name"}</span></div>
        <p className="mt-1.5 font-semibold" style={{ color }}><Words k="FEE RECEIPT" /></p>
        <p><Words k="Receipt SPS/2026/00123 · ₹12,500" /></p>
      </div>
      <div className="rounded-xl border-4 bg-white p-3 text-center text-[11px] text-neutral-900" style={{ borderColor: color }}>
        <div className="flex justify-center">{logo}</div>
        <p className="mt-1 font-semibold">{name || "School name"}</p>
        <p className="mt-1 font-semibold tracking-wide" style={{ color }}><Words k="BONAFIDE CERTIFICATE" /></p>
      </div>
    </aside>
  );
}
