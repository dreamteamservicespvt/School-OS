"use client";

// The forms on a school's console page, each in a sheet opened by the page's
// address (?act=…). The server checks every one again.

import { useState } from "react";
import { CircleCheck, Mail, MessageCircle } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SArea, SSelect, SText } from "@/components/ui/sheet-fields";
import { Segmented } from "@/components/ui/controls";
import { FieldShell, inputCls, type Option } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

const CHECKS = [
  { value: "Called back on the school phone on record", label: "Called back on the school phone on record" },
  { value: "Request on the school letterhead", label: "Request on the school letterhead" },
  { value: "Email from the school email on record", label: "Email from the school email on record" },
];

const mask = (d: string) => { const x = d.replace(/\D/g, "").slice(-10); return x.length === 10 ? `${x.slice(0, 2)}xxx xx${x.slice(7)}` : ""; };

/** WhatsApp and email chips, sent as repeated "channels". */
export function ChannelChips({ start = ["whatsapp"], label = "Send the invite by" }: { start?: string[]; label?: string }) {
  const t = useTyped("channels", null);
  const [on, setOn] = useState<Set<string>>(new Set(start));
  const opts: [string, string, typeof Mail][] = [["whatsapp", "WhatsApp", MessageCircle], ["email", "Email", Mail]];
  return (
    <FieldShell label={label} id="channels" required error={t.error}>
      <div className="flex gap-2 flex-wrap" id="channels">
        {opts.map(([k, l, Ic]) => {
          const sel = on.has(k);
          return (
            <button key={k} type="button" role="checkbox" aria-checked={sel} onClick={() => setOn((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
              className={cx("h-10 px-3.5 rounded-xl border text-[13.5px] font-semibold inline-flex items-center gap-2 transition", sel ? "border-brand bg-brand/10 text-brand" : "border-line text-ink2 hover:border-ink3/50")}>
              {sel ? <CircleCheck size={16} aria-hidden="true" /> : <Ic size={16} aria-hidden="true" />}{l}
            </button>
          );
        })}
      </div>
      {[...on].map((k) => <input key={k} type="hidden" name="channels" value={k} />)}
    </FieldShell>
  );
}

/** A mobile number with +91 in the box. */
export function MobileField({ name, label, help, onValue }: { name: string; label: string; help?: string; onValue?: (v: string) => void }) {
  const t = useTyped(name, "");
  return (
    <FieldShell label={label} id={`m-${name}`} required help={help} error={t.error}>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]" aria-hidden="true">+91</span>
        <input key={t.key} id={`m-${name}`} name={name} inputMode="numeric" autoComplete="off" defaultValue={t.value} placeholder="98480 12345" aria-invalid={t.error ? true : undefined}
          onChange={(e) => onValue?.(e.target.value)}
          className={cx(inputCls(t.error), "h-11 pl-12 tnum")} />
      </div>
    </FieldShell>
  );
}

export function AddAdminSheet({ closeHref, schoolId, schoolName, needsCheck, action }: { closeHref: string; schoolId: string; schoolName: string; needsCheck: boolean; action: Action }) {
  const [role, setRole] = useState("school-admin");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  return (
    <SheetForm title="Add another School Admin" sub={`${schoolName} · they set their own password from the invite`} closeHref={closeHref} action={action} submitLabel="Send invite" pendingText="Sending…" hidden={{ schoolId, roleKey: role }}>
      <SText name="name" label="Full name" required placeholder="Kavitha Nair" autoComplete="off" onChange={(e) => setName(e.target.value)} />
      <MobileField name="mobile" label="Mobile number" help="Becomes their username." onValue={setMobile} />
      <SText name="email" label="Email" type="email" help="Needed only to also send the invite by email." placeholder="name@school.in" />
      <FieldShell label="Role in the school" id="role" required help="Both can create the school’s other logins.">
        <Segmented label="Role in the school" value={role} onChange={setRole} className="w-full" options={[{ value: "school-admin", label: "School Admin" }, { value: "principal", label: "Principal / Owner" }]} />
      </FieldShell>
      <ChannelChips />
      {needsCheck && <SSelect name="checked" label="How you checked the request" required options={CHECKS} placeholder="Choose one" help="Needed when a school asks for a new admin, for example after the old one left." />}
      {name.trim() && mask(mobile) && <p className="rounded-xl bg-sunken p-3 text-[14px]">Send to <b className="font-semibold">{name.trim()}</b>, +91 {mask(mobile)}?</p>}
    </SheetForm>
  );
}

export function ResetSheet({ closeHref, schoolId, schoolName, userLoginId, adminName, phoneMasked, hasEmail, action }: { closeHref: string; schoolId: string; schoolName: string; userLoginId: string; adminName: string; phoneMasked: string; hasEmail: boolean; action: Action }) {
  return (
    <SheetForm title={`Reset ${adminName}’s login?`} sub={schoolName} closeHref={closeHref} action={action} submitLabel="Send reset link" pendingText="Sending…" hidden={{ schoolId, userLoginId }}>
      <div className="text-[14px] text-ink2 leading-relaxed flex flex-col gap-2">
        <p>A reset link goes to their mobile, +91 {phoneMasked}. Their old password stops working at once, and they are signed out everywhere.</p>
        <p>They set a new password themselves. DREAM TEAM never sees it.</p>
      </div>
      <ChannelChips label="Send the link by" start={hasEmail ? ["whatsapp", "email"] : ["whatsapp"]} />
      <SArea name="reason" label="Reason" required rows={2} placeholder="Forgot the password; called from the school phone on record." />
    </SheetForm>
  );
}

export function ChangeMobileSheet({ closeHref, schoolId, schoolName, userLoginId, adminName, phoneMasked, action }: { closeHref: string; schoolId: string; schoolName: string; userLoginId: string; adminName: string; phoneMasked: string; action: Action }) {
  return (
    <SheetForm title={`Change ${adminName}’s mobile number`} sub={`${schoolName} · now +91 ${phoneMasked}`} closeHref={closeHref} action={action} submitLabel="Change number" pendingText="Saving…" hidden={{ schoolId, userLoginId }}>
      <MobileField name="mobile" label="New mobile number" help="Their username changes with it. They confirm two-step again at the next sign-in." />
      <SSelect name="checked" label="How you checked" required options={CHECKS} placeholder="Choose one" />
      <SArea name="reason" label="Reason" required rows={2} placeholder="Lost her phone; new SIM from 7 Oct." />
    </SheetForm>
  );
}

export function GroupSheet({ closeHref, schoolId, current, groups, action }: { closeHref: string; schoolId: string; current: string | null; groups: Option[]; action: Action }) {
  const [g, setG] = useState(current ?? "none");
  return (
    <SheetForm title="Set the school’s Group" sub="Used for group discounts and for School Access across the group" closeHref={closeHref} action={action} submitLabel="Save Group" pendingText="Saving…" hidden={{ schoolId }}>
      <SSelect name="group" label="Group" start={current ?? "none"} options={[{ value: "none", label: "None" }, ...groups, { value: "new", label: "Make a new group…" }]} onChange={(e) => setG(e.target.value)} />
      {g === "new" && <SText name="newGroupName" label="New group name" required placeholder="Green Valley Group" />}
      <p className="text-[13px] text-ink3">10% off for 3 to 4 schools in a group, 15% for 5 or more. People with logins in several schools of a group pick the school with the School switcher.</p>
    </SheetForm>
  );
}

export type DetailsStart = { name: string; address: string | null; city: string | null; state: string | null; board: string | null; schoolType: string | null; phone: string | null; email: string | null; approxStudents: number | null };

export function EditSchoolSheet({ closeHref, schoolId, s, states, boards, types, action }: { closeHref: string; schoolId: string; s: DetailsStart; states: Option[]; boards: Option[]; types: Option[]; action: Action }) {
  return (
    <SheetForm title="Edit school details" sub="Editable until the School Admin first signs in" wide closeHref={closeHref} action={action} submitLabel="Save details" pendingText="Saving…" hidden={{ schoolId }}>
      <div className="grid md:grid-cols-2 gap-4">
        <SText name="name" label="School name" required start={s.name} className="md:col-span-2" />
        <SText name="address" label="Address" start={s.address} className="md:col-span-2" />
        <SText name="city" label="City" required start={s.city} />
        <SSelect name="state" label="State" required start={s.state} options={states} />
        <SSelect name="board" label="Board" required start={s.board} options={boards} />
        <SSelect name="schoolType" label="School type" required start={s.schoolType} options={types} />
        <SText name="phone" label="School phone" required start={s.phone} inputMode="tel" className="tnum" />
        <SText name="email" label="School email" type="email" start={s.email} />
        <SText name="approxStudents" label="About how many students" start={s.approxStudents} inputMode="numeric" />
      </div>
    </SheetForm>
  );
}
