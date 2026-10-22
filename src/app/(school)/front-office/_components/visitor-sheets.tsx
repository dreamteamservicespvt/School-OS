"use client";

// Visitor sheets (mod-frontoffice.jsx VisitorSheet, CheckOutSheet,
// GateEntrySheet, ScanSheet): register a visitor in under a minute, check
// out with the right time, record a gate entry, and check a pass.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleAlert, LogIn, LogOut, ScanLine, UserCheck } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SSelect, SText } from "@/components/ui/sheet-fields";
import { FieldShell, inputCls } from "@/components/ui/field";
import { Banner } from "@/components/money/kit";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { ID_PROOF_TYPES, PEOPLE_COUNTS, mobileDigits, vehicleProblem } from "@/lib/front-office/words";
import type { ReturningVisitor } from "@/lib/front-office/visitors";
import { checkOutAction, gateEntryAction, lookupVisitor, registerVisitorAction } from "../actions";
import { CameraBox, PhoneBox, SegField, useCanScanQr } from "./fields";
import { KeepSelect } from "@/components/ui/keep-select";

export type MeetChoice = { id: string; name: string; role: string; now: string; tone: "ok" | "warn" | "bad" };
const TONE = { ok: "text-ok", warn: "text-warn", bad: "text-bad" } as const;
const MEET_PURPOSES = ["Meeting", "Interview", "Fee payment"];

export function VisitorSheet({ closeHref, back, purposes, staff, photoRequired, idRequired, preset }: {
  closeHref: string; back: string; purposes: string[]; staff: MeetChoice[]; photoRequired: boolean; idRequired: boolean;
  preset?: { appointmentId: string; name: string; phone: string; meetStaffId: string; note: string } | null;
}) {
  return (
    <SheetForm title="New visitor" sub="Type the phone first. Returning visitors fill in by themselves." closeHref={closeHref} action={registerVisitorAction}
      submitLabel="Register and make pass" pendingText="Registering…" wide hidden={{ back, ...(preset ? { appointmentId: preset.appointmentId } : {}) }}>
      <VisitorFields purposes={purposes} staff={staff} photoRequired={photoRequired} idRequired={idRequired} preset={preset ?? null} />
    </SheetForm>
  );
}

function VisitorFields({ purposes, staff, photoRequired, idRequired, preset }: { purposes: string[]; staff: MeetChoice[]; photoRequired: boolean; idRequired: boolean; preset: { name: string; phone: string; meetStaffId: string; note: string } | null }) {
  const name = useTyped("name", preset?.name ?? "");
  const purpose = useTyped("purpose", purposes.includes("Meeting") ? "Meeting" : purposes[0]);
  const meet = useTyped("meetStaffId", preset?.meetStaffId ?? "");
  const vehicle = useTyped("vehicleNo", "");
  const idNo = useTyped("idProofNo", "");
  const photoErr = useTyped("photo", null).error;
  const [who, setWho] = useState(name.value);
  const [why, setWhy] = useState(purpose.value);
  const [meetId, setMeetId] = useState(meet.value);
  const [found, setFound] = useState<ReturningVisitor | null>(null);
  const [veh, setVeh] = useState(vehicle.value);
  const [, start] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const asked = useRef("");
  const onPhone = (v: string) => {
    const d = mobileDigits(v);
    if (d.length !== 10 || d === asked.current) { if (d.length !== 10) setFound(null); return; }
    asked.current = d;
    start(async () => {
      const r = await lookupVisitor(d);
      setFound(r);
      if (r && !who.trim()) {
        setWho(r.name);
        if (nameRef.current) nameRef.current.value = r.name;
        if (r.purpose && purposes.includes(r.purpose)) setWhy(r.purpose);
        if (r.meetStaffId && staff.some((s) => s.id === r.meetStaffId)) setMeetId(r.meetStaffId);
      }
    });
  };
  const m = staff.find((s) => s.id === meetId);
  const needMeet = MEET_PURPOSES.includes(why);
  const vErr = vehicle.error || vehicleProblem(veh);
  const openMore = Boolean(idRequired || idNo.error || vehicle.error);
  return (
    <>
      <div className="grid md:grid-cols-[1fr_240px] gap-4 md:gap-5">
        <div className="flex flex-col gap-4 min-w-0">
          <PhoneBox id="vs-phone" name="phone" label="Phone" required start={preset?.phone} onPhone={onPhone} />
          {found && (
            <div className="rounded-xl bg-ok/10 px-3.5 py-2.5 text-[13.5px] flex items-center gap-2 -mt-2 animate-fade" role="status">
              <UserCheck size={16} className="text-ok shrink-0" aria-hidden="true" />
              <span className="text-ink2"><b className="text-ink font-semibold">{found.kind === "parent" ? "Parent of the school." : "Returning visitor."}</b> {found.kind === "parent" ? found.last : `Last visit ${found.last}.`}</span>
            </div>
          )}
          <FieldShell label="Name" id="vs-name" required error={name.error}>
            <input key={name.key} ref={nameRef} id="vs-name" name="name" defaultValue={who} onChange={(e) => setWho(e.target.value)} placeholder="Full name" autoComplete="off" maxLength={120}
              aria-invalid={name.error ? true : undefined} className={cx(inputCls(name.error), "h-11")} />
          </FieldShell>
          <FieldShell label="Purpose" id="vs-purpose" required error={purpose.error}>
            <KeepSelect id="vs-purpose" name="purpose" value={why} onChange={(e) => setWhy(e.target.value)} className={cx(inputCls(purpose.error), "h-11")}>
              {purposes.map((p) => <option key={p} value={p}>{p}</option>)}
            </KeepSelect>
          </FieldShell>
          {why === "Admission enquiry" && <Banner tone="info" title="The enquiry form opens next,">so the details reach Admissions with an owner and a follow-up.</Banner>}
          <FieldShell label="Person to meet" id="vs-meet" required={needMeet} error={meet.error}
            help={m ? <span className={cx("font-semibold", TONE[m.tone])}>{m.now}</span> : "Shows if they are on leave or teaching now"}>
            <KeepSelect id="vs-meet" name="meetStaffId" value={meetId} onChange={(e) => setMeetId(e.target.value)} className={cx(inputCls(meet.error), "h-11")} aria-invalid={meet.error ? true : undefined}>
              <option value="">Choose staff member</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
            </KeepSelect>
          </FieldShell>
          {m?.tone === "bad" && <p className="text-[12.5px] text-bad flex items-center gap-1.5" role="alert"><CircleAlert size={14} aria-hidden="true" />{m.name} is not in today ({m.now.toLowerCase()}). Book an appointment instead, or choose someone else.</p>}
          {preset?.note && <input type="hidden" name="note" value={preset.note} />}
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          <CameraBox name="photo" who={who} required={photoRequired} error={photoErr} />
          <SegField name="peopleCount" label="Number of people" start="1" options={PEOPLE_COUNTS} size="sm" />
        </div>
      </div>
      <details className="group rounded-xl border border-line" open={openMore}>
        <summary className="list-none cursor-pointer flex items-center justify-between px-4 h-11 text-[14px] font-semibold text-ink2">
          More details: ID proof and vehicle<ChevronDown size={16} className="group-open:rotate-180 transition" aria-hidden="true" />
        </summary>
        <div className="px-4 pb-4 flex flex-col gap-4">
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <SSelect name="idProofType" label="ID proof" required={idRequired} start="Aadhaar" options={ID_PROOF_TYPES.map((t) => ({ value: t, label: t }))} />
            <SText name="idProofNo" label="Number" required={idRequired} className="[&_input]:font-mono" placeholder="XXXX XXXX 4821" maxLength={30} autoComplete="off"
              help={`${idRequired ? "Required" : "Optional"} by school policy. Only the last 4 are shown later.`} />
          </div>
          <FieldShell label="Vehicle number" id="vs-veh" error={vErr || undefined} help="Also goes into the gate log">
            <input key={vehicle.key} id="vs-veh" name="vehicleNo" defaultValue={veh} onChange={(e) => { e.target.value = e.target.value.toUpperCase(); setVeh(e.target.value); }}
              className={cx(inputCls(vErr), "h-11 font-mono")} placeholder="TS 08 EZ 4410" maxLength={16} autoComplete="off" aria-invalid={vErr ? true : undefined} />
          </FieldShell>
        </div>
      </details>
    </>
  );
}

export function CheckOutSheet({ closeHref, visitor, start }: { closeHref: string; visitor: { id: string; name: string; passNo: string; expired: boolean; when: string }; start: string }) {
  return (
    <SheetForm title={`Check out ${visitor.name}?`} closeHref={closeHref} action={checkOutAction} hidden={{ visitorId: visitor.id }} pendingText="Checking out…"
      sub={visitor.expired ? `Pass ${visitor.passNo} from ${visitor.when} was never checked out. Enter the time they actually left.` : `Pass ${visitor.passNo} stops working now.`}
      submitLabel={<TimeLabel start={start} />}>
      <TimeField start={start} />
    </SheetForm>
  );
}

const ampm = (hhmm: string) => {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return "";
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 === 0 ? 12 : h % 12}:${hhmm.slice(3)} ${h >= 12 ? "PM" : "AM"}`;
};
let shared = "";
const listeners = new Set<(v: string) => void>();
function TimeField({ start }: { start: string }) {
  const t = useTyped("timeOut", start);
  useEffect(() => { shared = t.value; listeners.forEach((l) => l(t.value)); }, [t.value]);
  return (
    <FieldShell label="Time out" id="co-time" error={t.error}>
      <input key={t.key} id="co-time" type="time" name="timeOut" defaultValue={t.value} required className={cx(inputCls(t.error), "h-11 tnum")}
        onChange={(e) => { shared = e.target.value; listeners.forEach((l) => l(e.target.value)); }} />
    </FieldShell>
  );
}
function TimeLabel({ start }: { start: string }) {
  const [v, setV] = useState(shared || start);
  useEffect(() => { listeners.add(setV); return () => { listeners.delete(setV); }; }, []);
  return <>Check out at {ampm(v) || "…"}</>;
}

const GATE_OPTIONS = [{ value: "vehicle", label: "Vehicle" }, { value: "school-bus", label: "School bus" }, { value: "delivery", label: "Delivery" }, { value: "person", label: "Person" }];

export function GateEntrySheet({ closeHref, nowWords }: { closeHref: string; nowWords: string }) {
  return (
    <SheetForm title="Gate entry" sub={`Recorded with the time now: ${nowWords}`} closeHref={closeHref} action={gateEntryAction} submitLabel="Record" pendingText="Recording…">
      <GateFields />
    </SheetForm>
  );
}

function GateFields() {
  const kind = useTyped("kind", "vehicle");
  const [k, setK] = useState(kind.value || "vehicle");
  return (
    <>
      <SegField name="kind" label="What" start="vehicle" options={GATE_OPTIONS} size="sm" onChange={setK} />
      <SegField name="direction" label="In or out" start="IN" options={[{ value: "IN", label: "In", icon: LogIn }, { value: "OUT", label: "Out", icon: LogOut }]} />
      <SText name="who" label={k === "person" ? "Name" : "Driver or company"} required maxLength={120} placeholder={k === "school-bus" ? "Bus 4, Route 4 Miyapur" : "For example: Blue Dart van"} />
      {k !== "person" && <SText name="vehicleNo" label="Vehicle number" required className="[&_input]:font-mono [&_input]:uppercase" placeholder="TS 07 UB 2236" maxLength={16} autoComplete="off" />}
      <SText name="purpose" label="Purpose" placeholder="Optional" maxLength={120} />
    </>
  );
}

/** "Check a pass": scan the QR with the camera where the browser can read it, or type the number. */
export function PassCheckForm({ base, code }: { base: string; code: string }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const canScan = useCanScanQr();
  const [busy, start] = useTransition();
  const go = (c: string) => {
    const m = /check=([A-Z0-9-]+)/i.exec(c);
    const k = (m ? m[1] : c).trim().toUpperCase();
    if (!k) return;
    start(() => router.replace(`${base}${base.includes("?") ? "&" : "?"}check=${encodeURIComponent(k)}`, { scroll: false }));
  };
  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = new Ctor({ formats: ["qr_code"] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        while (!stopped) {
          const hits = await detector.detect(video.current).catch(() => []);
          if (hits[0]?.rawValue) { go(hits[0].rawValue); break; }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setScanning(false);
      }
    })();
    return () => { stopped = true; stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);
  return (
    <div className="flex flex-col gap-4">
      <div className="relative rounded-2xl bg-sunken/70 border border-dashed border-line h-32 grid place-items-center overflow-hidden">
        {scanning && <video ref={video} muted playsInline className="absolute inset-0 w-full h-full object-cover" />}
        <span className={cx("absolute inset-x-6 h-0.5 bg-brand/70 rounded-full", busy || scanning ? "top-1/2 animate-pulse" : "top-6")} aria-hidden="true" />
        {!scanning && (
          <div className="flex flex-col items-center gap-1.5 text-ink3 text-[13px]">
            <ScanLine size={28} aria-hidden="true" />{busy ? "Reading…" : canScan ? "Hold the QR inside the frame" : "Type the pass number below"}
            {canScan && <Button size="sm" variant="secondary" onClick={() => setScanning(true)}>Use the camera</Button>}
          </div>
        )}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); go(String(new FormData(e.currentTarget).get("code") ?? "")); }}>
        <input name="code" defaultValue={code} placeholder="V-0246 or GP-2026-0190" className={cx(inputCls(false), "h-11 font-mono uppercase")} aria-label="Pass number" autoComplete="off" />
        <Button type="submit" variant="primary" loading={busy}>Check</Button>
      </form>
    </div>
  );
}
