"use client";

// Small pieces used across the Transport sheets: a segmented choice sent with
// the form, the stop location picker, a one-tap action button and a button
// that asks to confirm before running a server action.

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed, type LucideIcon } from "lucide-react";
import { useTyped } from "@/components/ui/url-sheet";
import { FieldShell, inputCls } from "@/components/ui/field";
import { Segmented, type SegOption } from "@/components/ui/controls";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import type { LatLng } from "@/lib/transport/geo";
import { TransportMap, type MapRoute } from "./map";

/** A segmented choice that is sent with the form as `name`. */
export function SegField({ name, label, options, start, required, onChange, help }: { name: string; label: string; options: readonly SegOption[]; start: string; required?: boolean; onChange?: (v: string) => void; help?: React.ReactNode }) {
  const t = useTyped(name, start);
  const [v, setV] = useState(t.value || start);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink2">{label}{required && <span className="text-bad" aria-hidden="true"> *</span>}</span>
      <Segmented label={label} value={v} onChange={(x) => { setV(x); onChange?.(x); }} options={options} className="w-full" />
      <input type="hidden" name={name} value={v} />
      {t.error ? <p className="text-[12.5px] text-bad">{t.error}</p> : help ? <p className="text-[12.5px] text-ink3">{help}</p> : null}
    </div>
  );
}

/**
 * A stop's location: "Use my current location" (standing at the stop), a tap
 * on the route sketch, or the numbers typed. Sent as `lat` and `lng`.
 */
export function LocationField({ start, sketch, names = { lat: "lat", lng: "lng" }, label = "Location", help = "Needed for arrival times, the geofence and the ‘bus arriving’ message" }: { start: { lat: number | null; lng: number | null }; sketch: { routes: MapRoute[]; school: (LatLng & { name: string }) | null } | null; names?: { lat: string; lng: string }; label?: string; help?: string }) {
  const tLat = useTyped(names.lat, start.lat);
  const tLng = useTyped(names.lng, start.lng);
  const [lat, setLat] = useState(tLat.value);
  const [lng, setLng] = useState(tLng.value);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const canSketch = Boolean(sketch && (sketch.routes.some((r) => r.stops.filter((s) => s.lat != null).length >= 1) && (sketch.school || sketch.routes.some((r) => r.stops.filter((s) => s.lat != null).length >= 2))));
  const [open, setOpen] = useState(false);
  const locate = () => {
    if (!("geolocation" in navigator)) { setProblem("This browser cannot share its location. Type the latitude and longitude."); return; }
    setLocating(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); setLocating(false); },
      (e) => { setLocating(false); setProblem(e.code === 1 ? "Location was not allowed. Allow location for this site, or type the numbers." : "The location could not be found. Try again outside, or type the numbers."); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const picked = lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null;
  const err = tLat.error ?? tLng.error;
  return (
    <FieldShell label={label} id="stop-lat" help={err ? undefined : help} error={err}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" icon={LocateFixed} onClick={locate} loading={locating} loadingText="Finding you…">Use my current location</Button>
        {canSketch && <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((x) => !x)} aria-expanded={open}>{open ? "Hide the sketch" : "Tap on the route sketch"}</Button>}
      </div>
      {problem && <p role="alert" className="text-[12.5px] text-bad">{problem}</p>}
      {open && sketch && (
        <div className="rounded-xl overflow-hidden border border-line/70 mt-1">
          <TransportMap routes={sketch.routes} school={sketch.school} selected={sketch.routes[0]?.id} labelStops picked={picked} onPick={(p) => { setLat(p.lat.toFixed(6)); setLng(p.lng.toFixed(6)); }} ariaLabel="Tap where the stop is" />
          <p className="px-3 py-2 text-[12px] text-ink3">Tap where the stop is, between the stops you know. Check it on a map after.</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 mt-1">
        <input id="stop-lat" name={names.lat} inputMode="decimal" placeholder="Latitude, like 17.4948" value={lat} onChange={(e) => setLat(e.target.value)} aria-label="Latitude" aria-invalid={tLat.error ? true : undefined} className={cx(inputCls(tLat.error), "h-11 tnum")} />
        <input name={names.lng} inputMode="decimal" placeholder="Longitude, like 78.3996" value={lng} onChange={(e) => setLng(e.target.value)} aria-label="Longitude" aria-invalid={tLng.error ? true : undefined} className={cx(inputCls(tLng.error), "h-11 tnum")} />
      </div>
      {picked && <a className="text-[12.5px] font-semibold text-brand hover:underline" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${picked.lat}&mlon=${picked.lng}#map=17/${picked.lat}/${picked.lng}`}>Check the point on a map</a>}
    </FieldShell>
  );
}

type Act = (prev: FormState<unknown>, fd: FormData) => Promise<FormState<unknown>>;

/** A button that runs one server action (Add fee, Start trip, Close alert...), showing its problem in place. */
export function ActButton({ action, fields, label, icon, variant = "secondary", size = "sm", className, pendingText }: { action: Act; fields: Record<string, string>; label: React.ReactNode; icon?: LucideIcon; variant?: ButtonVariant; size?: "sm" | "md" | "lg"; className?: string; pendingText?: string }) {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(action, null);
  return (
    <form action={run} className={cx("relative z-[1] inline-flex flex-col items-start gap-1", className)}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button type="submit" variant={variant} size={size} icon={icon} loading={pending} className={className?.includes("w-full") ? "w-full" : undefined}>{pending && pendingText ? pendingText : label}</Button>
      {state && !state.ok && <span className="text-[12px] text-bad max-w-[260px]" role="alert">{state.message}</span>}
    </form>
  );
}

/** A risky action: says exactly what will happen, then runs the server action (P4). */
export function ConfirmAct({ action, fields, trigger, triggerVariant = "secondary", title, children, confirmLabel, danger }: { action: Act; fields: Record<string, string>; trigger: React.ReactNode; triggerVariant?: ButtonVariant; title: string; children: React.ReactNode; confirmLabel: string; danger?: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <ConfirmButton trigger={trigger} triggerVariant={triggerVariant} title={title} confirmLabel={confirmLabel} confirmVariant={danger ? "danger" : "primary"}
      onConfirm={async () => {
        const fd = new FormData();
        for (const [k, v] of Object.entries(fields)) fd.set(k, v);
        const r = await action(null, fd);
        if (!r?.ok) return r?.message ?? "That did not work. Nothing was changed.";
        start(() => router.refresh());
      }}>
      {children}
    </ConfirmButton>
  );
}

/** A plain field with its own label for sheets that build their own controls. */
export function Plain({ label, id, children, help, error, required }: { label: string; id: string; children: React.ReactNode; help?: React.ReactNode; error?: string; required?: boolean }) {
  return <FieldShell label={label} id={id} help={help} error={error} required={required}>{children}</FieldShell>;
}
