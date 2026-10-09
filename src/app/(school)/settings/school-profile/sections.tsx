"use client";

import { useActionState, useRef, useState } from "react";
import { ErrorSummary, SelectField, TextField } from "@/components/ui/field";
import { Alert, FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm";
import { BOARDS, LANGUAGES, TIME_ZONES, boardDefaultsWords } from "@/lib/settings/profile-rules";
import { removeLogoAction, saveBoardAction, saveComplianceAction, saveLogoAction, saveRegionAction } from "./actions";

export function LogoForm({ logoHref }: { logoHref: string | null }) {
  const [state, action] = useActionState(saveLogoAction, null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const shown = preview ?? logoHref;
  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-surface-2">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="School logo" className="size-full object-contain p-2" />
        ) : <span className="px-2 text-center text-sm text-ink-2">No logo yet</span>}
      </div>
      <form action={action} className="min-w-0 flex-1 space-y-3" onSubmit={() => setPreview(null)}>
        <FormMessage state={state} />
        <div>
          <label htmlFor="logo" className="mb-1 block text-sm font-medium">Logo file</label>
          <input ref={input} id="logo" name="logo" type="file" accept="image/png,image/jpeg" aria-describedby="logo-help"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFileError(null);
              if (!f) return setPreview(null);
              if (!["image/png", "image/jpeg"].includes(f.type)) { setFileError("Use a PNG or JPG file."); e.target.value = ""; return; }
              if (f.size > 10 * 1024 * 1024) { setFileError(`This file is ${(f.size / 1024 / 1024).toFixed(1)} MB. Files can be at most 10 MB.`); e.target.value = ""; return; }
              setPreview(URL.createObjectURL(f));
            }}
            className="block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5" />
          <p id="logo-help" className={`mt-1 text-sm ${fileError || state?.errors?.logo ? "text-danger" : "text-ink-2"}`}>{fileError ?? state?.errors?.logo ?? "PNG or JPG, at most 10 MB. A square logo with a plain background looks best."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingText="Uploading…">Upload logo</SubmitButton>
          {logoHref && (
            <ConfirmButton trigger="Remove logo" triggerVariant="ghost" title="Remove the logo?" confirmLabel="Remove logo" confirmVariant="danger" onConfirm={removeLogoAction}>
              Screens, receipts and certificates will show the school name without a logo. The file is kept and you can upload a logo again any time.
            </ConfirmButton>
          )}
        </div>
      </form>
    </div>
  );
}

export function BoardForm({ board, secondBoard }: { board: string; secondBoard: string }) {
  const [state, action] = useActionState(saveBoardAction, null);
  const [chosen, setChosen] = useState(state?.values?.board ?? board);
  const [two, setTwo] = useState(Boolean(secondBoard));
  return (
    <form action={action} className="max-w-xl space-y-4">
      <FormMessage state={state} />
      <SelectField label="Board" name="board" required value={chosen} onChange={(e) => setChosen(e.target.value)} options={BOARDS} placeholder="Choose the board" error={state?.errors?.board} />
      {chosen && (
        <Alert tone="info" title="What this board sets">
          {boardDefaultsWords(chosen)} The school can still change each of these in its module.
        </Alert>
      )}
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="twoBoards" checked={two} onChange={(e) => setTwo(e.target.checked)} className="size-5 accent-[var(--brand)]" />
        <span className="font-medium">This school runs two boards</span>
      </label>
      {two && (
        <SelectField label="Second board" name="secondBoard" required defaultValue={state?.values?.secondBoard ?? secondBoard} options={BOARDS.filter((b) => b.value !== chosen)} placeholder="Choose the second board" error={state?.errors?.secondBoard} />
      )}
      <SubmitButton pendingText="Applying…">{chosen && chosen !== board ? `Apply ${chosen}` : "Save board"}</SubmitButton>
    </form>
  );
}

export function RegionForm({ languages, defaultLanguage, timeZone }: { languages: string[]; defaultLanguage: string; timeZone: string }) {
  const [state, action] = useActionState(saveRegionAction, null);
  const [on, setOn] = useState<string[]>(languages);
  const [def, setDef] = useState(defaultLanguage);
  return (
    <form action={action} className="space-y-5">
      <FormMessage state={state} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Screen and message languages <span className="text-danger" aria-hidden="true">*</span></legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {LANGUAGES.map((l) => (
            <label key={l.value} className="flex min-h-11 items-center gap-3 rounded-lg border border-line px-3">
              <input type="checkbox" name="languages" value={l.value} checked={on.includes(l.value)}
                onChange={(e) => {
                  const next = e.target.checked ? [...on, l.value] : on.filter((x) => x !== l.value);
                  setOn(next);
                  if (!next.includes(def) && next[0]) setDef(next[0]);
                }} className="size-5 accent-[var(--brand)]" />
              {l.label}
            </label>
          ))}
        </div>
        {state?.errors?.languages && <p className="mt-1 text-sm text-danger">{state.errors.languages}</p>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Default language" name="defaultLanguage" required value={def} onChange={(e) => setDef(e.target.value)} options={LANGUAGES.filter((l) => on.includes(l.value))} error={state?.errors?.defaultLanguage} help="New staff and messages start in this language." />
        <SelectField label="Time zone" name="timeZone" required defaultValue={timeZone} options={TIME_ZONES} error={state?.errors?.timeZone} />
      </div>
      <dl className="grid gap-3 rounded-xl bg-surface-2 p-4 text-sm sm:grid-cols-3">
        <div><dt className="text-ink-2">Dates</dt><dd className="font-medium">DD-MM-YYYY, like 09-10-2026</dd></div>
        <div><dt className="text-ink-2">Numbers and money</dt><dd className="font-medium">Indian grouping, like ₹1,16,400</dd></div>
        <div><dt className="text-ink-2">Currency</dt><dd className="font-medium">Indian rupee (₹)</dd></div>
      </dl>
      <SubmitButton pendingText="Saving…">Save language and region</SubmitButton>
    </form>
  );
}

type Compliance = { udiseCode: string; boardSchoolCode: string; registrationNumber: string; panNumber: string };

export function ComplianceForm({ initial, board }: { initial: Compliance; board: string }) {
  const [state, action] = useActionState(saveComplianceAction, null);
  const v = (k: keyof Compliance) => state?.values?.[k] ?? initial[k];
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <ErrorSummary errors={state?.errors} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="UDISE+ code" name="udiseCode" inputMode="numeric" maxLength={11} defaultValue={v("udiseCode")} error={state?.errors?.udiseCode} help="11 digits, from the UDISE+ portal. Used in government reports." />
        <TextField label={board ? `${board} school code` : "Board school code"} name="boardSchoolCode" defaultValue={v("boardSchoolCode")} error={state?.errors?.boardSchoolCode} help="The school number the board gives, used on board registrations." />
        <TextField label="Society or trust registration number" name="registrationNumber" defaultValue={v("registrationNumber")} error={state?.errors?.registrationNumber} />
        <TextField label="PAN of the society or trust" name="panNumber" maxLength={10} defaultValue={v("panNumber")} error={state?.errors?.panNumber} style={{ textTransform: "uppercase" }} />
      </div>
      <SubmitButton pendingText="Saving…">Save compliance details</SubmitButton>
    </form>
  );
}
