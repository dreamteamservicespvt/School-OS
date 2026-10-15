"use client";

// Live Tracking in the browser: the page refreshes itself at the school's
// location interval while it is open and visible, route history playback
// with a time slider, and closing an alert with a note.

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetForm } from "@/components/ui/url-sheet";
import { SArea } from "@/components/ui/sheet-fields";
import type { LatLng } from "@/lib/transport/geo";
import { closeAlertAction } from "../actions";
import { TransportMap, type MapRoute } from "./map";

/** Refreshes the page every `seconds` while it is visible; says when it last did. */
export function AutoRefresh({ seconds, at }: { seconds: number; at: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") start(() => router.refresh()); };
    const t = setInterval(tick, Math.max(10, seconds) * 1000);
    const back = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", back); };
  }, [router, seconds]);
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink3" aria-live="polite">
      <RefreshCw size={13} className={pending ? "animate-spin" : undefined} aria-hidden="true" />
      Updated {at} · every {seconds} seconds
    </span>
  );
}

export type ReplayPoint = { at: string; time: string; lat: number; lng: number; speed: number | null };

/** Route history playback: the path of a past trip, played with its times (12 §9 Done when 9). */
export function Playback({ route, school, points }: { route: MapRoute; school: (LatLng & { name: string }) | null; points: ReplayPoint[] }) {
  const [i, setI] = useState(points.length ? points.length - 1 : 0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setI((x) => { if (x >= points.length - 1) { setPlaying(false); return x; } return x + 1; }), 120);
    return () => clearInterval(t);
  }, [playing, points.length]);
  const path = useMemo(() => points.slice(0, i + 1).map((p) => ({ lat: p.lat, lng: p.lng })), [points, i]);
  if (!points.length) return <p className="text-[14px] text-ink3 rounded-xl bg-sunken/60 px-4 py-6 text-center">No locations were kept for this trip. Locations are kept only while a trip is running.</p>;
  const p = points[i];
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl overflow-hidden border border-line/70">
        <TransportMap routes={[route]} school={school} selected={route.id} path={path}
          buses={[{ id: "replay", routeId: route.id, label: String(route.number), lat: p.lat, lng: p.lng, tone: "brand", title: `At ${p.time}` }]} ariaLabel={`Path of Route ${route.number} up to ${p.time}`} />
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" icon={playing ? Pause : Play} onClick={() => { if (!playing && i >= points.length - 1) setI(0); setPlaying((x) => !x); }}>{playing ? "Pause" : "Play"}</Button>
        <label htmlFor="replay-at" className="sr-only">Time on the trip</label>
        <input id="replay-at" type="range" min={0} max={points.length - 1} value={i} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} className="flex-1 accent-[rgb(var(--brand))]" />
        <span className="text-[13.5px] font-semibold tnum w-20 text-right">{p.time}</span>
      </div>
      <p className="text-[12.5px] text-ink3">{points.length} locations · {points[0].time} to {points[points.length - 1].time}{p.speed != null ? ` · ${Math.round(p.speed)} km/h at ${p.time}` : ""}</p>
    </div>
  );
}

export function CloseAlertSheet({ closeHref, alert }: { closeHref: string; alert: { id: string; text: string } }) {
  return (
    <SheetForm title="Close alert" sub={alert.text} closeHref={closeHref} action={closeAlertAction} submitLabel="Close alert" pendingText="Closing…" hidden={{ alertId: alert.id }}>
      <SArea name="note" label="What was done" rows={2} maxLength={200} placeholder="Called the driver; traffic at the flyover" />
    </SheetForm>
  );
}
