"use client";

import { useState } from "react";
import { cx } from "./cx";

// Small charts of the approved design (design/ui-prototype/src/kit.jsx HBars, Bars).

/** Horizontal bars with labels. goal shows a tick; values below lowBelow turn amber. */
export function HBars({ rows, max = 100, goal, unit = "%", lowBelow, labelWidth = 64 }: { rows: { k: string; v: number; label?: string }[]; max?: number; goal?: number; unit?: string; lowBelow?: number; labelWidth?: number }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const low = lowBelow != null && r.v < lowBelow;
        return (
          <li key={r.k} className="grid items-center gap-3 text-[13px]" style={{ gridTemplateColumns: `${labelWidth}px 1fr 52px` }}>
            <span className="text-ink2 font-medium truncate" title={r.k}>{r.k}</span>
            <span className="relative h-3 rounded-full bg-sunken overflow-hidden" aria-hidden="true">
              <span className={cx("absolute inset-y-0 left-0 rounded-full", low ? "bg-warn" : "bg-brand")} style={{ width: `${Math.max(0, Math.min(100, (r.v / (max || 1)) * 100))}%` }} />
              {goal != null && <span className="absolute inset-y-0 w-px bg-ink3/50" style={{ left: `${(goal / max) * 100}%` }} />}
            </span>
            <span className={cx("text-right font-semibold tnum", low && "text-warn")}>{r.label ?? `${r.v}${unit}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Vertical bars. data: [{ k, v, tone? }]. */
export function Bars({ data, max, height = 170, unit = "", ariaLabel = "Chart", ticks }: { data: { k: string; v: number; tone?: "brand" | "ok" | "warn" | "bad" | "info" }[]; max?: number; height?: number; unit?: string; ariaLabel?: string; ticks?: number[] }) {
  const W = 360, H = height, padL = 30, padB = 22, top = 8;
  const label = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`;
  const mx = max || Math.max(1, ...data.map((d) => d.v)) * 1.1;
  const y = (v: number) => top + (H - padB - top) * (1 - v / mx);
  const bw = (W - padL - 8) / Math.max(1, data.length);
  const tk = ticks ?? [0, mx / 3, (2 * mx) / 3].map((t) => Math.round(t));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${ariaLabel}: ${data.map((d) => `${d.k} ${label(d.v)}`).join(", ")}`}>
        {tk.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} style={{ stroke: "rgb(var(--line))" }} strokeDasharray={t ? "3 4" : ""} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" style={{ fill: "rgb(var(--ink-3))" }}>{label(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * bw + bw * 0.18, w = bw * 0.64, on = hover === i;
          return (
            <g key={d.k} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={top} width={bw} height={H - padB - top} fill="transparent" />
              <rect x={x} y={y(d.v)} width={w} height={Math.max(0, y(0) - y(d.v))} rx="4" style={{ fill: `rgb(var(--${d.tone || "brand"}))`, opacity: hover == null || on ? 1 : 0.55 }} />
              <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fontWeight="500" style={{ fill: "rgb(var(--ink-2))" }}>{d.k}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && data[hover] && (
        <div className="absolute top-0 right-2 bg-ink text-bg rounded-lg px-2.5 py-1.5 text-[12px] shadow-pop pointer-events-none tnum">
          <b>{data[hover].k}</b> · {label(data[hover].v)}
        </div>
      )}
    </div>
  );
}
