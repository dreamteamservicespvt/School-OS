"use client";

// The forms on one person's page in Users & Permissions.
import { useActionState, useRef, useState } from "react";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { Alert, FormMessage } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";
import { checkIndianMobile } from "@/lib/format";
import { accessAction, detailsAction, disableAction, enableAction, exceptionsAction, linkAction, resendInviteAction, twoStepAction, type LinkState } from "../actions";
import { AccessFields, type CampusOption, type RoleOption } from "../access-fields";
import { CopyLink } from "../new/invite-form";

export function DetailsForm({ userId, name, phone, email, locked }: { userId: string; name: string; phone: string; email: string; locked: string | null }) {
  const [state, action] = useActionState(detailsAction, null);
  const v = (k: string, d: string) => state?.values?.[k] ?? d;
  const [phoneError, setPhoneError] = useState<string | null>(null);
  if (locked) return <p className="text-sm text-ink-2">{locked}</p>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="userId" value={userId} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Full name" name="displayName" required defaultValue={v("displayName", name)} error={state?.errors?.displayName} />
        <TextField label="Phone" name="phone" type="tel" inputMode="tel" defaultValue={v("phone", phone)} error={phoneError ?? state?.errors?.phone}
          onBlur={(e) => setPhoneError(e.target.value.trim() ? checkIndianMobile(e.target.value) : null)} onChange={() => phoneError && setPhoneError(null)} />
        <TextField label="Email" name="email" type="email" inputMode="email" defaultValue={v("email", email)} error={state?.errors?.email} />
      </div>
      <SubmitButton variant="secondary" pendingText="Saving…">Save details</SubmitButton>
    </form>
  );
}

export function LinkForm({ userId, current, options }: { userId: string; current: string; options: { value: string; label: string }[] }) {
  const [state, action] = useActionState(linkAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <FormMessage state={state} />
      <SelectField label="This login belongs to" name="record" defaultValue={current} options={options} placeholder="Not linked to a record"
        help="Linking shows their classes, timetable and leave to them, and their login on their Staff Profile. One record only." />
      <SubmitButton variant="secondary" pendingText="Saving…">Save link</SubmitButton>
    </form>
  );
}

export function AccessForm({ userId, name, roles, campuses, roleIds, scope, campusId, isSelf }: {
  userId: string; name: string; roles: RoleOption[]; campuses: CampusOption[]; roleIds: string[]; scope: string; campusId: string; isSelf: boolean;
}) {
  const [state, action] = useActionState(accessAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [asking, setAsking] = useState(false);
  const [noRole, setNoRole] = useState(false);
  const chosen = state?.values?.roleIds ? state.values.roleIds.split(",") : roleIds;
  const ask = () => {
    const fd = new FormData(formRef.current!);
    if (fd.getAll("roleIds").length === 0) { setNoRole(true); return; }
    setNoRole(false);
    setAsking(true);
  };
  return (
    <>
      <form ref={formRef} action={action} className="space-y-4" noValidate>
        <input type="hidden" name="userId" value={userId} />
        <FormMessage state={state} />
        {noRole && <Alert tone="danger">Choose at least one role. To stop {name} using School OS, disable them instead.</Alert>}
        <AccessFields key={chosen.join()} roles={roles} campuses={campuses} roleIds={chosen} scope={state?.values?.scope ?? scope} campusId={state?.values?.campusId ?? campusId} errors={state?.errors} />
        <Button onClick={ask}>Save roles and scope</Button>
      </form>
      <Dialog open={asking} onClose={() => setAsking(false)} title={`Change ${name}'s roles?`}>
        <p className="text-ink-2">
          {isSelf
            ? "Your own access changes straight away."
            : `If the roles change, ${name} is signed out on every device and gets the new access when they sign in again.`}{" "}
          Every School Admin {isSelf ? "" : `and ${name} `}will be told.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setAsking(false)}>Cancel</Button>
          <Button onClick={() => { setAsking(false); formRef.current?.requestSubmit(); }}>Save and apply</Button>
        </div>
      </Dialog>
    </>
  );
}

export type ExceptionRow = { key: string; name: string; fromRoles: string; exception: string };

const LEVEL_OPTIONS = [
  { value: "full", label: "Full" },
  { value: "view", label: "View" },
  { value: "own", label: "Own" },
  { value: "none", label: "None" },
];

export function ExceptionsForm({ userId, rows }: { userId: string; rows: ExceptionRow[] }) {
  const [state, action] = useActionState(exceptionsAction, null);
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.key, r.exception])));
  const count = Object.values(values).filter(Boolean).length;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <FormMessage state={state} />
      <p className="text-sm text-ink-2">Use an exception when one person needs more or less than their roles give, for example one teacher who also collects fees. {count ? `${count} exception${count === 1 ? "" : "s"} set.` : "None set."}</p>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[30rem] text-sm">
          <caption className="sr-only">Exceptions by module</caption>
          <thead className="bg-surface-2 text-left text-ink-2">
            <tr><th scope="col" className="px-3 py-2 font-medium">Module</th><th scope="col" className="px-3 py-2 font-medium">From their roles</th><th scope="col" className="px-3 py-2 font-medium">Exception</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`border-t border-line ${values[r.key] ? "bg-brand-soft" : ""}`}>
                <th scope="row" className="px-3 py-1.5 text-left font-medium">{r.name}</th>
                <td className="px-3 py-1.5 text-ink-2">{r.fromRoles}</td>
                <td className="px-3 py-1.5">
                  <select name={`ex_${r.key}`} value={values[r.key]} aria-label={`Exception for ${r.name}`} onChange={(e) => setValues({ ...values, [r.key]: e.target.value })}
                    className="h-11 w-full min-w-32 rounded-lg border border-line-strong bg-surface px-2">
                    <option value="">As their roles</option>
                    {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="secondary" pendingText="Saving…">Save exceptions</SubmitButton>
        {count > 0 && <Button variant="ghost" onClick={() => setValues(Object.fromEntries(rows.map((r) => [r.key, ""])))}>Clear all exceptions</Button>}
      </div>
    </form>
  );
}

export function DisableButton({ userId, name, devices }: { userId: string; name: string; devices: number }) {
  return (
    <ConfirmButton trigger="Disable" triggerVariant="danger" title={`Disable ${name}?`} confirmLabel={`Disable ${name}`} confirmVariant="danger" onConfirm={() => disableAction(userId)}>
      {name} cannot open this school any more and is signed out {devices > 0 ? `on ${devices} device${devices === 1 ? "" : "s"} ` : ""}straight away. Their records and history stay. You can enable them again later with the same roles.
    </ConfirmButton>
  );
}

export function EnableButton({ userId, name }: { userId: string; name: string }) {
  return (
    <ConfirmButton trigger="Enable" triggerVariant="primary" title={`Enable ${name}?`} confirmLabel={`Enable ${name}`} onConfirm={() => enableAction(userId)}>
      {name} gets back the roles and scope they had before, and can sign in again.
    </ConfirmButton>
  );
}

export function ResendInvite({ userId, name }: { userId: string; name: string }) {
  const [state, setState] = useState<LinkState>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      {state && !state.ok && <Alert tone="danger">{state.message}</Alert>}
      {state?.ok && state.link ? (
        <>
          <Alert tone="success">{state.message}</Alert>
          <CopyLink path={state.link} label={`New invite link for ${name}`} />
        </>
      ) : (
        <Button variant="secondary" loading={busy} loadingText="Making a new link…" onClick={async () => {
          setBusy(true);
          try { setState(await resendInviteAction(userId)); } catch { setState({ ok: false, message: "That did not work. Please try again." }); }
          setBusy(false);
        }}>Make a new invite link</Button>
      )}
    </div>
  );
}

const REASONS = [
  { value: "lost-phone", label: "Lost phone" },
  { value: "new-phone", label: "New phone" },
  { value: "number-changed", label: "Number changed" },
  { value: "other", label: "Other" },
];

export function TwoStepReset({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(twoStepAction, null);
  const [check, setCheck] = useState("");
  const done = state?.ok;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Reset two-step login</Button>
      <Dialog open={open && !done} onClose={() => setOpen(false)} title={`Reset ${name}'s two-step login`}>
        <form action={action} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <FormMessage state={state} />
          <p className="text-sm text-ink-2">Only do this after you have confirmed it is really {name}, in person or by a call to the number in their record. They set up two-step login again at their next sign-in.</p>
          <SelectField label="Reason" name="reason" required options={REASONS} placeholder="Choose the reason" defaultValue={state?.values?.reason ?? ""} error={state?.errors?.reason} />
          <TextArea label="How did you confirm it is them?" name="checkDone" required value={check} onChange={(e) => setCheck(e.target.value)} rows={2}
            placeholder="For example: in person at the office, with their staff ID card" error={state?.errors?.checkDone} help="At least 5 characters. Saved in the audit log." />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton pendingText="Resetting…">Reset two-step login</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
