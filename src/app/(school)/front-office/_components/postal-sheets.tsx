"use client";

// Postal & Deliveries sheets (mod-frontoffice.jsx PostalSheet and HandSheet).

import { useState } from "react";
import { Camera, CircleCheck } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import { FieldShell, inputCls } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { COURIERS } from "@/lib/front-office/words";
import { handOverAction, postalAction } from "../actions";
import { SegField } from "./fields";

type Opt = { value: string; label: string };

export function PostalSheet({ closeHref, received, forOptions }: { closeHref: string; received: boolean; forOptions: Opt[] }) {
  const photoErr = useTyped("photo", "").error;
  const [photoName, setPhotoName] = useState<string | null>(null);
  return (
    <SheetForm title={received ? "Record received item" : "Record sent item"} sub={received ? "The person it is for is told on the app." : "Keep the tracking number for later."} closeHref={closeHref}
      action={postalAction} hidden={{ direction: received ? "RECEIVED" : "SENT" }} submitLabel="Save" pendingText="Saving…">
      <SegField name="itemType" label="Type" required start={received ? "COURIER" : "LETTER"} options={[{ value: "LETTER", label: "Letter" }, { value: "COURIER", label: "Courier" }, { value: "PARCEL", label: "Parcel" }]} />
      <SText name="party" label={received ? "From" : "To"} required maxLength={150} placeholder={received ? "For example: CBSE Regional Office, Chennai" : "For example: District Educational Officer, Medchal"} />
      <SSelect name="for" label={received ? "For" : "From"} required placeholder="Choose staff or department" options={forOptions} />
      <div className="grid grid-cols-2 gap-3">
        <SSelect name="courier" label="Courier" required={!received} placeholder="Choose" options={COURIERS.map((c) => ({ value: c, label: c }))} />
        <SText name="trackingNo" label="Tracking number" maxLength={40} placeholder="EK419277833IN" className="[&_input]:font-mono [&_input]:uppercase" autoComplete="off" />
      </div>
      {received && (
        <FieldShell label="Photo" id="pd-photo" help="Optional" error={photoErr}>
          <label htmlFor="pd-photo" className={cx(buttonClass("secondary"), "self-start cursor-pointer")}>
            {photoName ? <CircleCheck size={17} aria-hidden="true" /> : <Camera size={17} aria-hidden="true" />}{photoName ? "Photo added" : "Take photo of the label"}
          </label>
          <input id="pd-photo" name="photo" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)} />
        </FieldShell>
      )}
      {received && <SSwitch name="tell" title="Tell the person it is for" sub="In-app notification, “Collect from the front desk”" start />}
    </SheetForm>
  );
}

export function HandSheet({ closeHref, entry, people }: { closeHref: string; entry: { id: string; type: string; party: string; forText: string; start: string }; people: string[] }) {
  const t = useTyped("who", entry.start);
  const [who, setWho] = useState(t.value);
  return (
    <SheetForm title={`Hand over: ${entry.type.toLowerCase()} from ${entry.party}`} sub={`For ${entry.forText}. Record who collected it.`} closeHref={closeHref}
      action={handOverAction} hidden={{ entryId: entry.id }} submitLabel={`Hand over to ${who.trim() || "…"}`} pendingText="Saving…">
      <FieldShell label="Collected by" id="ho-who" required error={t.error}>
        <input id="ho-who" name="who" list="ho-people" value={who} onChange={(e) => setWho(e.target.value)} maxLength={120} autoComplete="off"
          aria-invalid={t.error ? true : undefined} className={cx(inputCls(t.error), "h-11")} />
        <datalist id="ho-people">{people.map((n) => <option key={n} value={n} />)}</datalist>
      </FieldShell>
    </SheetForm>
  );
}
