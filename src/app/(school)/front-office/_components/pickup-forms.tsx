"use client";

// Student Pickup at the desk (16 §2, mod-frontoffice.jsx Release): choose the
// person collecting from the approved list (red ones cannot be chosen), match
// the photo, the code to the guardian's phone when the school uses it, the
// reason and the time; then the Pickup gate pass is made on the server.

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CircleCheck, DoorOpen, Hand, PhoneCall, ScanLine, Send, TriangleAlert, UserX } from "lucide-react";
import type { FormState } from "@/lib/forms";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClass } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { SheetForm } from "@/components/ui/url-sheet";
import { SText } from "@/components/ui/sheet-fields";
import { cx } from "@/components/ui/cx";
import { PICKUP_REASONS } from "@/lib/front-office/words";
import { refusedAction, releaseAction, sendCodeAction } from "../actions";
import { useCanScanQr } from "./fields";

/**
 * "Scan ID card": reads the QR on the student's ID card (school code and
 * admission number) with the camera, where the browser can, and finds the
 * student. Hidden where the browser cannot read QR codes.
 */
export function ScanIdButton({ base }: { base: string }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const can = useCanScanQr();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = new Ctor({ formats: ["qr_code", "code_128"] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        while (!stopped) {
          const hits = await detector.detect(video.current).catch(() => []);
          const raw = hits[0]?.rawValue;
          if (raw) {
            const adm = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : raw;
            setOpen(false);
            router.replace(`${base}?q=${encodeURIComponent(adm.trim())}`, { scroll: false });
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setProblem("The camera could not be opened. Type the name or admission number instead.");
        setOpen(false);
      }
    })();
    return () => { stopped = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [open, base, router]);
  if (!can) return null;
  return (
    <>
      <Button type="button" variant="secondary" size="lg" icon={ScanLine} onClick={() => { setProblem(null); setOpen((x) => !x); }} aria-pressed={open}><span className="hidden sm:inline">{open ? "Stop scanning" : "Scan ID card"}</span></Button>
      {open && (
        <div className="fixed inset-x-4 bottom-4 z-50 sm:inset-x-auto sm:right-6 sm:w-80 rounded-2xl overflow-hidden bg-ink shadow-pop">
          <video ref={video} muted playsInline className="w-full h-48 object-cover" />
          <p className="text-[12.5px] text-bg px-3 py-2">Hold the QR on the ID card in front of the camera.</p>
        </div>
      )}
      {problem && <p className="sr-only" role="alert">{problem}</p>}
    </>
  );
}

/** "Someone not on this list is here" (mod-frontoffice.jsx StopSheet): do not release; call a guardian; tell the class teacher. */
export function StopSheet({ closeHref, student, classTeacher, calls, deskPhone }: {
  closeHref: string;
  student: { id: string; first: string };
  classTeacher: string | null;
  calls: { name: string; relationship: string; tel: string }[];
  deskPhone: string | null;
}) {
  return (
    <SheetForm title={`Do not release ${student.first}`} sub={`Not on ${student.first}’s pickup list. Call a registered guardian, and tell the class teacher.`} closeHref={closeHref}
      action={refusedAction} hidden={{ studentId: student.id }} submitLabel={classTeacher ? `Tell class teacher ${classTeacher}` : "Keep it with the student’s record"} pendingText="Telling…" submitVariant="danger">
      <div className="flex justify-center pt-1"><span className="w-16 h-16 rounded-full bg-bad text-white grid place-items-center shadow-pop" aria-hidden="true"><Hand size={30} /></span></div>
      <SText name="who" label="Who is here?" help="Kept with the student’s record" placeholder="Name and relation, like Suresh, neighbour" maxLength={120} />
      {calls.map((c) => (
        <a key={c.tel + c.name} href={`tel:${c.tel}`} className={cx(buttonClass("secondary"), "w-full !justify-start")}><PhoneCall size={17} aria-hidden="true" />Call {c.name} ({c.relationship.toLowerCase()})</a>
      ))}
      {!calls.length && deskPhone && <a href={`tel:${deskPhone}`} className={cx(buttonClass("primary"), "w-full")}><PhoneCall size={17} aria-hidden="true" />Call the front desk</a>}
      <p className="text-[12.5px] text-ink3 text-center">Adding a person to the list is done in Student Management by someone allowed, never at the desk or gate.</p>
    </SheetForm>
  );
}

export type PickupChoice = { guardianId: string; name: string; relationship: string; phone: string | null; photo: string | null; restriction: string | null; allowed: boolean };

type S = FormState<unknown>;

/** The approved list on its own (View, Office Staff and Gate Security). */
export function PickupList({ people, canChoose, chosen, onChoose }: { people: PickupChoice[]; canChoose: boolean; chosen?: string | null; onChoose?: (id: string) => void }) {
  return (
    <div className="grid sm:grid-cols-2 gap-2" role={canChoose ? "radiogroup" : undefined} aria-label={canChoose ? "Who is collecting?" : "Approved pickup list"}>
      {people.map((x) => {
        const on = chosen === x.guardianId;
        const clickable = canChoose && x.allowed;
        const inner = (
          <>
            <span className="relative shrink-0">
              <Avatar name={x.name} size={48} src={x.photo} />
              {!x.allowed && <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-bad text-white grid place-items-center ring-2 ring-surface"><Ban size={13} aria-hidden="true" /></span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cx("block font-semibold text-[14.5px] truncate", !x.allowed && "text-bad")}>{x.name}</span>
              <span className="block text-[12.5px] text-ink3">{x.relationship}{x.phone ? <> · <span className="tnum">{x.phone}</span></> : null}</span>
              {!x.allowed && <span className="block text-[12px] text-bad font-semibold mt-0.5">Not allowed to collect</span>}
            </span>
            {on && <CircleCheck size={20} className="text-brand shrink-0" aria-hidden="true" />}
          </>
        );
        const cls = cx("text-left rounded-2xl border p-3 flex items-center gap-3 transition", !x.allowed ? "border-bad/40 bg-bad/[.06]" : on ? "border-brand ring-1 ring-brand bg-brand/[.05]" : "border-line", clickable && !on && "hover:border-ink3/50");
        return clickable
          ? <button key={x.guardianId} type="button" role="radio" aria-checked={on} onClick={() => onChoose?.(x.guardianId)} className={cls}>{inner}</button>
          : <div key={x.guardianId} className={cls}>{inner}</div>;
      })}
    </div>
  );
}

export function ReleaseForm({ student, people, codeCheck, releasedBy, nowHHMM, stopHref }: {
  student: { id: string; first: string };
  people: PickupChoice[];
  codeCheck: boolean;
  releasedBy: string;
  nowHHMM: string;
  stopHref: string;
}) {
  const [state, run, pending] = useActionState<S, FormData>(releaseAction, null);
  const [codeState, sendCode, sending] = useActionState<S, FormData>(sendCodeAction, null);
  const [who, setWho] = useState<string | null>(state?.values?.guardianId ?? null);
  const [photo, setPhoto] = useState(false);
  const [code, setCode] = useState("");
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [reason, setReason] = useState(state?.values?.reason ?? "");
  const [other, setOther] = useState(state?.values?.otherReason ?? "");
  const g = people.find((p) => p.guardianId === who) ?? null;
  const restricted = people.find((p) => !p.allowed && p.restriction);
  const why = reason === "Other" ? other.trim() : reason;
  const codeSent = codeState?.ok && codeFor === who;
  const ready = Boolean(g && photo && (!codeCheck || code.length === 4) && why);
  const err = state && !state.ok ? state.errors ?? {} : {};
  const choose = (id: string) => { setWho(id); setPhoto(false); setCode(""); };

  return (
    <form action={run} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="studentId" value={student.id} />
      <input type="hidden" name="guardianId" value={who ?? ""} />
      <input type="hidden" name="reason" value={reason} />
      <input type="hidden" name="photoMatch" value={photo ? "on" : ""} />
      <div>
        <p className="text-[13px] font-semibold text-ink2 mb-2">Who is collecting? <span className="font-normal text-ink3">· from Student Management, Parents & Guardians</span></p>
        {people.length ? <PickupList people={people} canChoose chosen={who} onChoose={choose} />
          : <p className="text-[13.5px] text-ink3 rounded-xl bg-sunken/70 px-3.5 py-3">Nobody is on {student.first}’s pickup list yet. It is set in Student Management, Parents & Guardians.</p>}
        {restricted && <p className="mt-2 text-[13px] text-bad flex gap-1.5"><TriangleAlert size={15} className="shrink-0 mt-0.5" aria-hidden="true" />{restricted.restriction}</p>}
        {err.guardianId && <p className="mt-2 text-[12.5px] text-bad" role="alert">{err.guardianId}</p>}
        <Link href={stopHref} scroll={false} className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-bad hover:underline"><UserX size={16} aria-hidden="true" />Someone not on this list is here</Link>
      </div>

      {g ? (
        <div className="flex flex-col gap-4 border-t border-line pt-4 animate-rise">
          <div>
            <p className="text-[13px] font-semibold text-ink2 mb-2">Verify {g.name.split(" ")[0]} <span className="text-bad" aria-hidden="true">*</span></p>
            <div className={cx("rounded-xl border p-3 flex items-center gap-3", err.photoMatch ? "border-bad" : "border-line")}>
              <Avatar name={g.name} size={56} src={g.photo} />
              <label className="flex-1 flex items-center gap-3 cursor-pointer">
                <Checkbox checked={photo} onChange={setPhoto} label="Photo matches" />
                <span className="text-[14px]"><b className="font-semibold block">The face matches this photo</b><span className="text-[12.5px] text-ink3">Look at the person, not only the ID</span></span>
              </label>
            </div>
            {err.photoMatch && <p className="mt-1 text-[12.5px] text-bad" role="alert">{err.photoMatch}</p>}
            {codeCheck && (
              <div className="rounded-xl border border-line p-3 mt-2 flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="text-[14px] flex-1"><b className="font-semibold block">Code to the guardian’s phone</b><span className="text-[12.5px] text-ink3">Switched on by the school. Sent to the number on {g.name.split(" ")[0]}’s record.</span></span>
                {!codeSent ? (
                  <div className="flex flex-col items-start gap-1">
                    <Button type="submit" formAction={sendCode} formNoValidate variant="secondary" icon={Send} loading={sending} onClick={() => setCodeFor(who)}>Send code</Button>
                    {codeState && !codeState.ok && <span className="text-[12px] text-bad max-w-[260px]" role="alert">{codeState.message}</span>}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input name="code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" placeholder="4 digits"
                      className={cx(inputCls(err.code), "h-11 !w-28 tnum text-center tracking-[.3em] font-semibold")} aria-label="Code from the guardian" aria-invalid={err.code ? true : undefined} />
                    {code.length === 4 && <CircleCheck size={20} className="text-ok" aria-hidden="true" />}
                  </div>
                )}
              </div>
            )}
            {err.code && <p className="mt-1 text-[12.5px] text-bad" role="alert">{err.code}</p>}
          </div>
          <FieldShell label="Reason" id="rl-reason" required error={err.reason || err.otherReason}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Reason">
              {PICKUP_REASONS.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)}
                  className={cx("h-9 px-3.5 rounded-xl text-[13.5px] font-semibold border transition", reason === r ? "bg-ink text-bg border-ink" : "bg-surface border-line text-ink2 hover:border-ink3/50")}>{r}</button>
              ))}
            </div>
            {reason === "Other" && <input name="otherReason" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Type the reason" maxLength={120} className={cx(inputCls(err.otherReason), "h-11 mt-2")} aria-label="Other reason" />}
          </FieldShell>
          <div className="grid grid-cols-2 gap-3">
            <FieldShell label="Time" id="rl-time" required error={err.time}>
              <input id="rl-time" name="time" type="time" defaultValue={state?.values?.time ?? nowHHMM} className={cx(inputCls(err.time), "h-11 tnum")} />
            </FieldShell>
            <FieldShell label="Released by" id="rl-by">
              <input id="rl-by" value={releasedBy} readOnly className={cx(inputCls(false), "h-11 bg-sunken/60")} />
            </FieldShell>
          </div>
          {state && !state.ok && !Object.keys(err).length && <p className="text-[13px] text-bad" role="alert">{state.message}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full !h-14 !text-[16px]" icon={DoorOpen} disabled={!ready} loading={pending}>
            {pending ? "Making gate pass…" : ready ? `Release ${student.first} and make gate pass` : !photo ? "Check the photo first" : codeCheck && code.length !== 4 ? (codeSent ? "Enter the code from the guardian" : "Send the code first") : "Choose a reason"}
          </Button>
        </div>
      ) : (
        people.some((p) => p.allowed) && <p className="text-[13.5px] text-ink3 border-t border-line pt-4">Choose the person collecting {student.first}. Someone in red cannot be chosen.</p>
      )}
    </form>
  );
}
