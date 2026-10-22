"use client";

// How a new staff login signs in the first time (09 Add Staff step 2, 20 §2):
// an invite link sent to them by message (the default), or a temporary
// password HR types and hands over in person, which they must change at the
// first sign-in. The typed password is never shown again (08 §2).
import { useState } from "react";
import { TextField } from "@/components/ui/field";
import { KeepCheck } from "@/components/ui/keep-select";
import { Words } from "@/lib/i18n/client";

export function SignInChoice({ error }: { error?: string }) {
  const [how, setHow] = useState<"invite" | "password">("invite");
  const option = (value: "invite" | "password", label: string, sub: string) => (
    <label className={`flex items-start gap-3 rounded-xl border p-3 ${how === value ? "border-brand bg-brand-soft/40" : "border-line"}`}>
      <KeepCheck type="radio" name="signIn" value={value} checked={how === value} onChange={() => setHow(value)} className="mt-1 size-5 accent-brand" />
      <span><span className="font-medium">{label}</span><span className="block text-sm text-ink-2">{sub}</span></span>
    </label>
  );
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 font-medium"><Words k="First sign-in" /></legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {option("invite", "Send an invite link", "Sent by WhatsApp or SMS, and email when they have one. They choose their own password.")}
        {option("password", "Temporary password", "You type it and give it to them in person. They must choose their own at the first sign-in.")}
      </div>
      {how === "password" && (
        <TextField label="Temporary password" name="temporaryPassword" type="password" autoComplete="new-password" error={error}
          help="At least 8 characters with a letter and a number. It is never shown again or sent by message." />
      )}
    </fieldset>
  );
}
