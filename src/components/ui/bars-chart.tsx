"use client";

import { useState } from "react";

// Vertical bars with a hover label (design/ui-prototype/src/kit.jsx Bars). Numbers are shown in Indian style.

export type BarDatum = { k: string; v: number; v2?: number; tone?: "brand" | "ok" | "warn" | "bad" | "info" };

const fmt = (v: number) => Math.round(v).toLocaleString("en-IN");

export function BarsChart({ data, max, height = 170, ariaLabel, ticks }: { data: BarDatum[]; max?: number; height?: number; ariaLabel: string; ticks?: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 360, H = height, padL = 30, padB = 22, top = 8;
  const mx = max || Math.max(1, ...data.map((d) => Math.max(d.v, d.v2 || 0))) * 1.1;
  const y = (v: number) => top + (H - padB - top) * (1 - v / mx);
  const bw = (W - padL - 8) / Math.max(1, data.length);
  const tk = [...new Set(ticks || [0, mx / 3, (2 * mx) / 3].map((t) => Math.round(t)))];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${ariaLabel}: ${data.map((d) => `${d.k} ${fmt(d.v)}`).join(", ")}`}>
        {tk.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} style={{ stroke: "rgb(var(--line))" }} strokeDasharray={t ? "3 4" : ""} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" style={{ fill: "rgb(var(--ink-3))" }}>{fmt(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * bw + bw * 0.18, w = bw * 0.64, on = hover === i;
          return (
            <g key={d.k} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={top} width={bw} height={H - padB - top} fill="transparent" />
              {d.v2 != null && <rect x={x} y={y(d.v2)} width={w} height={y(0) - y(d.v2)} rx="4" style={{ fill: "rgb(var(--ink-3) / .22)" }} />}
              <rect x={x} y={y(d.v)} width={w} height={Math.max(0, y(0) - y(d.v))} rx="4" style={{ fill: `rgb(var(--${d.tone || "brand"}))`, opacity: hover == null || on ? 1 : 0.55 }} />
              <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fontWeight="500" style={{ fill: "rgb(var(--ink-2))" }}>{d.k}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && data[hover] && (
        <div className="absolute top-0 right-2 bg-ink text-bg rounded-lg px-2.5 py-1.5 text-[12px] shadow-pop pointer-events-none tnum">
          <b>{data[hover].k}</b> · {fmt(data[hover].v)}{data[hover].v2 != null ? ` of ${fmt(data[hover].v2!)}` : ""}
        </div>
      )}
    </div>
  );
}
