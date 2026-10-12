"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ErrorSummary, SelectField, TextField } from "@/components/ui/field";
import { Alert, FormMessage } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { checkIndianMobile } from "@/lib/format";
import { inviteAction } from "../actions";
import { AccessFields, type CampusOption, type RoleOption } from "../access-fields";

type StaffOption = { id: string; name: string; phone: string; email: string | null; designation: string };

function usernameFrom(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 30);
}

export function CopyLink({ path, label = "Invite link" }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const full = `${typeof window === "undefined" ? "" : window.location.origin}${path}`;
  return (
    <div className="space-y-1">
      <label htmlFor="invite-link" className="block text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <input id="invite-link" readOnly value={full} onFocus={(e) => e.target.select()} className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface-2 px-3 font-mono text-sm" />
        <Button onClick={async () => { await navigator.clipboard.writeText(full); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</Button>
      </div>
    </div>
  );
}

export function InviteForm({ roles, campuses, staff, defaultRoleId, defaultStaffId = "" }: { roles: RoleOption[]; campuses: CampusOption[]; staff: StaffOption[]; defaultRoleId: string; defaultStaffId?: string }) {
  const [state, action] = useActionState(inviteAction, null);
  const v = (k: string, d = "") => state?.values?.[k] ?? d;
  const pre = staff.find((x) => x.id === defaultStaffId);
  const [name, setName] = useState(pre?.name ?? "");
  const [phone, setPhone] = useState(pre?.phone ?? "");
  const [email, setEmail] = useState(pre?.email ?? "");
  const [username, setUsername] = useState(pre ? usernameFrom(pre.name) : "");
  const [touchedUser, setTouchedUser] = useState(false);
  const [staffId, setStaffId] = useState(defaultStaffId);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  if (state?.ok && state.data) {
    return (
      <div className="max-w-2xl space-y-4">
        <Alert tone="success" title={`${state.data.name} is invited`}>
          {state.data.sentBy.length
            ? <>The invite link was sent to {state.data.name} by {state.data.sentBy.join(" and ")}. You can also copy it below and give it to them yourself. </>
            : <>Send this link to {state.data.name} by WhatsApp, SMS or email. </>}
          They open it to choose their own password; nobody else ever sees it. The link works once, for 7 days.
          {state.data.sentNote && <span className="mt-1 block">{state.data.sentNote}</span>}
        </Alert>
        <CopyLink path={state.data.link} />
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/settings/users/${state.data.userId}`} variant="primary">Open {state.data.name}</ButtonLink>
          <Button variant="secondary" onClick={() => window.location.reload()}>Invite another person</Button>
          <ButtonLink href="/settings/users">Back to Users</ButtonLink>
        </div>
      </div>
    );
  }

  const pickStaff = (id: string) => {
    setStaffId(id);
    const s = staff.find((x) => x.id === id);
    if (!s) return;
    setName(s.name);
    setPhone(s.phone);
    setEmail(s.email ?? "");
    if (!touchedUser) setUsername(usernameFrom(s.name));
  };

  return (
    <form action={action} className="max-w-3xl space-y-6" noValidate>
      <FormMessage state={state} />
      <ErrorSummary errors={state?.errors} />
      {staff.length > 0 && (
        <SelectField label="Belongs to a staff member" name="staffId" value={staffId} onChange={(e) => pickStaff(e.target.value)}
          options={staff.map((s) => ({ value: s.id, label: `${s.name}, ${s.designation}` }))} placeholder="Not linked (for example an admin from the trust)"
          help="Pick the Staff record this login belongs to; their name and phone are filled in." error={state?.errors?.staffId} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Full name" name="displayName" required value={name} error={state?.errors?.displayName}
          onChange={(e) => { setName(e.target.value); if (!touchedUser) setUsername(usernameFrom(e.target.value)); }} autoComplete="off" />
        <TextField label="Username" name="username" required value={username} error={state?.errors?.username}
          onChange={(e) => { setTouchedUser(true); setUsername(e.target.value.toLowerCase().replace(/\s+/g, ".")); }}
          help="Made from the name. Small letters, numbers and dots." autoCapitalize="none" autoComplete="off" />
        <TextField label="Phone" name="phone" required type="tel" inputMode="tel" value={phone} placeholder="+91" error={phoneError ?? state?.errors?.phone}
          onChange={(e) => { setPhone(e.target.value); if (phoneError) setPhoneError(null); }}
          onBlur={(e) => setPhoneError(e.target.value.trim() ? checkIndianMobile(e.target.value) : "Phone is needed.")} />
        <TextField label="Email" name="email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={state?.errors?.email} help="Needed only to send the invite by email." />
      </div>
      <AccessFields roles={roles} campuses={campuses} roleIds={v("roleIds") ? v("roleIds").split(",") : [defaultRoleId].filter(Boolean)} scope={v("scope", "WHOLE_SCHOOL")} campusId={v("campusId")} errors={state?.errors} />
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <SubmitButton pendingText="Inviting…">Send invite</SubmitButton>
        <Link href="/settings/users" className="min-h-11 rounded-lg px-3 py-2.5 font-medium text-ink-2 hover:bg-surface-2">Cancel</Link>
      </div>
    </form>
  );
}
