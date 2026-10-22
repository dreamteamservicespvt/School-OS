"use client";

// My profile photo: choose (or take) a photo, then drag it into place, zoom
// and rotate inside a round frame that shows exactly what others will see.
// The browser crops it to a 512 x 512 JPEG before sending, so even a big
// phone photo uploads quickly. Mouse, touch (two-finger pinch) and keyboard
// (arrow keys move, + and - zoom) all work.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import * as I from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Toast } from "@/components/ui/toast";
import { cx } from "@/components/ui/cx";
import { removeMyPhoto, saveMyPhoto } from "./actions";
import { Words } from "@/lib/i18n/client";

const VIEW = 280;
const OUT = 512;
const MAX_ZOOM = 4;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

type Pic = { img: HTMLImageElement; url: string; w: number; h: number };
type View = { zoom: number; x: number; y: number; turn: number };
const START: View = { zoom: 1, x: 0, y: 0, turn: 0 };

const noSubscribe = () => () => {};
const touchScreen = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/** The photo's size once turned, the scale that just covers the frame, and how far it may move. */
function geometry(pic: Pic, v: View) {
  const sideways = v.turn % 2 === 1;
  const rw = sideways ? pic.h : pic.w;
  const rh = sideways ? pic.w : pic.h;
  const scale = (VIEW / Math.min(rw, rh)) * v.zoom;
  return { scale, maxX: Math.max(0, (rw * scale - VIEW) / 2), maxY: Math.max(0, (rh * scale - VIEW) / 2) };
}

function clampView(pic: Pic, v: View): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
  const g = geometry(pic, { ...v, zoom });
  return { ...v, zoom, x: Math.min(g.maxX, Math.max(-g.maxX, v.x)), y: Math.min(g.maxY, Math.max(-g.maxY, v.y)) };
}

/** Zooms around the middle of the frame, so what is in the middle stays there. */
function zoomTo(pic: Pic, v: View, zoom: number): View {
  const next = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const k = geometry(pic, { ...v, zoom: next }).scale / geometry(pic, v).scale;
  return clampView(pic, { ...v, zoom: next, x: v.x * k, y: v.y * k });
}

async function cropToBlob(pic: Pic, v: View): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = OUT;
  canvas.height = OUT;
  const ctx = canvas.getContext("2d")!;
  const k = OUT / VIEW;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, OUT, OUT);
  ctx.imageSmoothingQuality = "high";
  ctx.translate(OUT / 2 + v.x * k, OUT / 2 + v.y * k);
  ctx.rotate((v.turn * Math.PI) / 2);
  const s = geometry(pic, v).scale * k;
  ctx.scale(s, s);
  ctx.drawImage(pic.img, -pic.w / 2, -pic.h / 2);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("crop"))), "image/jpeg", 0.9));
}

export function PhotoEditor({ name, src }: { name: string; src: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pic, setPic] = useState<Pic | null>(null);
  const [view, setView] = useState<View>(START);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [toast, setToast] = useState<{ n: number; message: string; tone: "success" | "danger" } | null>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const touch = useSyncExternalStore(noSubscribe, touchScreen, () => false);

  const say = (message: string, tone: "success" | "danger") => setToast((t) => ({ n: (t?.n ?? 0) + 1, message, tone }));

  // The chosen photo's address is let go when it is replaced or the editor closes.
  useEffect(() => () => { if (pic) URL.revokeObjectURL(pic.url); }, [pic]);

  const close = () => {
    setOpen(false);
    setPic(null);
    setView(START);
    setProblem(null);
    setConfirmRemove(false);
  };

  const load = (file: File | undefined | null) => {
    setProblem(null);
    if (!file) return;
    if (!TYPES.includes(file.type)) { setProblem("Choose a JPG, PNG or WEBP photo. iPhone HEIC photos: set the camera to “Most Compatible”, or take a screenshot of the photo."); return; }
    if (file.size > 25 * 1024 * 1024) { setProblem("This photo is over 25 MB. Choose a smaller one."); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { setPic({ img, url, w: img.naturalWidth, h: img.naturalHeight }); setView(START); };
    img.onerror = () => { URL.revokeObjectURL(url); setProblem("This photo could not be opened. Choose another one."); };
    img.src = url;
  };

  const save = async () => {
    if (!pic) return;
    setBusy(true);
    try {
      const blob = await cropToBlob(pic, view);
      const fd = new FormData();
      fd.set("photo", new File([blob], "profile.jpg", { type: "image/jpeg" }));
      const r = await saveMyPhoto(fd);
      if (!r?.ok) { setProblem(r?.message ?? "The photo could not be saved. Please try again."); return; }
      close();
      say("Photo saved", "success");
      router.refresh();
    } catch {
      setProblem("The photo could not be saved. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const r = await removeMyPhoto();
      close();
      say(r?.message ?? "Photo removed", "success");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  // Moving, pinching and the mouse wheel.
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const last = pointers.current.get(e.pointerId);
    if (!last || !pic) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      setView((v) => zoomTo(pic, v, pinch.current!.zoom * (dist / pinch.current!.dist)));
    } else if (pointers.current.size === 1) {
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      setView((v) => clampView(pic, { ...v, x: v.x + dx, y: v.y + dy }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!pic) return;
    setView((v) => zoomTo(pic, v, v.zoom * Math.exp(-e.deltaY * 0.0015)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!pic) return;
    const step = e.shiftKey ? 30 : 8;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); const [dx, dy] = moves[e.key]; setView((v) => clampView(pic, { ...v, x: v.x + dx, y: v.y + dy })); }
    if (e.key === "+" || e.key === "=") { e.preventDefault(); setView((v) => zoomTo(pic, v, v.zoom * 1.15)); }
    if (e.key === "-") { e.preventDefault(); setView((v) => zoomTo(pic, v, v.zoom / 1.15)); }
  };

  const g = pic ? geometry(pic, view) : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={src ? "Change my photo" : "Add my photo"}
        className="relative shrink-0 rounded-full group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <Avatar name={name} size={64} src={src} />
        <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-brand text-white grid place-items-center ring-2 ring-surface shadow-sm transition group-hover:scale-110">
          <I.Camera size={14} aria-hidden="true" />
        </span>
      </button>

      <Dialog open={open} onClose={close} title={src ? "Change my photo" : "Add my photo"}
        sub={pic ? "Drag to move it. Zoom with the slider, the mouse wheel or two fingers." : "Shown next to your name in School OS. Only people in this school see it."}
        footer={pic ? (
          <>
            <Button variant="secondary" onClick={() => { setPic(null); setView(START); }} disabled={busy}><Words k="Choose another" /></Button>
            <Button variant="primary" icon={I.Check} onClick={save} loading={busy} loadingText="Saving"><Words k="Save photo" /></Button>
          </>
        ) : undefined}>
        <input ref={pickRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />

        {!pic ? (
          <div className="flex flex-col gap-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); load(e.dataTransfer.files?.[0]); }}
              className={cx("rounded-2xl border-2 border-dashed p-6 flex flex-col items-center gap-3 text-center transition", dragOver ? "border-brand bg-brand/5" : "border-line")}>
              <Avatar name={name} size={96} src={src} />
              <p className="text-[14px] text-ink2">{touch ? "Choose a photo from your phone, or take a new one." : "Drop a photo here, or choose one from your computer."}</p>
              <div className="flex gap-2 flex-wrap justify-center">
                <Button variant="primary" icon={I.ImagePlus} onClick={() => pickRef.current?.click()}><Words k="Choose a photo" /></Button>
                {touch && <Button variant="secondary" icon={I.Camera} onClick={() => cameraRef.current?.click()}><Words k="Take a photo" /></Button>}
              </div>
              <p className="text-[12px] text-ink3"><Words k="JPG, PNG or WEBP. You can move and zoom it next." /></p>
            </div>
            {problem && <p role="alert" className="rounded-xl px-3.5 py-2.5 text-sm bg-bad/10 text-bad">{problem}</p>}
            {src && (
              confirmRemove ? (
                <div className="flex items-center gap-2 flex-wrap rounded-xl bg-sunken px-3.5 py-2.5">
                  <p className="text-[13.5px] flex-1 min-w-[10rem]"><Words k="Take your photo off? Your initials show instead." /></p>
                  <Button variant="secondary" size="sm" onClick={() => setConfirmRemove(false)} disabled={busy}><Words k="Keep it" /></Button>
                  <Button variant="danger" size="sm" onClick={remove} loading={busy} loadingText="Removing"><Words k="Remove photo" /></Button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmRemove(true)} className="self-center text-[13px] font-semibold text-bad hover:underline inline-flex items-center gap-1.5">
                  <I.Trash2 size={14} aria-hidden="true" /><Words k="Remove my photo" />
                </button>
              )
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div
              role="application"
              aria-label="Photo position. Drag, or use the arrow keys to move and plus or minus to zoom."
              tabIndex={0}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
              onWheel={onWheel} onKeyDown={onKey}
              className="relative overflow-hidden rounded-2xl bg-ink/90 cursor-grab active:cursor-grabbing touch-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              style={{ width: VIEW, height: VIEW }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local photo being cropped */}
              <img src={pic.url} alt="" draggable={false}
                className="absolute max-w-none pointer-events-none"
                style={{ left: VIEW / 2, top: VIEW / 2, width: pic.w, height: pic.h, transformOrigin: "0 0",
                  transform: `translate(${view.x}px, ${view.y}px) rotate(${view.turn * 90}deg) scale(${g!.scale}) translate(${-pic.w / 2}px, ${-pic.h / 2}px)` }} />
              {/* The round frame: everything outside it is dimmed. */}
              <div aria-hidden="true" className="absolute inset-0 rounded-full pointer-events-none" style={{ boxShadow: "0 0 0 999px rgb(0 0 0 / 0.55)" }} />
              <div aria-hidden="true" className="absolute inset-0 rounded-full pointer-events-none ring-2 ring-white/80" />
            </div>

            <div className="w-full max-w-[300px] flex items-center gap-3">
              <button type="button" aria-label="Zoom out" onClick={() => setView((v) => zoomTo(pic, v, v.zoom / 1.2))} className="w-8 h-8 rounded-lg grid place-items-center text-ink2 hover:bg-sunken"><I.ZoomOut size={17} aria-hidden="true" /></button>
              <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={view.zoom} aria-label="Zoom"
                onChange={(e) => setView((v) => zoomTo(pic, v, Number(e.target.value)))} className="flex-1 accent-[var(--brand)]" />
              <button type="button" aria-label="Zoom in" onClick={() => setView((v) => zoomTo(pic, v, v.zoom * 1.2))} className="w-8 h-8 rounded-lg grid place-items-center text-ink2 hover:bg-sunken"><I.ZoomIn size={17} aria-hidden="true" /></button>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={I.RotateCw} onClick={() => setView((v) => clampView(pic, { ...v, turn: (v.turn + 1) % 4 }))}><Words k="Rotate" /></Button>
              <Button variant="ghost" size="sm" icon={I.Undo2} onClick={() => setView(START)}><Words k="Reset" /></Button>
            </div>
            {problem && <p role="alert" className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-bad/10 text-bad">{problem}</p>}
          </div>
        )}
      </Dialog>
      {toast && <Toast key={toast.n} flash={{ message: toast.message, tone: toast.tone }} />}
    </>
  );
}
