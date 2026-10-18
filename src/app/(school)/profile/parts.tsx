"use client";

// The parts of My profile that change something (approved design, dashboards.jsx MyProfile).

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as I from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Pill } from "@/components/ui/badge";
import { Checkbox, Switch } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { Toast } from "@/components/ui/toast";
import { cx } from "@/components/ui/cx";
import { NOTE_CHANNELS, NOTE_CHANNEL_LABEL, type NoteChannel, type NoteKind, type NotePrefs } from "@/lib/notification-kinds";
import { PasswordForm } from "./password-form";
import { confirmContactCode, saveMyName, saveNotePrefs, sendContactCode, setTwoStep, type CodeResult, type Result } from "./actions";

type Say = { n: number; message: string; tone?: "success" | "info" | "danger" } | null;
function useSay() {
  const [toast, setToast] = useState<Say>(null);
  const say = (message: string, tone?: "success" | "info" | "danger") => setToast((t) => ({ n: (t?.n ?? 0) + 1, message, tone }));
  const node = toast ? <Toast key={toast.n} flash={{ message: toast.message, tone: toast.tone }} /> : null;
  return [say, node] as const;
}

function Msg({ state }: { state: { ok: boolean; message: string } | null }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={cx("rounded-xl px-3.5 py-2.5 text-sm", state.ok ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad")}>{state.message}</p>
  );
}

/** Edit my details: name at once; a new mobile number or email only after the code sent to it. */
export function EditDetails({ name, phone, email }: { name: string; phone: string | null; email: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" icon={I.Pencil} onClick={() => setOpen(true)}>Edit details</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit my details" sub="Your name changes at once. A new mobile number or email needs a one-time code sent to it.">
        <div className="flex flex-col gap-5">
          <NameForm name={name} />
          <ContactForm kind="phone" current={phone} />
          <ContactForm kind="email" current={email} />
        </div>
      </Dialog>
    </>
  );
}

function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState<Result, FormData>(saveMyName, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FieldShell label="Full name" id="me-name" required>
        <div className="flex gap-2">
          <input id="me-name" name="name" defaultValue={name} required minLength={2} maxLength={80} autoComplete="name" className={cx(inputCls(), "h-11 flex-1")} />
          <Button type="submit" variant="secondary" loading={pending}>Save</Button>
        </div>
      </FieldShell>
      <Msg state={state} />
    </form>
  );
}

function ContactForm({ kind, current }: { kind: "phone" | "email"; current: string | null }) {
  const [state, action, pending] = useActionState<CodeResult, FormData>(async (prev, fd) => (fd.get("code") !== null ? confirmContactCode(prev, fd) : sendContactCode(prev, fd)), null);
  const [value, setValue] = useState("");
  const step = state?.step ?? "type";
  const label = kind === "phone" ? "Mobile number" : "Email";
  const id = `me-${kind}`;
  if (step === "done") return <Msg state={state} />;
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl bg-sunken/70 p-3.5">
      <input type="hidden" name="kind" value={kind} />
      <FieldShell label={`New ${label.toLowerCase()}`} id={id}
        help={`Now: ${current ?? "not given"}.${kind === "phone" ? " You can sign in with your mobile number." : ""}`}>
        <div className="flex gap-2">
          {kind === "phone" && <span className="h-11 px-3 rounded-xl bg-surface border border-line grid place-items-center text-[15px] text-ink2 shrink-0">+91</span>}
          <input id={id} name="value" value={step === "code" ? state?.value ?? value : value} onChange={(e) => setValue(e.target.value)} readOnly={step === "code"}
            type={kind === "email" ? "email" : "tel"} inputMode={kind === "email" ? "email" : "tel"} autoComplete={kind === "email" ? "email" : "tel-national"}
            className={cx(inputCls(state && !state.ok && step === "type"), "h-11 flex-1 min-w-0")} />
        </div>
      </FieldShell>
      {step === "code" && (
        <FieldShell label="Code" id={`${id}-code`}>
          <input id={`${id}-code`} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus
            className={cx(inputCls(state && !state.ok), "h-11 tnum tracking-[0.3em] text-lg max-w-[12rem]")} />
        </FieldShell>
      )}
      <Msg state={state} />
      <div className="flex gap-2">
        <Button type="submit" variant={step === "code" ? "primary" : "soft"} loading={pending} disabled={step === "type" && !value.trim()}>
          {step === "code" ? `Confirm new ${label.toLowerCase()}` : "Send code"}
        </Button>
      </div>
    </form>
  );
}

export function PasswordButton({ withoutOld = false }: { withoutOld?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{withoutOld ? "Set a new password" : "Change password"}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={withoutOld ? "Set a new password" : "Change password"} sub="Your other devices will be signed out.">
        <PasswordForm withoutOld={withoutOld} />
      </Dialog>
    </>
  );
}

/** `cannotReach`: the role needs two-step login but no code can reach this person yet, and what to do. */
export function TwoStepRow({ required, on, sendsTo, cannotReach = null }: { required: boolean; on: boolean; sendsTo: string | null; cannotReach?: string | null }) {
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  const [say, toast] = useSay();
  const router = useRouter();
  const sub = cannotReach
    ? `Required for your role, but no code can reach you yet, so you sign in with your password only. ${cannotReach}`
    : required
    ? `A code goes to ${sendsTo ?? "your phone or email"} after your password. Required for your role.`
    : value ? `A code goes to ${sendsTo ?? "your phone or email"} after your password.` : "A code to your phone or email after your password. Safer if someone learns your password.";
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <div className="min-w-0 flex-1 text-[14px]"><b className="font-semibold block">Two-step login</b><span className={cx("block text-[12.5px]", cannotReach ? "text-warn" : "text-ink3")}>{sub}</span></div>
      {cannotReach ? <Pill tone="warn"><I.TriangleAlert size={12} aria-hidden="true" />Not set up</Pill> : required ? <Pill tone="ok"><I.Lock size={12} aria-hidden="true" />On</Pill> : (
        <Switch on={value} label="Two-step login" disabled={pending} onChange={(v) => {
          setValue(v);
          start(async () => {
            const r = await setTwoStep(v);
            if (r && !r.ok) setValue(!v);
            if (r) say(r.message, r.ok ? "success" : "danger");
            router.refresh();
          });
        }} />
      )}
      {toast}
    </div>
  );
}

/** Per kind of notification, the channels it reaches the person on, where the school allows them. */
export function NotePrefsTable({ kinds, prefs, allowed, phone }: { kinds: NoteKind[]; prefs: NotePrefs; allowed: NoteChannel[]; phone: string | null }) {
  const [value, setValue] = useState(prefs);
  const [, start] = useTransition();
  const [say, toast] = useSay();
  const flip = (k: NoteKind, c: NoteChannel, on: boolean) => {
    if (k.locked && c === "app") { say("This one always shows in the app", "info"); return; }
    if (!allowed.includes(c)) { say(`${NOTE_CHANNEL_LABEL[c]} is not switched on by your school`, "info"); return; }
    const next = { ...value, [k.key]: on ? [...new Set([...(value[k.key] ?? []), c])] : (value[k.key] ?? []).filter((x) => x !== c) };
    setValue(next);
    start(async () => {
      const r = await saveNotePrefs(next);
      if (r && !r.ok) { setValue(value); say(r.message, "danger"); }
    });
  };
  const off = NOTE_CHANNELS.filter((c) => !allowed.includes(c)).map((c) => NOTE_CHANNEL_LABEL[c]);
  return (
    <>
      <div className="overflow-x-auto scroll-thin border-t border-line">
        <table className="text-[13.5px] min-w-full">
          <thead>
            <tr className="border-b border-line text-ink3 text-[12px]">
              <th scope="col" className="sticky left-0 z-10 bg-surface text-left font-semibold px-5 py-2.5 min-w-[190px]">Kind</th>
              {NOTE_CHANNELS.map((c) => <th key={c} scope="col" className={cx("font-semibold px-3 py-2.5 text-center", !allowed.includes(c) && "opacity-50")}>{NOTE_CHANNEL_LABEL[c]}</th>)}
            </tr>
          </thead>
          <tbody>
            {kinds.map((k) => (
              <tr key={k.key} className="border-b border-line/60 last:border-0">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-5 py-2.5 font-medium text-left">{k.label}{k.locked && <span className="block text-[11.5px] text-ink3 font-normal">Always in the app</span>}</th>
                {NOTE_CHANNELS.map((c) => (
                  <td key={c} className={cx("px-3 py-2.5 text-center", !allowed.includes(c) && "opacity-40")}>
                    <span className="inline-flex"><Checkbox checked={(value[k.key] ?? []).includes(c)} label={`${k.label} by ${NOTE_CHANNEL_LABEL[c]}`} onChange={(on) => flip(k, c, on)} /></span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line/70">
        {phone ? `WhatsApp and SMS go to ${phone}. ` : "Add your mobile number to get WhatsApp and SMS. "}
        {off.length ? `${off.join(", ")} ${off.length === 1 ? "is" : "are"} not switched on by your school yet.` : "The school decides which channels are allowed."}
      </p>
      {toast}
    </>
  );
}

