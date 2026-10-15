"use client";

// Small browser pieces used across the Library pages: the scan box (a
// barcode scanner types into it and presses Enter; a phone uses its camera
// where the browser can read barcodes), a one-tap action button that shows
// its problem in place, and a segmented choice sent with a form.

import { useActionState, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Camera, Check, CircleX, RefreshCw, ScanLine, Send, BookmarkPlus, CornerDownLeft, X, type LucideIcon } from "lucide-react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Segmented, type SegOption } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { useTyped } from "@/components/ui/url-sheet";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";

const noSubscribe = () => () => {};
/** Whether this browser can read barcodes with the camera (false on the server). */
export function useCanScan() {
  return useSyncExternalStore(noSubscribe, () => "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia), () => false);
}

/**
 * Scan or type a code: a USB or Bluetooth scanner types the code and presses
 * Enter, which opens `href` with `param` set to the code. Where the browser
 * can read barcodes, "Use the camera" reads it from the phone's camera.
 */
export function ScanBox({ href, param, label, placeholder, start = "", autoFocus, id, hint }: { href: string; param: string; label: string; placeholder: string; start?: string; autoFocus?: boolean; id: string; hint?: React.ReactNode }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const canScan = useCanScan();
  const [busy, startNav] = useTransition();
  const go = (raw: string) => {
    const code = raw.trim();
    if (!code) { setProblem("Scan the barcode or type the number."); input.current?.focus(); return; }
    setProblem(null);
    const [path, query = ""] = href.split("?");
    const u = new URLSearchParams(query);
    u.set(param, code);
    startNav(() => router.replace(`${path}?${u.toString()}`, { scroll: false }));
  };
  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    let detector: Detector;
    try {
      detector = new Ctor({ formats: ["code_128", "code_39", "ean_13", "ean_8", "qr_code"] });
    } catch {
      detector = new Ctor({ formats: ["qr_code"] });
    }
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        while (!stopped) {
          const hits = await detector.detect(video.current).catch(() => []);
          if (hits[0]?.rawValue) { setScanning(false); go(hits[0].rawValue); break; }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setProblem("The camera could not be opened. Allow the camera in the browser, or type the number.");
        setScanning(false);
      }
    })();
    return () => { stopped = true; stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);
  return (
    <div className="flex flex-col gap-2">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); go(String(new FormData(e.currentTarget).get("code") ?? "")); }}>
        <label htmlFor={id} className="sr-only">{label}</label>
        <div className="relative flex-1 min-w-0">
          <ScanLine size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
          <input ref={input} id={id} name="code" defaultValue={start} placeholder={placeholder} autoFocus={autoFocus} autoComplete="off" spellCheck={false}
            aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${id}-error` : hint ? `${id}-help` : undefined}
            className={cx(inputCls(problem), "h-12 pl-11 font-mono text-[15px]")} />
        </div>
        <Button type="submit" variant="primary" loading={busy} className="h-12">Go</Button>
        {canScan && <Button type="button" variant="secondary" icon={Camera} className="h-12" onClick={() => setScanning((s) => !s)} aria-pressed={scanning}><span className="hidden sm:inline">{scanning ? "Stop" : "Camera"}</span><span className="sr-only sm:hidden">Use the camera</span></Button>}
      </form>
      {scanning && (
        <div className="relative rounded-2xl bg-shade/80 h-44 overflow-hidden">
          <video ref={video} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
          <span className="absolute inset-x-8 top-1/2 h-0.5 bg-brand/80 rounded-full animate-pulse" aria-hidden="true" />
          <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[11.5px] font-semibold text-white bg-shade/60 rounded-full px-2 py-0.5">Hold the barcode inside the frame</span>
        </div>
      )}
      {problem ? <p id={`${id}-error`} className="text-[12.5px] text-bad" role="alert">{problem}</p> : hint ? <p id={`${id}-help`} className="text-[12.5px] text-ink3">{hint}</p> : null}
    </div>
  );
}

type Act = (prev: FormState<unknown>, fd: FormData) => Promise<FormState<unknown>>;
const ICONS = { bell: BellRing, check: Check, cancel: CircleX, renew: RefreshCw, send: Send, reserve: BookmarkPlus, ret: CornerDownLeft, x: X } satisfies Record<string, LucideIcon>;
export type ActIcon = keyof typeof ICONS;

/** A button that runs one server action (Renew, Remind, Approve...), with its problem shown in place. */
export function ActButton({ action, fields, label, icon, variant = "secondary", size = "sm", className, pendingText, ariaLabel }: { action: Act; fields: Record<string, string>; label: React.ReactNode; icon?: ActIcon; variant?: ButtonVariant; size?: "sm" | "md" | "lg"; className?: string; pendingText?: string; ariaLabel?: string }) {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(action, null);
  return (
    <form action={run} className={cx("relative z-[1] inline-flex flex-col items-start gap-1", className)}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button type="submit" variant={variant} size={size} icon={icon ? ICONS[icon] : undefined} loading={pending} aria-label={ariaLabel} className={className?.includes("w-full") ? "w-full" : undefined}>{pending && pendingText ? pendingText : label}</Button>
      {state && !state.ok && <span className="text-[12px] text-bad max-w-[280px]" role="alert">{state.message}</span>}
    </form>
  );
}

/** A segmented choice that is sent with the form as `name`. */
export function SegField({ name, label, options, start, onChange, size, help }: { name: string; label: string; options: readonly SegOption[]; start: string; onChange?: (v: string) => void; size?: "sm" | "md"; help?: React.ReactNode }) {
  const t = useTyped(name, start);
  const [v, setV] = useState(t.value || start);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink2">{label}</span>
      <Segmented label={label} value={v} onChange={(x) => { setV(x); onChange?.(x); }} options={options} className="w-full" size={size} />
      <input type="hidden" name={name} value={v} />
      {t.error ? <p className="text-[12.5px] text-bad">{t.error}</p> : help ? <p className="text-[12.5px] text-ink3">{help}</p> : null}
    </div>
  );
}
