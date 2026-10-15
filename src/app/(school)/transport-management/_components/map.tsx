"use client";

// The bus map without an outside map service (no paid map key): routes are
// drawn from their stops' own locations as a sketch, north up, with the
// school, the buses and the path travelled. Theme colours only, so it reads
// in light and dark mode. Where stops have no location yet, the trip line
// below shows the same progress stop by stop.

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { School } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { pathOf, projector, type LatLng } from "@/lib/transport/geo";

export type MapStop = { id: string; name: string; lat: number | null; lng: number | null; reached?: boolean; next?: boolean };
export type MapRoute = { id: string; number: number; name: string; stops: MapStop[] };
export type MapBus = { id: string; routeId: string; label: string; lat: number; lng: number; tone: "ok" | "warn" | "bad" | "info" | "neutral" | "brand"; stale?: boolean; moving?: boolean; title: string; href?: string };

const TONE_FILL: Record<MapBus["tone"], string> = { ok: "fill-ok", warn: "fill-warn", bad: "fill-bad", info: "fill-info", neutral: "fill-ink3", brand: "fill-brand" };

const W = 640;
const H = 380;

/** Places with a location, in trip order (morning: stops then school). */
const placed = (stops: MapStop[]) => stops.filter((s) => s.lat != null && s.lng != null) as (MapStop & LatLng)[];

export function TransportMap({ routes, school, selected, buses = [], path, labelStops, onPick, picked, ariaLabel = "Sketch of the bus routes", height }: {
  routes: MapRoute[];
  school: (LatLng & { name: string }) | null;
  selected?: string | null;
  buses?: MapBus[];
  /** A path travelled (route history playback), drawn over the route. */
  path?: LatLng[];
  labelStops?: boolean;
  /** Tapping the sketch gives a location (setting a stop's place). */
  onPick?: (p: LatLng) => void;
  picked?: LatLng | null;
  ariaLabel?: string;
  height?: number;
}) {
  const router = useRouter();
  const all = useMemo(() => {
    const pts: LatLng[] = [];
    for (const r of routes) pts.push(...placed(r.stops));
    if (school) pts.push(school);
    for (const b of buses) pts.push(b);
    if (path) pts.push(...path);
    if (picked) pts.push(picked);
    return pts;
  }, [routes, school, buses, path, picked]);
  const project = useMemo(() => projector(all, { w: W, h: H, pad: 34 }), [all]);
  if (!project) {
    return (
      <div className="grid place-items-center text-center px-6 py-10 bg-sunken/60 text-[13.5px] text-ink3" style={{ minHeight: height ?? 200 }}>
        <p>No stop has a location yet. Set stop locations in Routes &amp; Stops to see the routes here.</p>
      </div>
    );
  }
  const sel = routes.find((r) => r.id === selected) ?? null;
  const line = (r: MapRoute) => {
    const pts = placed(r.stops).map(project);
    if (school) pts.push(project(school));
    return pathOf(pts);
  };
  const sp = school ? project(school) : null;
  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPick) return;
    const svg = e.currentTarget;
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const y = ((e.clientY - box.top) / box.height) * H;
    onPick(project.back(x, y));
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cx("w-full h-auto block select-none", onPick && "cursor-crosshair")} role="img" aria-label={ariaLabel} onClick={onPick ? pick : undefined}>
      <rect x="0" y="0" width={W} height={H} className="fill-sunken" />
      {/* Light grid so distances read like a map. */}
      {Array.from({ length: 9 }, (_, i) => <path key={`g${i}`} d={`M${(i + 1) * 64},0 L${(i + 1) * 64},${H}`} className="stroke-line" strokeWidth="1" />)}
      {Array.from({ length: 5 }, (_, i) => <path key={`h${i}`} d={`M0,${(i + 1) * 64} L${W},${(i + 1) * 64}`} className="stroke-line" strokeWidth="1" />)}
      {routes.map((r) => <path key={`base${r.id}`} d={line(r)} fill="none" strokeWidth="11" strokeLinejoin="round" strokeLinecap="round" className="stroke-line" />)}
      {routes.map((r) => <path key={`road${r.id}`} d={line(r)} fill="none" strokeWidth="7.5" strokeLinejoin="round" strokeLinecap="round" className="stroke-surface" />)}
      {routes.filter((r) => r.id !== sel?.id).map((r) => <path key={`l${r.id}`} d={line(r)} fill="none" strokeWidth="2.5" strokeLinejoin="round" className="stroke-ink3/55" />)}
      {sel && <path d={line(sel)} fill="none" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round" className="stroke-brand" strokeDasharray={path ? "2 7" : undefined} />}
      {path && path.length > 1 && <path d={pathOf(path.map(project))} fill="none" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" className="stroke-brand" />}
      {/* Route numbers at each route's first stop. */}
      {!sel && routes.map((r) => {
        const first = placed(r.stops)[0];
        if (!first) return null;
        const q = project(first);
        return (
          <g key={`t${r.id}`}>
            <circle cx={q.x} cy={q.y} r="11" strokeWidth="2" className="fill-brand stroke-surface" />
            <text x={q.x} y={q.y + 4} textAnchor="middle" fontSize="11" fontWeight="800" className="fill-brandink">{r.number}</text>
          </g>
        );
      })}
      {sel && placed(sel.stops).map((s) => {
        const q = project(s);
        return (
          <g key={s.id}>
            <circle cx={q.x} cy={q.y} r={s.next ? 6 : 4.8} strokeWidth="2" className={cx(s.reached ? "fill-brand" : "fill-surface", "stroke-brand")}><title>{s.name}</title></circle>
            {(labelStops || s.next) && <text x={q.x + (q.x > W * 0.66 ? -9 : 9)} y={q.y - 8} textAnchor={q.x > W * 0.66 ? "end" : "start"} fontSize={s.next ? 11 : 10} fontWeight="700" className={cx(s.next ? "fill-brand" : "fill-ink2", "stroke-sunken")} strokeWidth="3.5" paintOrder="stroke" strokeLinejoin="round">{s.next ? `Next: ${s.name}` : s.name}</text>}
          </g>
        );
      })}
      {sp && (
        <g>
          <rect x={sp.x - 14} y={sp.y - 14} width="28" height="28" rx="8" strokeWidth="2.5" className="fill-brand stroke-surface" />
          <School x={sp.x - 8} y={sp.y - 8} width={16} height={16} className="text-brandink" aria-hidden="true" />
          <text x={sp.x + (sp.x > W * 0.6 ? -20 : 20)} y={sp.y - 6} textAnchor={sp.x > W * 0.6 ? "end" : "start"} fontSize="11" fontWeight="700" className="fill-ink stroke-sunken" strokeWidth="3.5" paintOrder="stroke" strokeLinejoin="round">{school!.name}</text>
        </g>
      )}
      {picked && (() => { const q = project(picked); return <g><circle cx={q.x} cy={q.y} r="9" className="fill-bad/25" /><circle cx={q.x} cy={q.y} r="5" strokeWidth="2" className="fill-bad stroke-surface" /></g>; })()}
      {buses.map((b) => {
        const q = project(b);
        const body = (
          <g opacity={b.stale ? 0.45 : 1}>
            <title>{b.title}</title>
            {b.moving && !b.stale && <circle cx={q.x} cy={q.y} r="19" className={cx(TONE_FILL[b.tone], "opacity-20 animate-pulse")} />}
            {b.routeId === selected && <circle cx={q.x} cy={q.y} r="16.5" fill="none" strokeWidth="2.2" className="stroke-ink" />}
            <circle cx={q.x} cy={q.y} r="12" strokeWidth="2" className={cx(TONE_FILL[b.tone], "stroke-surface")} />
            <text x={q.x} y={q.y + 4} textAnchor="middle" fontSize="11.5" fontWeight="800" className="fill-surface">{b.label}</text>
          </g>
        );
        return b.href ? (
          <g key={b.id} role="link" tabIndex={0} aria-label={b.title} className="cursor-pointer focus:outline-none"
            onClick={(e) => { e.stopPropagation(); router.replace(b.href!, { scroll: false }); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.replace(b.href!, { scroll: false }); } }}>{body}</g>
        ) : <g key={b.id}>{body}</g>;
      })}
    </svg>
  );
}

/**
 * The trip line: every stop of a trip in order with reached ones filled and
 * the bus between the last reached stop and the next. Works with or without
 * stop locations (the map-free view of a trip).
 */
export function TripLine({ stops, bus, end, ariaLabel }: { stops: { id: string; name: string; reached: boolean; missed?: boolean }[]; bus: "none" | "between" | "end"; end: string; ariaLabel: string }) {
  const n = stops.length + 1;
  const lastReached = stops.reduce((m, s, i) => (s.reached || s.missed ? i : m), -1);
  const pos = bus === "end" ? n - 1 : bus === "between" ? Math.min(n - 1, lastReached + 0.5) : -1;
  const x = (i: number) => 14 + (i / Math.max(1, n - 1)) * 572;
  return (
    <svg viewBox="0 0 600 40" className="w-full h-auto block" role="img" aria-label={ariaLabel}>
      <path d={`M${x(0)},20 L${x(n - 1)},20`} className="stroke-line" strokeWidth="4" strokeLinecap="round" />
      {lastReached >= 0 && <path d={`M${x(0)},20 L${x(bus === "end" ? n - 1 : lastReached)},20`} className="stroke-brand" strokeWidth="4" strokeLinecap="round" />}
      {stops.map((s, i) => (
        <circle key={s.id} cx={x(i)} cy="20" r="5" strokeWidth="2" className={cx(s.missed ? "fill-warn stroke-warn" : s.reached ? "fill-brand stroke-brand" : "fill-surface stroke-ink3")}><title>{`${s.name}${s.missed ? " · missed" : s.reached ? " · reached" : ""}`}</title></circle>
      ))}
      <rect x={x(n - 1) - 6} y="14" width="12" height="12" rx="3" className="fill-brand"><title>{end}</title></rect>
      {pos >= 0 && (
        <g>
          <circle cx={x(pos)} cy="20" r="10" strokeWidth="2" className="fill-ink stroke-surface" />
          <path d={`M${x(pos) - 4},17 h8 v5 h-8z`} className="fill-surface" />
        </g>
      )}
    </svg>
  );
}
