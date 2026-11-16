"use client";

// Student Pickup at the desk (16 §2, mod-frontoffice.jsx Release): choose the
// person collecting from the approved list (red ones cannot be chosen), match
// the photo (or, with no photo on record, check ID proof or call a guardian),
// the code to the guardian's phone when the school uses it (or, where no code
// can go, the guardian's approval on WhatsApp: src/lib/front-office/pickup-tap.ts),
// the reason and the time; then the Pickup gate pass is made on the server.

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Camera, CircleCheck, DoorOpen, Hand, Loader2, MessageCircle, PhoneCall, ScanLine, Send, TriangleAlert, UserX } from "lucide-react";
import type { FormState } from "@/lib/forms";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClass } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { SheetForm } from "@/components/ui/url-sheet";
import { SText } from "@/components/ui/sheet-fields";
import { cx } from "@/components/ui/cx";
import { PICKUP_REASONS, type NoPhotoCheck } from "@/lib/front-office/words";
import type { DeclineBlock, PickupApproval } from "@/lib/front-office/pickup-tap";
import { approvalNowAction, askApprovalAction, refusedAction, releaseAction, sendCodeAction } from "../actions";
import { useCanScanQr } from "./fields";
import { useT, Words } from "@/lib/i18n/client";
import { TimeInput } from "@/components/ui/date-input";

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
  const t = useT();
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
      <Button type="button" variant="secondary" size="lg" icon={ScanLine} onClick={() => { setProblem(null); setOpen((x) => !x); }} aria-pressed={open}><span className="hidden sm:inline">{open ? t("Stop scanning") : t("Scan ID card")}</span></Button>
      {open && (
        <div className="fixed inset-x-4 bottom-4 z-50 sm:inset-x-auto sm:right-6 sm:w-80 rounded-2xl overflow-hidden bg-ink shadow-pop">
          <video ref={video} muted playsInline className="w-full h-48 object-cover" />
          <p className="text-[12.5px] text-bg px-3 py-2"><Words k="Hold the QR on the ID card in front of the camera." /></p>
        </div>
      )}
      {problem && <p className="sr-only" role="alert">{t.any(problem)}</p>}
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
  const t = useT();
  return (
    <SheetForm title={t("Do not release {name}", { name: student.first })} sub={t("Not on {name}’s pickup list. Call a registered guardian, and tell the class teacher.", { name: student.first })} closeHref={closeHref}
      action={refusedAction} hidden={{ studentId: student.id }} submitLabel={classTeacher ? t("Tell class teacher {name}", { name: classTeacher }) : "Keep it with the student’s record"} pendingText="Telling…" submitVariant="danger">
      <div className="flex justify-center pt-1"><span className="w-16 h-16 rounded-full bg-bad text-badink grid place-items-center shadow-pop" aria-hidden="true"><Hand size={30} /></span></div>
      <SText name="who" label="Who is here?" help="Kept with the student’s record" placeholder="Name and relation, like Suresh, neighbour" maxLength={120} />
      {calls.map((c) => (
        <a key={c.tel + c.name} href={`tel:${c.tel}`} className={cx(buttonClass("secondary"), "w-full !justify-start")}><PhoneCall size={17} aria-hidden="true" />{t("Call {name} ({relation})", { name: c.name, relation: t.any(c.relationship).toLowerCase() })}</a>
      ))}
      {!calls.length && deskPhone && <a href={`tel:${deskPhone}`} className={cx(buttonClass("primary"), "w-full")}><PhoneCall size={17} aria-hidden="true" /><Words k="Call the front desk" /></a>}
      <p className="text-[12.5px] text-ink3 text-center"><Words k="People are added to the list only in Student Management." /></p>
    </SheetForm>
  );
}

export type PickupChoice = { guardianId: string; name: string; relationship: string; phone: string | null; photo: string | null; restriction: string | null; allowed: boolean };

type S = FormState<unknown>;

/** The approved list on its own (View, Office Staff and Gate Security). */
export function PickupList({ people, canChoose, chosen, onChoose }: { people: PickupChoice[]; canChoose: boolean; chosen?: string | null; onChoose?: (id: string) => void }) {
  const t = useT();
  return (
    <div className="grid sm:grid-cols-2 gap-2" role={canChoose ? "radiogroup" : undefined} aria-label={canChoose ? t("Who is collecting?") : t("Approved pickup list")}>
      {people.map((x) => {
        const on = chosen === x.guardianId;
        const clickable = canChoose && x.allowed;
        const inner = (
          <>
            <span className="relative shrink-0">
              <Avatar name={x.name} size={48} src={x.photo} />
              {!x.allowed && <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-bad text-badink grid place-items-center ring-2 ring-surface"><Ban size={13} aria-hidden="true" /></span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cx("block font-semibold text-[14.5px] truncate", !x.allowed && "text-bad")}>{x.name}</span>
              <span className="block text-[12.5px] text-ink3">{t.any(x.relationship)}{x.phone ? <> · <span className="tnum">{x.phone}</span></> : null}</span>
              {!x.allowed && <span className="block text-[12px] text-bad font-semibold mt-0.5"><Words k="Not allowed to collect" /></span>}
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

/** With no photo on record there is no face to match: the checks the desk can do instead (QA FO-01). */
const NO_PHOTO_OPTIONS: { value: NoPhotoCheck; title: (t: ReturnType<typeof useT>, name: string) => string; sub: "Aadhaar, driving licence or another photo ID. Match the face with the ID photo." | "Call a number on the student’s record and ask who is collecting." }[] = [
  { value: "id-proof", title: (t, name) => t("ID proof shows {name}", { name }), sub: "Aadhaar, driving licence or another photo ID. Match the face with the ID photo." },
  { value: "call", title: (t) => t("A parent or guardian confirmed on a call"), sub: "Call a number on the student’s record and ask who is collecting." },
];

/** How often the desk checks quietly for the guardian's answer on WhatsApp. */
const APPROVAL_POLL_MS = 4000;

export function ReleaseForm({ student, people, codeCheck, tapCheck = false, approvals = {}, blocked = null, leader = false, codeLock = null, releasedBy, nowHHMM, stopHref, photoBase }: {
  student: { id: string; first: string };
  people: PickupChoice[];
  codeCheck: boolean;
  /** No code can go: the guardian approves on WhatsApp instead (owner decision 21); with no Parent Link, the photo, ID or call check stands. */
  tapCheck?: boolean;
  /** Where each allowed person's approval stands, by guardian id. */
  approvals?: Record<string, PickupApproval>;
  /** A guardian said no on WhatsApp: no release to anyone for a while, unless a leader allows it. */
  blocked?: DeclineBlock | null;
  /** The Principal or a School Admin: may allow a release a guardian refused or could not answer, with a note. */
  leader?: boolean;
  /** Code checks are locked after too many wrong codes: why and until when (gap list G04). */
  codeLock?: string | null;
  releasedBy: string;
  nowHHMM: string;
  stopHref: string;
  /** Where a guardian's photo is added in Student Management (the guardian id is added), for people allowed to; null says who to ask. */
  photoBase: string | null;
}) {
  const [state, run, pending] = useActionState<S, FormData>(releaseAction, null);
  const [codeState, sendCode, sending] = useActionState<S, FormData>(sendCodeAction, null);
  const [who, setWho] = useState<string | null>(state?.values?.guardianId ?? null);
  const [photo, setPhoto] = useState(false);
  const [check, setCheck] = useState<NoPhotoCheck | "">("");
  const [code, setCode] = useState("");
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [askState, ask, asking] = useActionState<S, FormData>(askApprovalAction, null);
  const [askFor, setAskFor] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, PickupApproval>>({});
  const [called, setCalled] = useState(false);
  const [leaderNote, setLeaderNote] = useState("");
  const [reason, setReason] = useState(state?.values?.reason ?? "");
  const [other, setOther] = useState(state?.values?.otherReason ?? "");
  const g = people.find((p) => p.guardianId === who) ?? null;
  const restricted = people.find((p) => !p.allowed && p.restriction);
  const why = reason === "Other" ? other.trim() : reason;
  const codeSent = codeState?.ok && codeFor === who;
  // A photo on record is matched with the face; without one, ID proof or a call to a guardian instead.
  const verified = g ? (g.photo ? photo : Boolean(check)) : false;
  // The guardian's answer on WhatsApp; checked again and used once on the server when the child is released.
  const approval: PickupApproval | null = g && tapCheck ? live[g.guardianId] ?? approvals[g.guardianId] ?? { state: "no-link" } : null;
  const tapNeeded = Boolean(approval && approval.state !== "no-link");
  // The leader's note (checked again on the server) lets a release go that a guardian refused or could not answer.
  const leaderOk = leader && leaderNote.trim().length >= 5;
  const approved = !tapNeeded || approval?.state === "approved" || (approval?.state === "failed" && called) || leaderOk;
  const codeOk = !codeCheck || (code.length === 4 && !codeLock) || Boolean(blocked && leaderOk);
  const ready = Boolean(g && verified && codeOk && approved && (!blocked || leaderOk) && why);
  const askedId = askState?.ok ? askFor : null;
  useEffect(() => {
    // Just asked: read where it stands now (waiting, or ended at once by Test mode).
    if (!askedId) return;
    let stop = false;
    void approvalNowAction(student.id, askedId).then((r) => { if (!stop && r) setLive((m) => ({ ...m, [askedId]: r })); });
    return () => { stop = true; };
  }, [askState, askedId, student.id]);
  const waitingFor = g && approval?.state === "waiting" ? g.guardianId : null;
  useEffect(() => {
    // While the guardian has not answered, check quietly every few seconds.
    if (!waitingFor) return;
    let stop = false;
    const h = setInterval(() => {
      if (document.hidden) return;
      void approvalNowAction(student.id, waitingFor).then((r) => { if (!stop && r) setLive((m) => ({ ...m, [waitingFor]: r })); });
    }, APPROVAL_POLL_MS);
    return () => { stop = true; clearInterval(h); };
  }, [waitingFor, student.id]);
  const err = state && !state.ok ? state.errors ?? {} : {};
  const choose = (id: string) => { setWho(id); setPhoto(false); setCheck(""); setCode(""); setCalled(false); };
  const t = useT();
  const gFirst = g?.name.split(" ")[0] ?? "";

  return (
    <form action={run} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="studentId" value={student.id} />
      <input type="hidden" name="guardianId" value={who ?? ""} />
      <input type="hidden" name="reason" value={reason} />
      <input type="hidden" name="photoMatch" value={g?.photo && photo ? "on" : ""} />
      <input type="hidden" name="otherCheck" value={g && !g.photo ? check : ""} />
      <input type="hidden" name="tapFallback" value={approval?.state === "failed" && called ? "call" : ""} />
      {blocked && (
        <div role="alert" className="rounded-xl border border-bad/50 bg-bad/[.06] p-3 flex gap-2 text-[13.5px] text-bad font-semibold">
          <Ban size={17} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>{t("{by} said no on WhatsApp at {at}. Do not release {student} to anyone before {until}, unless the Principal or a School Admin allows it.", { by: blocked.by, at: blocked.at, student: student.first, until: blocked.until })}</span>
        </div>
      )}
      <div>
        <p className="text-[13px] font-semibold text-ink2 mb-2"><Words k="Who is collecting?" /> <span className="font-normal text-ink3"><Words k={"· from Student Management, Parents & Guardians"} /></span></p>
        {people.length ? <PickupList people={people} canChoose chosen={who} onChoose={choose} />
          : <p className="text-[13.5px] text-ink3 rounded-xl bg-sunken/70 px-3.5 py-3">{t("Nobody is on {name}’s pickup list yet. It is set in Student Management, Parents & Guardians.", { name: student.first })}</p>}
        {restricted && <p className="mt-2 text-[13px] text-bad flex gap-1.5"><TriangleAlert size={15} className="shrink-0 mt-0.5" aria-hidden="true" />{t.any(restricted.restriction ?? "")}</p>}
        {err.guardianId && <p className="mt-2 text-[12.5px] text-bad" role="alert">{t.any(err.guardianId)}</p>}
        <Link href={stopHref} scroll={false} className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-bad hover:underline"><UserX size={16} aria-hidden="true" /><Words k="Someone not on this list is here" /></Link>
      </div>

      {g ? (
        <div className="flex flex-col gap-4 border-t border-line pt-4 animate-rise">
          <div>
            <p className="text-[13px] font-semibold text-ink2 mb-2">{t("Check {name}", { name: gFirst })} <span className="text-bad" aria-hidden="true">*</span></p>
            {g.photo ? (
              <div className={cx("rounded-xl border p-3 flex items-center gap-3", err.photoMatch ? "border-bad" : "border-line")}>
                <Avatar name={g.name} size={56} src={g.photo} />
                <label className="flex-1 flex items-center gap-3 cursor-pointer">
                  <Checkbox checked={photo} onChange={setPhoto} label="Photo matches" />
                  <span className="text-[14px]"><b className="font-semibold block"><Words k="The face matches this photo" /></b><span className="text-[12.5px] text-ink3"><Words k="Look at the person, not only the ID" /></span></span>
                </label>
              </div>
            ) : (
              <div className={cx("rounded-xl border p-3 flex flex-col gap-3", err.photoMatch ? "border-bad" : "border-line")}>
                <div className="flex items-center gap-3">
                  <span className="relative shrink-0">
                    <Avatar name={g.name} size={48} />
                    <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-sunken text-ink2 grid place-items-center ring-2 ring-surface"><Camera size={13} aria-hidden="true" /></span>
                  </span>
                  <span className="text-[14px] min-w-0"><b className="font-semibold block">{t("No photo of {name} on record", { name: gFirst })}</b><span className="text-[12.5px] text-ink3"><Words k="There is no face to match. Check one of these instead." /></span></span>
                </div>
                <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("How you checked {name}", { name: gFirst })}>
                  {NO_PHOTO_OPTIONS.map((o) => (
                    <button key={o.value} type="button" role="radio" aria-checked={check === o.value} onClick={() => setCheck(o.value)}
                      className={cx("text-left rounded-xl border px-3 py-2.5 flex items-start gap-2.5 transition", check === o.value ? "border-brand ring-1 ring-brand bg-brand/[.05]" : "border-line hover:border-ink3/50")}>
                      <span className={cx("mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 grid place-items-center", check === o.value ? "border-brand" : "border-ink3/60")} aria-hidden="true">{check === o.value && <span className="w-2 h-2 rounded-full bg-brand" />}</span>
                      <span className="text-[14px]"><b className="font-semibold block">{o.title(t, g.name)}</b><span className="text-[12.5px] text-ink3">{t(o.sub)}</span></span>
                    </button>
                  ))}
                </div>
                <p className="text-[12.5px] text-ink3">
                  {photoBase ? <Link href={`${photoBase}${g.guardianId}`} className="font-semibold text-brand hover:underline">{t("Add {name}’s photo in Student Management", { name: gFirst })}</Link> : t("Ask the office to add {name}’s photo in Student Management", { name: gFirst })}{t(", so next time the face can be matched.")}
                </p>
              </div>
            )}
            {err.photoMatch && <p className="mt-1 text-[12.5px] text-bad" role="alert">{t.any(err.photoMatch)}</p>}
            {codeCheck && (
              <div className="rounded-xl border border-line p-3 mt-2 flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="text-[14px] flex-1"><b className="font-semibold block"><Words k="Code to the guardian’s phone" /></b><span className="text-[12.5px] text-ink3">{t("Switched on by the school. Sent to the number on {name}’s record.", { name: gFirst })}</span></span>
                {codeLock ? (
                  <p role="alert" className="text-[12.5px] text-bad flex gap-1.5 sm:max-w-[300px]"><TriangleAlert size={15} className="shrink-0 mt-0.5" aria-hidden="true" />{codeLock}</p>
                ) : !codeSent ? (
                  <div className="flex flex-col items-start gap-1">
                    <Button type="submit" formAction={sendCode} formNoValidate variant="secondary" icon={Send} loading={sending} onClick={() => setCodeFor(who)}><Words k="Send code" /></Button>
                    {codeState && !codeState.ok && <span className="text-[12px] text-bad max-w-[260px]" role="alert">{codeState.message}</span>}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input name="code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" placeholder={t("4 digits")}
                      className={cx(inputCls(err.code), "h-11 !w-28 tnum text-center tracking-[.3em] font-semibold")} aria-label={t("Code from the guardian")} aria-invalid={err.code ? true : undefined} />
                    {code.length === 4 && <CircleCheck size={20} className="text-ok" aria-hidden="true" />}
                    <Button type="submit" formAction={sendCode} formNoValidate variant="ghost" size="sm" loading={sending} onClick={() => { setCodeFor(who); setCode(""); }}><Words k="Send a new code" /></Button>
                  </div>
                )}
                {codeSent && (codeState?.data as { testMode?: boolean } | undefined)?.testMode && <p role="status" className="text-[12px] text-warn max-w-[260px]">{codeState?.message}</p>}
              </div>
            )}
            {err.code && <p className="mt-1 text-[12.5px] text-bad" role="alert">{err.code}</p>}
            {approval && (approval.state === "no-link" ? (
              <p className="mt-2 text-[12.5px] text-ink3 flex gap-1.5"><PhoneCall size={15} className="shrink-0 mt-0.5" aria-hidden="true" />{t("{name} has no Parent Link, so approval cannot be asked on WhatsApp. Check the photo, ID proof or call a guardian instead.", { name: gFirst })}</p>
            ) : (
              <div className={cx("rounded-xl border p-3 mt-2 flex flex-col gap-2", approval.state === "declined" ? "border-bad/50 bg-bad/[.05]" : approval.state === "approved" ? "border-ok/50 bg-ok/[.06]" : err.approval ? "border-bad" : "border-line")}>
                <span className="text-[14px]"><b className="font-semibold block"><Words k="Approval on WhatsApp" /></b><span className="text-[12.5px] text-ink3">{t("Switched on by the school. Sent to {name}’s own WhatsApp.", { name: gFirst })}</span></span>
                {approval.state === "approved" ? (
                  <p role="status" className="text-[13.5px] font-semibold text-ok flex gap-1.5"><CircleCheck size={17} className="shrink-0 mt-0.5" aria-hidden="true" />{t("Approved by {name} on WhatsApp at {time}", { name: approval.by || g.name, time: approval.at })}</p>
                ) : approval.state === "declined" ? (
                  <p role="alert" className="text-[13.5px] font-semibold text-bad flex gap-1.5"><Ban size={16} className="shrink-0 mt-0.5" aria-hidden="true" />{t("{name} said no on WhatsApp at {time}. Do not release {student}. Call {name}, or ask again.", { name: gFirst, time: approval.at, student: student.first })}</p>
                ) : approval.state === "waiting" ? (
                  <p role="status" className="text-[13px] text-ink2 flex items-center gap-1.5"><Loader2 size={15} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t("Waiting for {name} to tap Approve on WhatsApp…", { name: gFirst })}</p>
                ) : approval.state === "expired" ? (
                  <p role="status" className="text-[12.5px] text-warn"><Words k="No answer came in time. Ask again." /></p>
                ) : approval.state === "failed" ? (
                  <div className="flex flex-col gap-2">
                    <p role="alert" className="text-[13px] text-bad">{t("The request did not reach {name}’s WhatsApp. Call {name}, then tick below.", { name: gFirst })}</p>
                    <label className="flex items-center gap-2.5 cursor-pointer"><Checkbox checked={called} onChange={setCalled} label={t("{name} confirmed on a call", { name: gFirst })} /><span className="text-[13.5px] font-semibold">{t("{name} confirmed on a call", { name: gFirst })}</span></label>
                  </div>
                ) : null}
                {approval.state !== "approved" && (
                  <div className="flex flex-col items-start gap-1">
                    <Button type="submit" formAction={ask} formNoValidate variant={approval.state === "none" ? "secondary" : "ghost"} size={approval.state === "none" ? "md" : "sm"} icon={MessageCircle} loading={asking} onClick={() => setAskFor(who)}>
                      {approval.state === "none" ? t("Ask {name} to approve on WhatsApp", { name: gFirst }) : t("Ask again")}
                    </Button>
                    {askState && askFor === who && approval.state !== "waiting" && <span className={cx("text-[12px] max-w-[320px]", askState.ok ? "text-warn" : "text-bad")} role={askState.ok ? "status" : "alert"}>{t.any(askState.message ?? "")}</span>}
                  </div>
                )}
              </div>
            ))}
            {err.approval && <p className="mt-1 text-[12.5px] text-bad" role="alert">{t.any(err.approval)}</p>}
            {leader && (blocked || (tapNeeded && approval?.state !== "approved")) && (
              <div className="rounded-xl border border-line p-3 mt-2 flex flex-col gap-2">
                <label htmlFor="rl-leader" className="text-[14px]"><b className="font-semibold block"><Words k="Allow this release (Principal or School Admin)" /></b><span className="text-[12.5px] text-ink3"><Words k="Only when you are sure. Why you allow it is kept in the audit log." /></span></label>
                <input id="rl-leader" name="leaderNote" value={leaderNote} onChange={(e) => setLeaderNote(e.target.value)} maxLength={200} placeholder={t("Why you are allowing it")} className={cx(inputCls(err.leaderNote), "h-11")} aria-invalid={err.leaderNote ? true : undefined} />
                {err.leaderNote && <p className="text-[12.5px] text-bad" role="alert">{t.any(err.leaderNote)}</p>}
              </div>
            )}
          </div>
          <FieldShell label="Reason" id="rl-reason" required error={err.reason || err.otherReason}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("Reason")}>
              {PICKUP_REASONS.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)}
                  className={cx("h-9 px-3.5 rounded-xl text-[13.5px] font-semibold border transition", reason === r ? "bg-ink text-bg border-ink" : "bg-surface border-line text-ink2 hover:border-ink3/50")}>{t(r)}</button>
              ))}
            </div>
            {reason === "Other" && <input name="otherReason" value={other} onChange={(e) => setOther(e.target.value)} placeholder={t("Type the reason")} maxLength={120} className={cx(inputCls(err.otherReason), "h-11 mt-2")} aria-label={t("Other reason")} />}
          </FieldShell>
          <div className="grid grid-cols-2 gap-3">
            <FieldShell label="Time" id="rl-time" required error={err.time}>
              <TimeInput id="rl-time" name="time" defaultValue={state?.values?.time ?? nowHHMM} className={cx(inputCls(err.time), "h-11 tnum")} />
            </FieldShell>
            <FieldShell label="Released by" id="rl-by">
              <input id="rl-by" value={releasedBy} readOnly className={cx(inputCls(false), "h-11 bg-sunken/60")} />
            </FieldShell>
          </div>
          {state && !state.ok && !Object.keys(err).length && <p className="text-[13px] text-bad" role="alert">{t.any(state.message ?? "")}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full !h-14 !text-[16px]" icon={DoorOpen} disabled={!ready} loading={pending}>
            {pending ? t("Making gate pass…") : ready ? t("Release {name} and make gate pass", { name: student.first }) : !verified ? (g.photo ? t("Check the photo first") : t("Check ID proof or call first")) : blocked && !leaderOk ? t("Release blocked: read the red note") : codeCheck && codeLock && !codeOk ? t("Code checks are locked: read the red note above") : !codeOk && codeCheck && code.length !== 4 ? (codeSent ? t("Enter the code from the guardian") : t("Send the code first")) : !approved ? (approval?.state === "declined" ? t("{name} said no: do not release", { name: gFirst }) : approval?.state === "waiting" ? t("Waiting for {name} to approve", { name: gFirst }) : approval?.state === "failed" ? t("Call {name} first, then tick", { name: gFirst }) : t("Ask {name} to approve on WhatsApp first", { name: gFirst })) : t("Choose a reason")}
          </Button>
        </div>
      ) : (
        people.some((p) => p.allowed) && <p className="text-[13.5px] text-ink3 border-t border-line pt-4">{t("Choose the person collecting {name}. Someone in red cannot be chosen.", { name: student.first })}</p>
      )}
    </form>
  );
}
