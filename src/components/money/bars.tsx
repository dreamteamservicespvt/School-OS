"use client";

// Vertical bars, like the fee chart (design/ui-prototype/src/kit.jsx Bars).
// v2 is drawn behind as the "due" or "target" bar; with `pair`, v2 stands next to v
// in its own colour (tone2), like income and expenses. Hover or focus shows the numbers.

import { useState } from "react";

type BarTone = "brand" | "ok" | "warn" | "bad" | "info";
export type BarDatum = { k: string; v: number; v2?: number | null; tone?: BarTone; tone2?: BarTone; tip?: string };

export function Bars({ data, max, height = 170, ticks, tickLabel = (v: number) => String(v), ariaLabel, pair = false }: { data: BarDatum[]; max?: number; height?: number; ticks?: number[]; tickLabel?: (v: number) => string; ariaLabel: string; pair?: boolean }) {
  const W = 360, H = height, padL = 30, padB = 22, top = 8;
  const peak = Math.max(1, ...data.map((d) => Math.max(d.v, d.v2 ?? 0)));
  const mx = max ?? peak * 1.1;
  const y = (v: number) => top + (H - padB - top) * (1 - v / mx);
  const bw = (W - padL - 8) / Math.max(1, data.length);
  const tk = ticks ?? [0, mx / 3, (2 * mx) / 3].map((t) => Math.round(t));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
        {tk.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} style={{ stroke: "rgb(var(--line))" }} strokeDasharray={t ? "3 4" : ""} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" style={{ fill: "rgb(var(--ink-3))" }}>{tickLabel(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * bw + bw * 0.18, w = bw * 0.64, on = hover === i;
          // Side by side: two bars of 0.3 slot each with a small gap, centred in the slot.
          const pw = bw * 0.3, px1 = padL + i * bw + bw * 0.18, px2 = px1 + pw + bw * 0.04;
          const fade = hover == null || on ? 1 : 0.55;
          return (
            <g key={d.k + i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={d.tip ?? `${d.k}: ${d.v}${d.v2 != null ? (pair ? `, ${d.v2}` : ` of ${d.v2}`) : ""}`}>
              <rect x={padL + i * bw} y={top} width={bw} height={H - padB - top} fill="transparent" />
              {pair ? (
                <>
                  <rect x={px1} y={y(d.v)} width={pw} height={Math.max(0, y(0) - y(d.v))} rx="3" style={{ fill: `rgb(var(--${d.tone ?? "brand"}))`, opacity: fade }} />
                  {d.v2 != null && <rect x={px2} y={y(d.v2)} width={pw} height={Math.max(0, y(0) - y(d.v2))} rx="3" style={{ fill: `rgb(var(--${d.tone2 ?? "warn"}))`, opacity: fade }} />}
                </>
              ) : (
                <>
                  {d.v2 != null && <rect x={x} y={y(d.v2)} width={w} height={Math.max(0, y(0) - y(d.v2))} rx="4" style={{ fill: "rgb(var(--ink-3) / .22)" }} />}
                  <rect x={x} y={y(d.v)} width={w} height={Math.max(0, y(0) - y(d.v))} rx="4" style={{ fill: `rgb(var(--${d.tone ?? "brand"}))`, opacity: fade }} />
                </>
              )}
              <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fontWeight="500" style={{ fill: "rgb(var(--ink-2))" }}>{d.k}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && data[hover] && (
        <div className="absolute top-0 right-2 bg-ink text-bg rounded-lg px-2.5 py-1.5 text-[12px] shadow-pop pointer-events-none tnum" role="status">
          {data[hover].tip ?? <><b>{data[hover].k}</b> · {tickLabel(data[hover].v)}{data[hover].v2 != null ? (pair ? ` · ${tickLabel(data[hover].v2!)}` : ` of ${tickLabel(data[hover].v2!)}`) : ""}</>}
        </div>
      )}
    </div>
  );
}
