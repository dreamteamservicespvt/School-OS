"use client";

// Small form pieces used across the Front Office sheets: the +91 phone box,
// a segmented choice sent with the form, the desk camera, and a one-tap
// action button that shows its problem in place.

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BellRing, Camera, Check, CircleAlert, CircleX, Clock, DoorOpen, LogOut, MessageCircle, RotateCcw, ScanFace, Send, type LucideIcon } from "lucide-react";
import { useTyped } from "@/components/ui/url-sheet";
import { FieldShell, inputCls } from "@/components/ui/field";
import { Segmented, type SegOption } from "@/components/ui/controls";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { Words } from "@/lib/i18n/client";

const noSubscribe = () => () => {};
/** Whether this browser can read QR codes with the camera (false on the server). */
export function useCanScanQr() {
  return useSyncExternalStore(noSubscribe, () => "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia), () => false);
}

/** A phone box with +91 in front; `onPhone` hears every change (for "returning visitor" lookups). */
export function PhoneBox({ name, label, required, start, help, onPhone, id }: { name: string; label: string; required?: boolean; start?: string; help?: React.ReactNode; onPhone?: (v: string) => void; id: string }) {
  const t = useTyped(name, start);
  return (
    <FieldShell label={label} id={id} help={help} error={t.error} required={required}>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]" aria-hidden="true">+91</span>
        <input key={t.key} id={id} name={name} inputMode="numeric" autoComplete="tel-national" defaultValue={t.value} placeholder="98480 12345" maxLength={14}
          aria-invalid={t.error ? true : undefined} aria-describedby={t.error ? `${id}-error` : help ? `${id}-help` : undefined}
          onChange={(e) => { const v = e.target.value.replace(/[^\d ]/g, ""); if (v !== e.target.value) e.target.value = v; onPhone?.(v); }}
          className={cx(inputCls(t.error), "h-11 pl-12 tnum")} />
      </div>
    </FieldShell>
  );
}

/** A segmented choice that is sent with the form as `name`. */
export function SegField({ name, label, options, start, required, onChange, size, help }: { name: string; label: string; options: readonly SegOption[]; start: string; required?: boolean; onChange?: (v: string) => void; size?: "sm" | "md"; help?: React.ReactNode }) {
  const t = useTyped(name, start);
  const [v, setV] = useState(t.value || start);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink2">{label}{required && <span className="text-bad" aria-hidden="true"> *</span>}</span>
      <Segmented label={label} value={v} onChange={(x) => { setV(x); onChange?.(x); }} options={options} className="w-full" size={size} />
      <input type="hidden" name={name} value={v} />
      {t.error ? <p className="text-[12.5px] text-bad">{t.error}</p> : help ? <p className="text-[12.5px] text-ink3">{help}</p> : null}
    </div>
  );
}

/**
 * The desk camera: a live picture where the browser allows it ("Take photo"
 * saves a still), else the phone's camera through a file box. The photo is
 * sent with the form as `name`.
 */
export function CameraBox({ name, who, required, error }: { name: string; who: string; required?: boolean; error?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"off" | "live" | "taken">("off");
  const [preview, setPreview] = useState<string | null>(null);
  const [takenAt, setTakenAt] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => () => stop(), []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const start = async () => {
    setProblem(null);
    if (!navigator.mediaDevices?.getUserMedia) { input.current?.click(); return; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      setState("live");
      requestAnimationFrame(() => { if (video.current && stream.current) { video.current.srcObject = stream.current; void video.current.play(); } });
    } catch {
      setProblem("The camera could not be opened. Allow the camera in the browser, or choose a photo.");
      input.current?.click();
    }
  };
  const keep = (file: File) => {
    const dt = new DataTransfer();
    dt.items.add(file);
    if (input.current) input.current.files = dt.files;
    setPreview(URL.createObjectURL(file));
    setTakenAt(new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase());
    setState("taken");
  };
  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = Math.min(640, v.videoWidth);
    c.height = Math.round((c.width / v.videoWidth) * v.videoHeight);
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((b) => { if (b) keep(new File([b], "visitor.jpg", { type: "image/jpeg" })); stop(); }, "image/jpeg", 0.85);
  };
  const retake = () => { if (input.current) input.current.value = ""; setPreview(null); setState("off"); };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink2"><Words k="Photo" />{required && <span className="text-bad" aria-hidden="true"> *</span>}</span>
      <input ref={input} type="file" name={name} accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPreview(URL.createObjectURL(f)); setTakenAt(new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase()); setState("taken"); } }} />
      {state === "taken" ? (
        <div className="rounded-xl border border-line p-3 flex items-center gap-3">
          <span className="relative rounded-xl overflow-hidden bg-sunken p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local snapshot (data URL), not a served image */}
            {preview ? <img src={preview} alt={`Photo of ${who || "the visitor"}`} className="w-14 h-14 rounded-lg object-cover" /> : <Avatar name={who || "Visitor"} size={56} />}
            <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-ok text-white grid place-items-center"><Check size={10} strokeWidth={3} aria-hidden="true" /></span>
          </span>
          <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]"><Words k="Photo taken at" /> {takenAt}</p><p className="text-[12.5px] text-ink3"><Words k="Printed on the pass and kept with the visit" /></p></div>
          <Button type="button" size="sm" variant="ghost" icon={RotateCcw} onClick={retake}><Words k="Retake" /></Button>
        </div>
      ) : state === "live" ? (
        <div className="relative rounded-xl border border-line bg-shade/80 h-40 overflow-hidden grid place-items-center">
          <video ref={video} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
          <span className="absolute top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-white bg-shade/60 rounded-full px-2 py-0.5"><span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" /><Words k="Desk camera on" /></span>
          <div className="absolute bottom-3 inset-x-0 flex justify-center gap-2">
            <Button type="button" size="sm" variant="primary" icon={Camera} onClick={snap}><Words k="Take photo" /></Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => { stop(); setState("off"); }}><Words k="Cancel" /></Button>
          </div>
        </div>
      ) : (
        <div className={cx("relative rounded-xl border border-dashed bg-sunken/60 h-40 grid place-items-center overflow-hidden", error ? "border-bad" : "border-line")}>
          {["top-3 left-3 border-t-2 border-l-2", "top-3 right-3 border-t-2 border-r-2", "bottom-3 left-3 border-b-2 border-l-2", "bottom-3 right-3 border-b-2 border-r-2"].map((c) => <span key={c} className={cx("absolute w-5 h-5 border-ink3/50 rounded-sm", c)} aria-hidden="true" />)}
          <div className="flex flex-col items-center gap-2 text-ink3 text-[13px] px-4 text-center">
            <ScanFace size={30} aria-hidden="true" />
            <span><Words k="Ask the visitor to look at the camera" /></span>
            <Button type="button" size="sm" variant="secondary" icon={Camera} onClick={start}><Words k="Take photo" /></Button>
          </div>
        </div>
      )}
      {error || problem ? <p className="text-[12.5px] text-bad flex items-center gap-1.5" role="alert"><CircleAlert size={14} aria-hidden="true" />{error || problem}</p>
        : <p className="text-[12.5px] text-ink3">{required ? "Required by school policy" : "Optional by school policy"}</p>}
    </div>
  );
}

type Act = (prev: FormState<unknown>, fd: FormData) => Promise<FormState<unknown>>;
const ACT_ICONS = { door: DoorOpen, logout: LogOut, message: MessageCircle, send: Send, bell: BellRing, check: Check, clock: Clock, cancel: CircleX } satisfies Record<string, LucideIcon>;
export type ActIcon = keyof typeof ACT_ICONS;

/** A button that runs one server action (Check out, Let them out, Send code...). */
export function ActButton({ action, fields, label, icon, variant = "secondary", size = "sm", className, pendingText }: { action: Act; fields: Record<string, string>; label: React.ReactNode; icon?: ActIcon; variant?: ButtonVariant; size?: "sm" | "md" | "lg"; className?: string; pendingText?: string }) {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(action, null);
  return (
    <form action={run} className={cx("relative z-[1] inline-flex flex-col items-start gap-1", className)}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button type="submit" variant={variant} size={size} icon={icon ? ACT_ICONS[icon] : undefined} loading={pending} className={className?.includes("w-full") ? "w-full" : undefined}>{pending && pendingText ? pendingText : label}</Button>
      {state && !state.ok && <span className="text-[12px] text-bad max-w-[260px]" role="alert">{state.message}</span>}
    </form>
  );
}
