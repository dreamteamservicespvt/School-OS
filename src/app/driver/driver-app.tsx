"use client";

// The driver page on the phone: today's own trips, Start trip, the stops in
// order with Reached and the students at each with Boarded / Not boarded /
// Dropped, End trip, the red Emergency button and Breakdown. While a trip
// runs and this page is open, the phone's location goes to the school every
// set interval (default 30 seconds) in batches. Offline, public/driver-sw.js
// keeps everything on the phone and sends it when back online.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Bus, CheckCircle2, CircleStop, LogOut, MapPin, Phone, Play, RefreshCw, Siren, Wifi, WifiOff, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { signOut } from "../(school)/actions";
import type { driverToday } from "@/lib/transport/driver-api";
import { clockOf } from "@/lib/transport/words";

/** A moment in the school's time, written like the planned times (7:15 AM). */
function timeOf(at: string | number | Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return clockOf(n("hour") * 60 + n("minute"));
}

type Today = Awaited<ReturnType<typeof driverToday>>;
type Trip = Today["trips"][number];
type Fix = { at: string; lat: number; lng: number; speed: number | null; heading: number | null; accuracy: number | null };

const API = "/api/v1/transport/driver";

function onlineSubscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
}
const STATUS: Record<string, { label: string; tone: "neutral" | "brand" | "ok" | "bad" }> = {
  SCHEDULED: { label: "Not started", tone: "neutral" }, STARTED: { label: "Running", tone: "brand" }, COMPLETED: { label: "Completed", tone: "ok" }, CANCELLED: { label: "Cancelled", tone: "bad" },
};

async function call(action: string, body: object): Promise<{ ok: boolean; queued?: boolean; problem?: string; [k: string]: unknown }> {
  try {
    const res = await fetch(`${API}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    const json = await res.json().catch(() => ({}));
    if (res.status === 202) return { ok: true, queued: true };
    if (!res.ok) return { ok: false, problem: json.problem ?? "That did not work. Try again." };
    return { ok: true, ...json };
  } catch {
    return { ok: false, problem: "No internet. Try again when the phone has signal." };
  }
}

export function DriverApp({ initial, schoolName, schoolPhone }: { initial: Today; schoolName: string; schoolPhone: string | null }) {
  const [data, setData] = useState(initial);
  const online = useSyncExternalStore(onlineSubscribe, () => navigator.onLine, () => true);
  const [queue, setQueue] = useState(0);
  const [note, setNote] = useState<{ tone: "ok" | "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsProblem, setGpsProblem] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [breakdown, setBreakdown] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const buffer = useRef<Fix[]>([]);
  const lastFix = useRef<Fix | null>(null);

  const running = data.trips.find((t) => t.status === "STARTED") ?? null;
  const runningId = running?.id ?? null;
  const isDriver = data.driver.role === "DRIVER";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/trips`, { credentials: "same-origin", cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch { /* offline: keep what is shown */ }
  }, []);

  // The helper that keeps things offline, and the online/offline state.
  useEffect(() => {
    const up = () => { navigator.serviceWorker?.controller?.postMessage({ type: "sos-driver-flush" }); refresh(); };
    const vis = () => setHidden(document.visibilityState === "hidden");
    window.addEventListener("online", up);
    document.addEventListener("visibilitychange", vis);
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "sos-driver-queue") {
        setQueue(e.data.size ?? 0);
        if (e.data.sent) refresh();
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/driver-sw.js", { scope: "/driver" }).then(() => navigator.serviceWorker.controller?.postMessage({ type: "sos-driver-size" })).catch(() => undefined);
      navigator.serviceWorker.addEventListener("message", onMsg);
    }
    return () => {
      window.removeEventListener("online", up);
      document.removeEventListener("visibilitychange", vis);
      navigator.serviceWorker?.removeEventListener("message", onMsg);
    };
  }, [refresh]);

  // While a trip runs: the phone's location, sent in batches at the school's interval; the screen kept on.
  useEffect(() => {
    if (!runningId || !isDriver) return;
    if (!("geolocation" in navigator)) {
      const t = window.setTimeout(() => setGpsProblem("This phone cannot share its location."), 0);
      return () => window.clearTimeout(t);
    }
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        const f: Fix = { at: new Date(p.timestamp).toISOString(), lat: p.coords.latitude, lng: p.coords.longitude, speed: p.coords.speed != null ? Math.round(p.coords.speed * 3.6 * 10) / 10 : null, heading: p.coords.heading ?? null, accuracy: p.coords.accuracy ?? null };
        lastFix.current = f;
        setFix(f);
        setGpsProblem(null);
        const prev = buffer.current[buffer.current.length - 1];
        if (!prev || prev.at !== f.at) buffer.current.push(f);
      },
      (e) => setGpsProblem(e.code === e.PERMISSION_DENIED ? "Location is blocked. Allow location for this site in the phone's settings." : "Waiting for the phone's location…"),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
    const send = async () => {
      if (!buffer.current.length) return;
      const points = buffer.current.splice(0, buffer.current.length);
      const r = await call("points", { tripId: runningId, points });
      if (!r.ok && !r.queued) buffer.current.unshift(...points.slice(-200));
    };
    const timer = window.setInterval(send, Math.max(10, data.settings.intervalSec) * 1000);
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => undefined);
    return () => {
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(timer);
      void send();
      lock?.release().catch(() => undefined);
    };
  }, [runningId, isDriver, data.settings.intervalSec]);

  async function act(key: string, action: string, body: object, done: string) {
    setBusy(key);
    setNote(null);
    const r = await call(action, body);
    setBusy(null);
    if (r.queued) setNote({ tone: "info", text: `${done} Saved on this phone; it will send when the phone is online.` });
    else if (!r.ok) setNote({ tone: "bad", text: r.problem ?? "That did not work." });
    else setNote({ tone: "ok", text: done });
    await refresh();
    return r;
  }

  async function endTrip(t: Trip) {
    if (!window.confirm(`End ${t.title}? The bus stops sending its location.`)) return;
    // Send the last locations first.
    if (buffer.current.length) {
      const points = buffer.current.splice(0, buffer.current.length);
      await call("points", { tripId: t.id, points });
    }
    await act(`end:${t.id}`, "end", { tripId: t.id }, "Trip ended.");
  }

  async function emergency(t: Trip) {
    if (!window.confirm("Send an emergency alert to the Transport In-charge and the Principal now?")) return;
    const f = lastFix.current;
    await act(`sos:${t.id}`, "emergency", { tripId: t.id, lat: f?.lat ?? null, lng: f?.lng ?? null }, "Emergency alert sent. The school will call you.");
  }

  async function sendBreakdown(t: Trip) {
    const f = lastFix.current;
    const r = await act(`bd:${t.id}`, "breakdown", { tripId: t.id, reason, lat: f?.lat ?? null, lng: f?.lng ?? null }, "Breakdown reported. The school will arrange another vehicle.");
    if (r.ok) { setBreakdown(null); setReason(""); }
  }

  return (
    <main className="min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-10 bg-surface border-b border-line px-4 py-3 flex items-center gap-3">
        <span className="grid place-items-center size-10 rounded-xl bg-brand/10 text-brand shrink-0"><Bus size={20} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{data.driver.name}</p>
          <p className="text-[12.5px] text-ink2 truncate">{schoolName} · {data.driver.role === "DRIVER" ? "Driver" : "Attendant"}</p>
        </div>
        <Pill tone={online ? "ok" : "warn"} dot>{online ? <span className="inline-flex items-center gap-1"><Wifi size={13} aria-hidden="true" />Online</span> : <span className="inline-flex items-center gap-1"><WifiOff size={13} aria-hidden="true" />Offline</span>}</Pill>
      </header>

      <div className="mx-auto max-w-xl px-4 py-4 flex flex-col gap-4">
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink2">
          Keep this page open with the screen on during a trip: the bus&rsquo;s location is sent only while it is open. For tracking with the screen off, use the School OS Driver app for Android.
        </p>
        {queue > 0 && <p role="status" className="rounded-xl bg-warn/12 text-warn px-4 py-3 text-[13px] font-medium">{queue} {queue === 1 ? "update is" : "updates are"} saved on this phone and will send when online.</p>}
        {note && <p role="status" className={`rounded-xl px-4 py-3 text-[13px] font-medium ${note.tone === "ok" ? "bg-ok/10 text-ok" : note.tone === "bad" ? "bg-bad/10 text-bad" : "bg-info/10 text-info"}`}>{note.text}</p>}
        {running && hidden && <p className="rounded-xl bg-warn/12 text-warn px-4 py-3 text-[13px]">The page was in the background, so some locations may be missing.</p>}

        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Today&rsquo;s trips</h1>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refresh()}>Refresh</Button>
        </div>

        {data.trips.length === 0 && <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-ink2">No trips for you today.</p>}

        {data.trips.map((t) => {
          const st = STATUS[t.status] ?? STATUS.SCHEDULED;
          const isRun = t.status === "STARTED";
          const morning = t.kind === "MORNING";
          return (
            <section key={t.id} className="rounded-2xl border border-line bg-surface overflow-hidden">
              <div className="px-4 py-3 flex items-start gap-3 border-b border-line">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{t.title}</h2>
                  <p className="text-[13px] text-ink2">{t.route.name} · starts {t.plannedStart}{t.vehicle ? ` · ${t.vehicle.number}` : ""}</p>
                </div>
                <Pill tone={st.tone}>{st.label}</Pill>
              </div>

              {t.status === "SCHEDULED" && isDriver && !running && (
                <div className="p-4"><Button size="lg" className="w-full" icon={Play} loading={busy === `start:${t.id}`} loadingText="Starting…" onClick={() => act(`start:${t.id}`, "start", { tripId: t.id }, "Trip started. Keep this page open.")}>Start trip</Button></div>
              )}

              {isRun && (
                <div className="px-4 py-3 border-b border-line text-[13px] text-ink2 flex items-center gap-2">
                  <MapPin size={15} aria-hidden="true" className={fix ? "text-ok" : "text-warn"} />
                  {isDriver ? (gpsProblem ?? (fix ? `Location sent every ${data.settings.intervalSec} seconds · last ${timeOf(fix.at, data.timeZone)}${fix.speed != null ? ` · ${Math.round(fix.speed)} km/h` : ""}` : "Finding the phone's location…")) : "The driver's phone sends the location."}
                </div>
              )}

              {(isRun || t.status === "COMPLETED") && (
                <ol className="divide-y divide-line">
                  {t.stops.map((s) => (
                    <li key={s.id} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{s.name}</p>
                          <p className="text-[12.5px] text-ink2">{s.planned}{s.reached ? ` · ${s.reached.status === "MISSED" ? "missed" : `reached ${timeOf(s.reached.at, data.timeZone)}`}` : ""}</p>
                        </div>
                        {isRun && !s.reached && <Button size="sm" variant="secondary" icon={CheckCircle2} loading={busy === `stop:${s.id}`} onClick={() => act(`stop:${s.id}`, "reached", { tripId: t.id, stopId: s.id, at: new Date().toISOString() }, `${s.name} reached.`)}>Reached</Button>}
                      </div>
                      {s.students.length > 0 && (
                        <ul className="mt-2 flex flex-col gap-2">
                          {s.students.map((k) => (
                            <li key={k.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-sunken px-3 py-2">
                              <span className="min-w-0 flex-1 text-sm">{k.name}{k.status && <span className="ml-2 text-[12px] text-ink2">{k.status === "BOARDED" ? "Boarded" : k.status === "DROPPED" ? "Dropped" : "Not boarded"}</span>}</span>
                              {k.phone && <a href={`tel:${k.phone}`} className="text-[12.5px] text-brand inline-flex items-center gap-1"><Phone size={13} aria-hidden="true" />Parent</a>}
                              {isRun && (morning ? (
                                <>
                                  {k.status !== "BOARDED" && <Button size="sm" variant="soft" onClick={() => act(`b:${k.id}`, "boarding", { tripId: t.id, studentId: k.id, status: "BOARDED" }, `${k.name} boarded.`)}>Boarded</Button>}
                                  {k.status !== "NOT_BOARDED" && <Button size="sm" variant="ghost" onClick={() => act(`n:${k.id}`, "boarding", { tripId: t.id, studentId: k.id, status: "NOT_BOARDED" }, `${k.name} did not board.`)}>Not boarded</Button>}
                                </>
                              ) : (
                                <>
                                  {!k.status && <Button size="sm" variant="soft" onClick={() => act(`b:${k.id}`, "boarding", { tripId: t.id, studentId: k.id, status: "BOARDED" }, `${k.name} boarded.`)}>Boarded</Button>}
                                  {k.status !== "DROPPED" && <Button size="sm" variant="soft" onClick={() => act(`d:${k.id}`, "boarding", { tripId: t.id, studentId: k.id, status: "DROPPED" }, `${k.name} dropped.`)}>Dropped</Button>}
                                </>
                              ))}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              )}

              {isRun && (
                <div className="p-4 flex flex-col gap-3 border-t border-line">
                  {isDriver && <Button size="lg" variant="secondary" icon={CircleStop} loading={busy === `end:${t.id}`} onClick={() => endTrip(t)}>End trip</Button>}
                  {online ? (
                    <Button size="lg" variant="danger" icon={Siren} loading={busy === `sos:${t.id}`} onClick={() => emergency(t)}>Emergency</Button>
                  ) : (
                    schoolPhone && <a href={`tel:${schoolPhone}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-bad text-badink h-12 font-semibold"><Phone size={18} aria-hidden="true" />No internet: call the school</a>
                  )}
                  {breakdown === t.id ? (
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`bd-${t.id}`} className="text-sm font-medium">What happened?</label>
                      <textarea id={`bd-${t.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={200} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm" />
                      <div className="flex gap-2">
                        <Button variant="danger-soft" icon={Wrench} loading={busy === `bd:${t.id}`} disabled={reason.trim().length < 3 || !online} onClick={() => sendBreakdown(t)}>Report breakdown</Button>
                        <Button variant="ghost" onClick={() => setBreakdown(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="ghost" icon={AlertTriangle} onClick={() => setBreakdown(t.id)}>Report a breakdown</Button>
                  )}
                </div>
              )}
            </section>
          );
        })}

        <form action={signOut} onSubmit={() => navigator.serviceWorker?.controller?.postMessage({ type: "sos-clear" })} className="pt-2">
          <Button type="submit" variant="ghost" icon={LogOut} className="w-full">Sign out</Button>
        </form>
      </div>
    </main>
  );
}
