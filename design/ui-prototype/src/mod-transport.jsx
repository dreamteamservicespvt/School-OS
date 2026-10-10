// Transport Management (optional module, switched on for Sunrise Public School). Example data only.
import React, { useEffect, useMemo, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, FEATURED, inr } from './data.js';
import { ROUTES } from './sample.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Input, Field, Segmented, Empty, Sheet, Switch, useToast } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import {
  ModuleHead, useCanEdit, Stats, Band, SearchBox, Toolbar, Select, Textarea, Chips, DataList, BulkBar, SettingRow, SettingsCard,
  Banner, Suggestion, Progress, HBars, Bars, Legend, DL, Timeline, MoreMenu, FormSheet, ConfirmSheet, Split, Col, ExportButton, TONE_SOFT,
} from './kit.jsx';

/* ======================= Sample data ======================= */
const T = (h, m) => h * 60 + m;
const fmt = (m) => { const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const oneWay = (f) => Math.round((f * 0.6) / 50) * 50;
const SCHOOL_XY = [352, 236];
const EVENING = T(15, 50);

// Per route: attendant, driver phone, morning times, arrival at school, and stops as [name, x, y, students, monthly two-way fee]
const RX = {
  R1: { area: 'KPHB', attendant: 'Saraswathi', phone: '98481 20734', school: T(7, 52),
    pick: [T(7, 14), T(7, 18), T(7, 22), T(7, 26), T(7, 30), T(7, 34), T(7, 38), T(7, 42), T(7, 46)],
    stops: [['Forum Mall', 466, 366, 6, 2000], ['KPHB 9th Phase', 444, 350, 5, 2000], ['Vasanth Nagar', 426, 334, 7, 1800], ['KPHB 4th Phase', 412, 318, 4, 1800], ['Remedy Hospital', 400, 302, 6, 1800], ['KPHB 3rd Phase', 390, 288, 5, 1600], ['KPHB 1st Phase', 380, 274, 4, 1600], ['Balaji Nagar', 372, 262, 5, 1600], ['Kukatpally Bus Depot', 364, 250, 4, 1600]] },
  R2: { area: 'Nizampet', attendant: 'Yellamma', phone: '99636 41820', school: T(8, 5),
    pick: [T(7, 22), T(7, 27), T(7, 32), T(7, 37), T(7, 42), T(7, 47), T(7, 53), T(7, 58)],
    stops: [['Nizampet Village', 520, 34, 5, 2400], ['Bandari Layout', 494, 60, 6, 2400], ['Sai Anurag Colony', 468, 86, 4, 2200], ['Nizampet X Roads', 444, 112, 7, 2200], ['KNR Colony', 420, 138, 5, 2000], ['Prashanthi Nagar', 400, 164, 6, 2000], ['Shamshiguda', 382, 190, 4, 1800], ['Addagutta', 366, 214, 4, 1800]] },
  R3: { area: 'Bachupally', attendant: 'Anjamma', phone: '90004 71236', school: T(8, 10),
    pick: [T(7, 30), T(7, 36), T(7, 42), T(7, 47), T(7, 52), T(7, 57), T(8, 2)],
    stops: [['Bachupally X Roads', 262, 22, 6, 2600], ['Mallampet Road', 276, 52, 5, 2600], ['Bowrampet Road', 290, 82, 7, 2400], ['Pragathi Nagar Kaman', 304, 112, 6, 2200], ['Pragathi Nagar Lake', 318, 142, 5, 2200], ['JNTU Back Gate', 330, 174, 5, 2000], ['Kukatpally Village', 342, 206, 4, 1800]] },
  R4: { area: 'Miyapur', attendant: 'Sujatha', phone: '99120 33671', school: T(8, 8),
    pick: [T(7, 12), T(7, 17), T(7, 22), T(7, 27), T(7, 32), T(7, 37), T(7, 42), T(7, 48), T(7, 54), T(7, 59)],
    stops: [['Miyapur Metro Depot', 70, 70, 4, 2600], ['Miyapur X Roads', 102, 92, 6, 2600], ['Madinaguda', 134, 110, 5, 2600], ['Deepthisri Nagar', 164, 128, 4, 2400], ['Allwyn X Roads', 196, 144, 6, 2400], ['Hydernagar', 226, 160, 5, 2400], ['KPHB 6th Phase', 256, 176, 7, 2200], ['KPHB 7th Phase', 284, 192, 4, 2200], ['JNTU Metro', 308, 206, 5, 1800], ['Vivekananda Nagar', 330, 220, 3, 1800]] },
  R5: { area: 'Moosapet', attendant: 'Padmavathi', phone: '98853 60219', school: T(8, 12),
    pick: [T(7, 40), T(7, 46), T(7, 52), T(7, 58), T(8, 2), T(8, 6)],
    stops: [['Bharat Nagar', 600, 330, 6, 2400], ['Moosapet Metro', 560, 316, 7, 2200], ['Moosapet X Roads', 520, 300, 5, 2200], ['Y Junction', 480, 284, 6, 2000], ['Balanagar Road', 440, 268, 5, 1800], ['Kukatpally Metro', 400, 252, 4, 1600]] },
  R6: { area: 'Chandanagar', attendant: 'Renuka', phone: '97010 88342', school: T(8, 15),
    pick: [T(7, 25), T(7, 31), T(7, 37), T(7, 43), T(7, 49), T(7, 54), T(7, 59), T(8, 4), T(8, 8)],
    stops: [['Lingampally Station', 36, 258, 5, 2800], ['Gangaram', 70, 254, 6, 2600], ['Chandanagar', 104, 250, 5, 2600], ['PJR Nagar', 138, 254, 4, 2400], ['Hafeezpet', 172, 262, 6, 2400], ['Madhava Nagar', 208, 266, 5, 2200], ['Allwyn Colony', 244, 262, 4, 2200], ['Sardar Patel Nagar', 280, 256, 5, 2000], ['Ramnagar Gundu', 316, 246, 4, 1800]] },
};
const TR = ROUTES.map((r) => {
  const x = RX[r.id];
  return {
    ...r, ...x, num: r.id.slice(1), short: r.name.split(' · ')[1],
    stops: x.stops.map(([name, sx, sy, kids, fee], i) => ({ name, xy: [sx, sy], kids, fee, fee1: oneWay(fee), pick: x.pick[i], drop: EVENING + (x.school - x.pick[i]) + 3 })),
  };
});
const RT = Object.fromEntries(TR.map((r) => [r.id, r]));
const feeRange = (r) => { const f = r.stops.map((s) => s.fee); return `${inr(Math.min(...f))}–${inr(Math.max(...f))}`; };

// Morning pickup as it ran live (snapshot 7:58 AM). reached = stops reached so far, t = how far to the next stop
const LIVE = {
  R1: { state: 'school', reached: 9, t: 1, speed: 0, late: 0, board: 46, upd: '7:53 AM', started: T(7, 8) },
  R2: { state: 'moving', reached: 7, t: 0.6, speed: 34, late: 1, eta: T(7, 59), board: 37, upd: '7:58 AM', started: T(7, 15) },
  R3: { state: 'moving', reached: 3, t: 0.45, speed: 11, late: 14, eta: T(8, 1), board: 17, upd: '7:58 AM', started: T(7, 25) },
  R4: { state: 'moving', reached: 9, t: 0.5, speed: 28, late: 2, eta: T(8, 1), board: 44, upd: '7:58 AM', started: T(7, 4) },
  R5: { state: 'stopped', reached: 4, t: 0, speed: 0, late: 0, eta: T(8, 2), board: 22, upd: '7:58 AM', started: T(7, 32) },
  R6: { state: 'offline', reached: 5, t: 0.2, speed: null, late: null, board: 25, upd: '7:51 AM', started: T(7, 16) },
};
// Students not boarded at a stop (stop index -> count)
const NOTB = { R1: { 3: 1 }, R2: {}, R3: { 1: 1 }, R4: { 2: 1, 6: 1 }, R5: { 1: 1, 3: 1 }, R6: { 4: 1 } };
const routePts = (r) => [...r.stops.map((s) => s.xy), SCHOOL_XY];
function busXY(r, lv) {
  if (lv.state === 'school') return SCHOOL_XY;
  const pts = routePts(r);
  const a = pts[lv.reached - 1], b = pts[lv.reached];
  return [a[0] + (b[0] - a[0]) * lv.t, a[1] + (b[1] - a[1]) * lv.t];
}
function liveStatus(lv, evening) {
  if (evening) return { label: 'Not on a trip', tone: 'neutral', word: 'Parked', map: 'ink-3' };
  if (lv.state === 'school') return { label: 'At school', tone: 'info', word: 'Parked', map: 'info' };
  if (lv.state === 'offline') return { label: `Last seen ${lv.upd}`, tone: 'neutral', word: 'Offline', map: 'ink-3' };
  const word = lv.state === 'stopped' ? 'Stopped' : 'Moving';
  if (lv.late > 5) return { label: `${lv.late} min late`, tone: 'warn', word, map: 'warn' };
  return { label: 'On time', tone: 'ok', word, map: 'ok' };
}
// Point at fraction p along a polyline
function along(pts, p) {
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let left = total * Math.max(0, Math.min(1, p));
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] || i === seg.length - 1) { const f = seg[i] ? Math.min(1, left / seg[i]) : 0; return { xy: [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f], reached: i + 1 }; }
    left -= seg[i];
  }
  return { xy: pts[pts.length - 1], reached: pts.length - 1 };
}

const ALERTS = [
  { id: 'a1', tone: 'bad', icon: I.WifiOff, time: '7:53 AM', title: 'Bus 6 is offline', body: 'No location since 7:51 AM near Hafeezpet. The driver’s phone may have lost signal.', route: 'R6', act: 'call', open: true },
  { id: 'a2', tone: 'warn', icon: I.Timer, time: '7:52 AM', title: 'Bus 3 is 14 minutes late', body: 'Slow traffic at Pragathi Nagar Kaman. 20 students at the next 4 stops are waiting.', route: 'R3', act: 'message', open: true },
  { id: 'a3', tone: 'bad', icon: I.Siren, time: '7:41 AM', title: 'Emergency button pressed on Bus 5', body: 'At Bharat Nagar. Ramesh called back: pressed by mistake while boarding. No parent message was sent.', route: 'R5', open: false, closed: 'Closed 7:43 AM by Venkatesh Goud' },
  { id: 'a4', tone: 'warn', icon: I.Gauge, time: '7:39 AM', title: 'Over-speed: Bus 2 at 62 km/h', body: 'Limit 50 km/h · Nizampet Road · for 40 seconds. Yadagiri was told on the driver app.', route: 'R2', open: false, closed: 'Seen by Venkatesh Goud' },
];

/* ======================= Map (inline SVG, theme colours only) ======================= */
const C = (v, a) => (a != null ? `rgb(var(--${v}) / ${a})` : `rgb(var(--${v}))`);
const pathD = (pts) => 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L');
const MINOR = ['M120,0 L196,380', 'M0,186 L640,160', 'M430,0 L612,380', 'M0,334 L640,306', 'M226,0 L272,380', 'M520,52 L640,118', 'M0,118 L250,40', 'M560,180 L640,240'];
const AREAS = [['MIYAPUR', 60, 112, 'start'], ['CHANDANAGAR', 22, 290, 'start'], ['BACHUPALLY', 250, 16, 'end'], ['NIZAMPET', 540, 76, 'start'], ['KPHB COLONY', 382, 352, 'end'], ['MOOSAPET', 626, 362, 'end'], ['HAFEEZPET', 150, 296, 'start']];
function roadPts(r) {
  const pts = routePts(r); const [a, b] = pts;
  const dx = a[0] - b[0], dy = a[1] - b[1], d = Math.hypot(dx, dy) || 1;
  return [[a[0] + (dx / d) * 160, a[1] + (dy / d) * 160], ...pts];
}

function TransportMap({ vb = [0, 0, 640, 380], routeIds = TR.map((r) => r.id), sel, buses = [], progress, nextLabel, parked, onSel, labelStops, tags }) {
  const selR = sel && RT[sel];
  const selPts = selR ? routePts(selR) : null;
  const done = selPts && progress ? [...selPts.slice(0, progress.reached), progress.xy] : null;
  const rest = selPts && progress ? [progress.xy, ...selPts.slice(progress.reached)] : null;
  const halo = { paintOrder: 'stroke', stroke: C('sunken'), strokeWidth: 3.5, strokeLinejoin: 'round' };
  return (
    <svg viewBox={vb.join(' ')} className="w-full h-auto block select-none" role="img" aria-label="Map of the bus routes around Sunrise Public School">
      <rect x="-20" y="-20" width="680" height="420" style={{ fill: C('sunken') }} />
      <rect x="498" y="176" width="70" height="44" rx="10" style={{ fill: C('ok', 0.1) }} />
      <rect x="182" y="296" width="62" height="38" rx="10" style={{ fill: C('ok', 0.1) }} />
      <ellipse cx="338" cy="128" rx="24" ry="13" style={{ fill: C('info', 0.16), stroke: C('info', 0.3) }} />
      {MINOR.map((d) => <path key={d} d={d} fill="none" strokeWidth="6" strokeLinecap="round" style={{ stroke: C('line') }} />)}
      {MINOR.map((d) => <path key={'i' + d} d={d} fill="none" strokeWidth="3.5" strokeLinecap="round" style={{ stroke: C('surface') }} />)}
      {TR.map((r) => <path key={'r' + r.id} d={pathD(roadPts(r))} fill="none" strokeWidth="12" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: C('line') }} />)}
      {TR.map((r) => <path key={'s' + r.id} d={pathD(roadPts(r))} fill="none" strokeWidth="8.5" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: C('surface') }} />)}
      {AREAS.map(([t, x, y, a]) => <text key={t} x={x} y={y} textAnchor={a} fontSize="10" fontWeight="700" letterSpacing="1.2" style={{ fill: C('ink-3', 0.8) }}>{t}</text>)}
      {TR.filter((r) => routeIds.includes(r.id) && r.id !== sel).map((r) => (
        <path key={'l' + r.id} d={pathD(routePts(r))} fill="none" strokeWidth="2.5" strokeLinejoin="round" style={{ stroke: C('ink-3', 0.55) }} />
      ))}
      {selR && (done ? (
        <>
          <path d={pathD(rest)} fill="none" strokeWidth="4" strokeDasharray="2 7" strokeLinecap="round" style={{ stroke: C('brand') }} />
          <path d={pathD(done)} fill="none" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: C('brand') }} />
        </>
      ) : <path d={pathD(selPts)} fill="none" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: C('brand') }} />)}
      {selR && selR.stops.map((s, i) => {
        const reached = progress ? i < progress.reached : false;
        return (
          <g key={s.name}>
            <circle cx={s.xy[0]} cy={s.xy[1]} r="4.6" strokeWidth="2" style={{ fill: reached ? C('brand') : C('surface'), stroke: C('brand') }}><title>{s.name} · {fmt(s.pick)}</title></circle>
            {labelStops && <text x={s.xy[0] + (s.xy[0] > 420 ? -9 : 9)} y={s.xy[1] - 7} textAnchor={s.xy[0] > 420 ? 'end' : 'start'} fontSize="9.5" fontWeight="600" style={{ fill: C('ink-2'), ...halo }}>{s.name}</text>}
          </g>
        );
      })}
      {tags && TR.map((r) => (
        <g key={'t' + r.id}>
          <circle cx={r.stops[0].xy[0]} cy={r.stops[0].xy[1]} r="10" strokeWidth="2" style={{ fill: C('brand'), stroke: C('surface') }} />
          <text x={r.stops[0].xy[0]} y={r.stops[0].xy[1] + 3.8} textAnchor="middle" fontSize="10.5" fontWeight="800" style={{ fill: C('brand-ink') }}>{r.num}</text>
        </g>
      ))}
      {/* School */}
      <g transform={`translate(${SCHOOL_XY[0] - 14} ${SCHOOL_XY[1] - 14})`}>
        <rect width="28" height="28" rx="8" strokeWidth="2.5" style={{ fill: C('brand'), stroke: C('surface') }} />
        <I.School x={6} y={6} size={16} style={{ color: C('brand-ink') }} />
      </g>
      <text x={SCHOOL_XY[0] + 20} y={SCHOOL_XY[1] - 6} fontSize="11" fontWeight="700" style={{ fill: C('ink'), ...halo }}>Sunrise Public School</text>
      {parked > 0 && <text x={SCHOOL_XY[0] + 20} y={SCHOOL_XY[1] + 8} fontSize="9.5" fontWeight="600" style={{ fill: C('info'), ...halo }}>{parked === 1 ? '1 bus parked' : `${parked} buses parked`}</text>}
      {nextLabel && (() => {
        const near = Math.hypot(nextLabel.xy[0] - SCHOOL_XY[0], nextLabel.xy[1] - SCHOOL_XY[1]) < 80;
        const left = near || nextLabel.xy[0] > 420;
        return <text x={nextLabel.xy[0] + (left ? -12 : 12)} y={nextLabel.xy[1] + (near ? 24 : 16)} textAnchor={left ? 'end' : 'start'} fontSize="10" fontWeight="700" style={{ fill: C('brand'), ...halo }}>{nextLabel.text}</text>;
      })()}
      {/* Buses */}
      {buses.map((b) => (
        <g key={b.id} onClick={onSel ? () => onSel(b.id) : undefined} style={{ cursor: onSel ? 'pointer' : 'default' }} opacity={b.stale ? 0.5 : 1}>
          <title>{b.title}</title>
          {b.moving && <circle cx={b.xy[0]} cy={b.xy[1]} r="19" className="animate-pulse" style={{ fill: C(b.tone, 0.22) }} />}
          {b.id === sel && <circle cx={b.xy[0]} cy={b.xy[1]} r="16.5" fill="none" strokeWidth="2.2" style={{ stroke: C('ink') }} />}
          <circle cx={b.xy[0]} cy={b.xy[1]} r="12" strokeWidth="2" style={{ fill: C(b.tone), stroke: C('surface') }} />
          <text x={b.xy[0]} y={b.xy[1] + 4} textAnchor="middle" fontSize="11.5" fontWeight="800" style={{ fill: C('surface') }}>{b.num}</text>
        </g>
      ))}
    </svg>
  );
}
// Phone: a closer window around the bus being followed, so names stay readable
function phoneBox(xy) {
  const w = 400, h = 300;
  const x = Math.max(0, Math.min(640 - w, xy[0] - w / 2)), y = Math.max(0, Math.min(380 - h, xy[1] - h / 2));
  return [Math.round(x), Math.round(y), w, h];
}

/* ======================= Shared bits ======================= */
function Back({ page, label, extra }) {
  const { go } = useNav();
  return (
    <button onClick={() => go('transport', { page })} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <I.ArrowLeft size={17} />{label}{extra && <span className="text-ink3 font-normal">/ {extra}</span>}
    </button>
  );
}
const BusBadge = ({ r, tone = 'brand', size = 40 }) => (
  <span className={cx('rounded-xl grid place-items-center font-display font-semibold shrink-0 tnum', TONE_SOFT[tone])} style={{ width: size, height: size, fontSize: size * 0.4 }}>{r.num}</span>
);

function RouteMessageSheet({ open, onClose }) {
  const { go } = useNav();
  const toast = useToast();
  return (
    <Sheet open={open} onClose={onClose} title="Message a route" sub="Pick the route. Send Message opens with its parents already chosen.">
      <ul className="flex flex-col gap-1">
        {TR.map((r) => (
          <li key={r.id}>
            <button onClick={() => { onClose(); toast({ title: `${r.students} parents of ${r.name.split(' · ')[0]} picked`, body: 'Opening Send Message', tone: 'info' }); go('communication', { page: 'send' }); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken text-left">
              <BusBadge r={r} size={36} />
              <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{r.name}</span><span className="block text-[12.5px] text-ink3">{r.students} students · {r.stops.length} stops</span></span>
              <I.ChevronRight size={18} className="text-ink3" />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/* ======================= Route history playback ======================= */
function HistorySheet({ open, onClose, start = 'R4' }) {
  const [bus, setBus] = useState(start);
  const [day, setDay] = useState('8 Oct');
  const [trip, setTrip] = useState('morning');
  const [p, setP] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { if (open) { setBus(start); setP(0); setPlaying(false); } }, [open, start]);
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => setP((x) => { if (x >= 1) { setPlaying(false); return 1; } return Math.min(1, x + 0.008); }), 60);
    return () => clearInterval(t);
  }, [playing]);
  const r = RT[bus];
  const pts = trip === 'morning' ? routePts(r) : [...routePts(r)].reverse();
  const pos = along(pts, p);
  const t0 = trip === 'morning' ? r.pick[0] - 1 : EVENING;
  const t1 = trip === 'morning' ? r.school + 1 : r.stops[0].drop + 2;
  const now = Math.round(t0 + (t1 - t0) * p);
  const reachedM = trip === 'morning' ? pos.reached : 0;
  return (
    <Sheet open={open} onClose={() => { setPlaying(false); onClose(); }} title="Route history" sub="Play a past trip with its times. Only points sent during the trip are kept." wide>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 @sm:grid-cols-3 gap-3">
          <Field label="Vehicle" id="rh-bus"><Select id="rh-bus" value={bus} onChange={(v) => { setBus(v); setP(0); setPlaying(false); }} options={TR.map((x) => ({ value: x.id, label: `Bus ${x.num} · ${x.short}` }))} /></Field>
          <Field label="Date" id="rh-day"><Select id="rh-day" value={day} onChange={(v) => { setDay(v); setP(0); setPlaying(false); }} options={['8 Oct', '7 Oct', '6 Oct', '5 Oct', '3 Oct'].map((d) => ({ value: d, label: `${d} 2026` }))} /></Field>
          <Field label="Trip" id="rh-trip"><Select id="rh-trip" value={trip} onChange={(v) => { setTrip(v); setP(0); setPlaying(false); }} options={[{ value: 'morning', label: 'Morning pickup' }, { value: 'evening', label: 'Evening drop' }]} /></Field>
        </div>
        <div className="rounded-xl overflow-hidden border border-line/70">
          <TransportMap routeIds={[bus]} sel={bus} buses={[{ id: bus, num: r.num, xy: pos.xy, tone: 'brand', title: `Bus ${r.num} at ${fmt(now)}` }]} progress={trip === 'morning' ? { reached: reachedM, xy: pos.xy } : null} />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" icon={playing ? I.Pause : I.Play} onClick={() => { if (p >= 1) setP(0); setPlaying(!playing); }} className="w-28">{playing ? 'Pause' : p >= 1 ? 'Replay' : 'Play'}</Button>
          <input type="range" min="0" max="1000" value={Math.round(p * 1000)} onChange={(e) => { setPlaying(false); setP(Number(e.target.value) / 1000); }} aria-label="Trip time" className="flex-1 accent-[rgb(var(--brand))]" />
          <span className="font-display font-semibold text-[18px] tnum w-[86px] text-right">{fmt(now)}</span>
        </div>
        <p className="text-[12.5px] text-ink3 flex gap-1.5"><I.Info size={14} className="shrink-0 mt-0.5" />Bus {r.num} · {day} 2026 · started {fmt(t0)}, ended {fmt(t1)}. 3 points that jumped more than 1 km in 30 seconds were left out.</p>
      </div>
    </Sheet>
  );
}

/* ======================= Live Tracking ======================= */
function LivePage() {
  const { go } = useNav();
  const toast = useToast();
  const canEdit = useCanEdit();
  const [trip, setTrip] = useState('morning');
  const [route, setRoute] = useState('all');
  const [sel, setSel] = useState('R4');
  const [hist, setHist] = useState(false);
  const [msgRoute, setMsgRoute] = useState(false);
  const [delay, setDelay] = useState(null);
  const [alerts, setAlerts] = useState(ALERTS);
  const [showAll, setShowAll] = useState(false);
  const evening = trip === 'evening';
  const shown = TR.filter((r) => route === 'all' || r.id === route);
  const cur = RT[shown.some((r) => r.id === sel) ? sel : shown[0].id];
  const lv = LIVE[cur.id];
  const st = liveStatus(lv, evening);
  const buses = evening ? [] : shown.filter((r) => LIVE[r.id].state !== 'school').map((r) => {
    const l = LIVE[r.id]; const s = liveStatus(l);
    return { id: r.id, num: r.num, xy: busXY(r, l), tone: s.map, moving: l.state === 'moving', stale: l.state === 'offline', title: `Bus ${r.num} · ${s.label}` };
  });
  const curXY = evening || lv.state === 'school' ? SCHOOL_XY : busXY(cur, lv);
  const nextStop = !evening && lv.state !== 'school' && lv.state !== 'offline' ? (cur.stops[lv.reached] || null) : null;
  const parked = !evening ? shown.filter((r) => LIVE[r.id].state === 'school').length : 0;
  const openAlerts = alerts.filter((a) => a.open);
  const listAlerts = showAll ? alerts : alerts.slice(0, 3);
  const mapProps = {
    routeIds: shown.map((r) => r.id), sel: cur.id, buses, parked, onSel: setSel,
    progress: !evening ? { reached: lv.reached, xy: curXY } : null,
    nextLabel: nextStop ? { xy: nextStop.xy, text: `Next: ${nextStop.name}` } : null,
  };
  const bandItems = evening ? [
    { label: 'Evening drop', big: '3:50 PM', foot: 'All 6 buses leave together' },
    { label: 'Students to drop', big: '239', foot: '12 going home with parents' },
    { label: 'Drivers ready', big: <>6<span className="text-[0.55em] opacity-70 font-medium"> / 6</span></>, foot: 'Bus 5: Bhikshapathi drives today' },
    { label: 'Alerts now', big: '0', foot: 'Nothing running yet' },
  ] : [
    { label: 'Buses on a trip', big: <>5<span className="text-[0.55em] opacity-70 font-medium"> / 6</span></>, foot: 'Bus 1 reached school at 7:52 AM', onClick: () => setSel('R1') },
    { label: 'Students on board', big: '145', foot: '46 already at school' },
    { label: 'On time', big: <>3<span className="text-[0.55em] opacity-70 font-medium"> of 5</span></>, foot: 'Bus 3 is 14 min late', onClick: () => setSel('R3') },
    { label: 'Alerts now', big: String(openAlerts.length), foot: openAlerts.length ? 'Bus 6 offline · Bus 3 late' : 'All clear', onClick: () => document.getElementById('tr-alerts')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
  ];
  const callDriver = (r) => toast({ title: `Calling ${r.driver}`, body: `${r.phone} · Bus ${r.num}`, tone: 'info' });
  const busesCard = (
          <Card>
            <CardHead title="Buses" sub={evening ? 'Buses appear on the map during a trip only' : 'Tap a bus to follow it'} icon={I.Bus} action={<Pill tone="neutral">{shown.length}</Pill>} />
            <ul className="px-2 pb-2 flex flex-col gap-0.5">
              {shown.map((r) => {
                const l = LIVE[r.id]; const s = liveStatus(l, evening); const on = cur.id === r.id;
                const nx = r.stops[l.reached];
                return (
                  <li key={r.id}>
                    <button onClick={() => setSel(r.id)} aria-pressed={on}
                      className={cx('w-full text-left flex gap-3 px-3 py-3 rounded-xl transition', on ? 'bg-brand/8 ring-1 ring-brand/30' : 'hover:bg-sunken/70', !evening && l.state === 'offline' && 'opacity-70')}>
                      <BusBadge r={r} tone={s.tone} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 justify-between">
                          <p className="font-semibold text-[14.5px] truncate">Bus {r.num} · {r.short}</p>
                          <Pill tone={s.tone} className="!h-[22px] !text-[11.5px] shrink-0">{s.label}</Pill>
                        </div>
                        <p className="text-[12.5px] text-ink3 truncate">{r.driver} · <span className="font-mono text-[11.5px]">{r.reg}</span></p>
                        <p className="text-[13px] mt-1 truncate">
                          {evening ? <>Starts <b className="font-semibold">{fmt(EVENING)}</b> · first drop {r.stops[r.stops.length - 1].name}</>
                            : l.state === 'school' ? <>Reached school <b className="font-semibold">7:52 AM</b> · trip ended</>
                            : l.state === 'offline' ? <>Last near <b className="font-semibold">Hafeezpet</b> · call the driver</>
                            : <>Next: <b className="font-semibold">{nx?.name}</b> · {fmt(l.eta)}</>}
                        </p>
                        <p className="text-[12px] text-ink3 truncate tnum">
                          {evening ? `${r.students} students to drop · ${r.stops.length} stops` : l.state === 'school' ? `${l.board} students dropped at school` : `${l.board} of ${r.students} on board · ${s.word}${l.speed != null && l.state !== 'offline' ? ` ${l.speed} km/h` : ''} · ${l.upd}`}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
  );

  return (
    <div>
      <ModuleHead sub={evening ? 'Evening drop · Friday 9 Oct · buses show once the driver presses Start trip' : 'Morning pickup · Friday 9 Oct · live, updated every 30 seconds'}
        actions={<>
          <Button variant="secondary" icon={I.History} onClick={() => setHist(true)}>Route history</Button>
          <Button variant="primary" icon={I.Send} onClick={() => setMsgRoute(true)}>Message a route</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex flex-col @md:flex-row gap-2.5 @md:items-center">
          <Segmented value={trip} onChange={setTrip} options={[{ value: 'morning', label: 'Morning pickup', icon: I.Sunrise }, { value: 'evening', label: 'Evening drop', icon: I.Sunset }]} />
          <Select id="live-route" value={route} onChange={setRoute} className="@md:w-64" options={[{ value: 'all', label: 'All 6 routes' }, ...TR.map((r) => ({ value: r.id, label: r.name }))]} />
          {!canEdit && <span className="text-[13px] text-ink3 @md:ml-auto">You can watch the buses. Messages and calls are for the Transport In-charge.</span>}
        </div>

        <Band items={bandItems} />

        <Split side={380} className="[&>*]:min-w-0">
          <Col>
          <Card className="overflow-hidden">
            <CardHead title={evening ? 'Evening drop' : 'Morning pickup · live'} icon={I.MapPinned}
              sub={evening ? 'Not started. Locations are collected only between Start trip and End trip.' : 'Updated 7:58:30 AM · tap a bus to follow it'}
              action={<Pill tone={evening ? 'neutral' : 'ok'} dot>{evening ? 'Not started' : 'Live'}</Pill>} />
            <div className="px-3">
              <div className="rounded-xl overflow-hidden border border-line/70">
                <div className="@md:hidden"><TransportMap vb={phoneBox(curXY)} {...mapProps} /></div>
                <div className="hidden @md:block"><TransportMap {...mapProps} /></div>
              </div>
            </div>
            <div className="px-5 py-3">
              <Legend items={evening ? [['bg-brand', 'Route you follow'], ['bg-ink3/50', 'Other routes']] : [['bg-ok', 'On time'], ['bg-warn', 'Late'], ['bg-ink3/50', 'Offline'], ['bg-brand', 'Route you follow']]} />
            </div>
            <div className="border-t border-line px-4 @md:px-5 py-3.5 flex flex-col @md:flex-row @md:items-center gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Avatar name={cur.driver} size={40} />
                <div className="min-w-0">
                  <p className="font-semibold text-[14.5px] truncate">Bus {cur.num} · {cur.driver}</p>
                  <p className="text-[12.5px] text-ink3 truncate">
                    {evening ? `Not on a trip · evening drop starts ${fmt(EVENING)}` : lv.state === 'school' ? 'At school · trip ended 7:53 AM' : lv.state === 'offline' ? `Offline · last seen ${lv.upd} near Hafeezpet` : `${st.word} ${lv.speed} km/h · next ${nextStop?.name} about ${fmt(lv.eta)}`}
                  </p>
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" icon={I.Phone} onClick={() => callDriver(cur)}>Call driver</Button>
                  <Button size="sm" variant="soft" icon={I.Send} onClick={() => setDelay(cur.id)}>Message parents</Button>
                </div>
              )}
            </div>
          </Card>

            <div className="@xl:hidden">{busesCard}</div>
          <Card>
            <CardHead title={`Bus ${cur.num} stops`} icon={I.Route}
              sub={evening ? `${cur.short} · evening drop, in order` : lv.state === 'school' ? `${cur.short} · all ${cur.stops.length} stops reached` : `${cur.short} · ${lv.reached} of ${cur.stops.length} stops reached`}
              action={<Button size="sm" variant="ghost" icon={I.History} onClick={() => setHist(true)}>History</Button>} />
            <ol className="px-5 pb-4 flex flex-col">
              {(evening ? [...cur.stops].reverse() : cur.stops).map((s, i, arr) => {
                const idx = evening ? cur.stops.length - 1 - i : i;
                const reached = !evening && idx < lv.reached;
                const isNext = !evening && idx === lv.reached && lv.state !== 'school';
                const miss = NOTB[cur.id][idx] || 0;
                const boarded = s.kids - miss;
                return (
                  <li key={s.name} className="grid grid-cols-[62px_16px_1fr] gap-2.5">
                    <span className={cx('text-[13px] font-semibold tnum pt-0.5', reached ? 'text-ink3' : 'text-ink2')}>{fmt(evening ? s.drop : s.pick).replace(' AM', '').replace(' PM', '')}</span>
                    <span className="flex flex-col items-center">
                      <span className={cx('w-3 h-3 rounded-full mt-1 ring-4', reached ? 'bg-brand ring-brand/15' : isNext ? 'bg-surface border-2 border-brand ring-brand/20' : 'bg-line ring-transparent')} />
                      {i < arr.length - 1 && <span className={cx('flex-1 w-0.5 my-1', reached ? 'bg-brand/50' : 'bg-line')} />}
                    </span>
                    <span className="pb-3.5 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-semibold leading-tight">{s.name}</span>
                        {isNext && <Pill tone={lv.state === 'offline' ? 'neutral' : 'brand'} className="!h-5 !text-[11px]">{lv.state === 'offline' ? 'Not known' : `Next · about ${fmt(lv.eta)}`}</Pill>}
                      </span>
                      <span className="block text-[12.5px] text-ink3">
                        {evening ? `${s.kids} students get off` : reached ? `Reached ${fmt(s.pick + Math.max(0, (lv.late || 0) - (idx < lv.reached - 2 ? 2 : 0)))} · ${boarded} of ${s.kids} boarded${miss ? ` · ${miss} not boarded` : ''}` : `${s.kids} students waiting`}
                        {cur.id === 'R4' && s.name === 'KPHB 6th Phase' && ' · includes Aarav Sharma, 7 B'}
                      </span>
                    </span>
                  </li>
                );
              })}
              <li className="grid grid-cols-[62px_16px_1fr] gap-2.5">
                <span className="text-[13px] font-semibold tnum pt-0.5 text-ink2">{fmt(evening ? EVENING : cur.school).replace(' AM', '').replace(' PM', '')}</span>
                <span className="flex flex-col items-center"><span className="w-3 h-3 rounded-sm mt-1 bg-brand" /></span>
                <span className="min-w-0"><span className="block text-[14px] font-semibold leading-tight">School</span><span className="block text-[12.5px] text-ink3">{evening ? 'Leaves the school gate' : lv.state === 'school' ? 'Arrived 7:52 AM · 46 students dropped' : 'Planned arrival'}</span></span>
              </li>
            </ol>
          </Card>

          </Col>
          <Col>
            <div className="hidden @xl:block">{busesCard}</div>
          <Card id="tr-alerts">
            <CardHead title="Alerts" sub="Over-speed, route, offline, emergency, breakdown" icon={I.BellRing} action={openAlerts.length ? <Pill tone="bad">{openAlerts.length} open</Pill> : <Pill tone="ok">All clear</Pill>} />
            {evening ? (
              <div className="px-5 pb-5 text-[14px] text-ink3">No alerts. The morning alerts are in Transport Reports, Alerts history.</div>
            ) : (
              <ul className="px-2 pb-2 flex flex-col gap-1">
                {listAlerts.map((a) => (
                  <li key={a.id} className={cx('p-3 rounded-xl', a.open && a.tone === 'bad' ? 'bg-bad/[.06]' : a.open ? 'bg-warn/[.07]' : '')}>
                    <div className="flex items-start gap-3">
                      <span className={cx('w-9 h-9 rounded-xl grid place-items-center shrink-0', a.open ? TONE_SOFT[a.tone] : 'bg-sunken text-ink3')}><a.icon size={17} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[14px] leading-snug">{a.title}</p>
                        <p className="text-[12.5px] text-ink3 mt-0.5">{a.time} · {a.body}</p>
                        {!a.open && <p className="text-[12px] text-ink3 mt-1 flex items-center gap-1"><I.Check size={13} />{a.closed}</p>}
                        {a.open && canEdit && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {a.act === 'call' && <Button size="sm" variant="secondary" icon={I.Phone} onClick={() => callDriver(RT[a.route])}>Call {RT[a.route].driver}</Button>}
                            {a.act === 'message' && <Button size="sm" variant="secondary" icon={I.Send} onClick={() => setDelay(a.route)}>Tell Route {RT[a.route].num} parents</Button>}
                            <Button size="sm" variant="ghost" onClick={() => { setAlerts((x) => x.map((y) => (y.id === a.id ? { ...y, open: false, closed: 'Closed just now by you' } : y))); toast({ title: `Alert closed: ${a.title}`, undo: () => setAlerts((x) => x.map((y) => (y.id === a.id ? a : y))) }); }}>Close alert</Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!evening && alerts.length > 3 && <div className="px-5 pb-4"><button onClick={() => setShowAll(!showAll)} className="text-[13px] font-semibold text-brand hover:underline">{showAll ? 'Show fewer' : `Show all ${alerts.length} from today`}</button></div>}
            <div className="mx-5 mb-5 rounded-xl bg-sunken/70 p-3.5 flex gap-3 text-[13px] text-ink2">
              <I.Siren size={18} className="text-bad shrink-0 mt-0.5" />
              <p>When a driver presses the red <b className="font-semibold text-ink">Emergency</b> button, you and the Principal are alerted at once with the bus location. A message to parents goes only after a person confirms it.</p>
            </div>
          </Card>
          </Col>
        </Split>
      </div>

      <HistorySheet open={hist} onClose={() => setHist(false)} start={cur.id} />
      <RouteMessageSheet open={msgRoute} onClose={() => setMsgRoute(false)} />
      <ConfirmSheet open={!!delay} onClose={() => setDelay(null)} title={delay ? `Send a delay message to Route ${RT[delay].num} parents?` : ''}
        sub={delay ? `${RT[delay].students} parents get this on WhatsApp, with SMS backup. A sent message cannot be taken back.` : ''}
        confirmLabel={delay ? `Send to ${RT[delay].students} parents` : 'Send'}
        onConfirm={() => toast({ title: `Delay message sent to ${RT[delay].students} parents`, body: `Route ${RT[delay].num} · WhatsApp, with SMS backup` })}>
        {delay && (
          <div className="rounded-xl bg-sunken p-3.5 text-[14px] leading-relaxed text-ink2">
            Dear parent, Bus {RT[delay].num} ({RT[delay].short}) is running about {LIVE[delay].late > 5 ? LIVE[delay].late : 10} minutes late today because of traffic. Please keep your child at the stop. — Sunrise Public School
          </div>
        )}
      </ConfirmSheet>
    </div>
  );
}

/* ======================= Routes & Stops ======================= */
function RoutesPage({ params }) {
  if (params?.id && RT[params.id]) return <RouteDetail r={RT[params.id]} />;
  return <RoutesList />;
}

function RoutesList() {
  const { go } = useNav();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [add, setAdd] = useState(false);
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const rows = TR.filter((r) => (!q || (r.name + r.driver + r.reg + r.stops.map((s) => s.name).join(' ')).toLowerCase().includes(q.toLowerCase())) && (f === 'all' || r.seats - r.students <= 3));
  return (
    <div>
      <ModuleHead sub="6 routes · 49 stops · 251 students · fee set per stop"
        actions={<Button variant="primary" icon={I.Plus} onClick={() => { setAdd(true); setName(''); setTried(false); }}>Add route</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox id="routes-q" value={q} onChange={setQ} placeholder="Route, stop, driver or bus number" />
            <Segmented value={f} onChange={setF} options={[{ value: 'all', label: 'All routes' }, { value: 'full', label: 'Nearly full' }]} />
            <ExportButton what="routes and stops" />
          </Toolbar>
          <DataList rows={rows} onRow={(r) => go('transport', { page: 'routes', id: r.id })} minWidth={820}
            empty={<Empty icon={I.SearchX} title="No route matches" body={`Nothing called “${q}”. Try a stop name like KPHB 6th Phase.`} action={<Button variant="secondary" onClick={() => { setQ(''); setF('all'); }}>Clear search</Button>} />}
            columns={[
              { key: 'route', label: 'Route', render: (r) => <div className="flex items-center gap-3"><BusBadge r={r} size={36} /><div><p className="font-semibold leading-tight">{r.name}</p><p className="text-[12.5px] text-ink3">Morning {fmt(r.pick[0] - 10)} · Evening {fmt(EVENING)}</p></div></div> },
              { key: 'bus', label: 'Vehicle', nowrap: true, render: (r) => <><p>{r.bus}</p><p className="text-[12px] text-ink3 font-mono">{r.reg}</p></> },
              { key: 'driver', label: 'Driver', render: (r) => <><p>{r.driver}</p><p className="text-[12.5px] text-ink3">Attendant {r.attendant}</p></> },
              { key: 'stops', label: 'Stops', align: 'right', render: (r) => r.stops.length },
              { key: 'students', label: 'Students', align: 'right', render: (r) => r.students },
              { key: 'seats', label: 'Seats used', render: (r) => <div className="w-32"><div className="flex justify-between text-[12.5px] mb-1 tnum"><span className={cx('font-semibold', r.seats - r.students <= 3 && 'text-warn')}>{r.students} of {r.seats}</span><span className="text-ink3">{r.seats - r.students} free</span></div><Progress value={(r.students / r.seats) * 100} tone={r.seats - r.students <= 3 ? 'warn' : 'brand'} /></div> },
              { key: 'fee', label: 'Fee a month', nowrap: true, render: (r) => <span className="tnum">{feeRange(r)}</span> },
            ]}
            mobile={(r) => ({ title: r.name, sub: `${r.bus} · ${r.driver} · ${r.stops.length} stops`, icon: 'Bus', iconTone: r.seats - r.students <= 3 ? 'warn' : 'brand', pills: [<Pill key="s" tone={r.seats - r.students <= 3 ? 'warn' : 'neutral'} className="!h-[22px] !text-[11.5px]">{r.students} of {r.seats} seats</Pill>, <Pill key="f" tone="neutral" className="!h-[22px] !text-[11.5px]">{feeRange(r)}</Pill>] })}
            footer={`Showing ${rows.length} of 6 routes`} />
        </Card>

        <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 [&>*]:min-w-0 items-start">
          <Card className="overflow-hidden">
            <CardHead title="All routes" sub="Numbers mark where each route starts" icon={I.MapPinned} />
            <div className="px-3 pb-3"><div className="rounded-xl overflow-hidden border border-line/70"><TransportMap tags /></div></div>
          </Card>
          <Card>
            <CardHead title="Archived routes" sub="Kept with their history. They drop out of lists and fees." icon={I.Archive} />
            <ul className="px-2 pb-2">
              <li className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                <span className="w-10 h-10 rounded-xl bg-sunken text-ink3 grid place-items-center shrink-0"><I.Route size={19} /></span>
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">Route 7 · Hydernagar</p><p className="text-[12.5px] text-ink3 truncate">Archived 31 Mar 2026 by Venkatesh Goud · stops merged into Route 4</p></div>
                <Button size="sm" variant="ghost" icon={I.Undo2} onClick={() => toast({ title: 'Route 7 restored', body: 'It shows in Routes & Stops again, with no students.' })}>Restore</Button>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <FormSheet open={add} onClose={() => setAdd(false)} title="Add route" sub="Add stops after saving. Fees come from each stop." submitLabel="Add route"
        onSubmit={() => { setTried(true); if (!name.trim()) return false; toast({ title: `Route 7 · ${name.trim()} added`, body: 'Now add its stops in order.' }); return true; }}>
        <Field label="Route name" required id="ar-name" error={tried && !name.trim() && 'Give the route a name, usually the farthest area'}>
          <Input id="ar-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Like Hafeezpet" error={tried && !name.trim()} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vehicle" id="ar-veh" hint="Only free vehicles are shown"><Select id="ar-veh" value="v7" onChange={() => {}} options={[{ value: 'v7', label: 'Van 7 · 17 seats' }]} /></Field>
          <Field label="Driver" id="ar-drv"><Select id="ar-drv" value="b" onChange={() => {}} options={[{ value: 'b', label: 'Bhikshapathi (spare)' }]} /></Field>
        </div>
        <Field label="Transport fee" id="ar-fee" hint="Per stop lets farther stops cost more"><Segmented value="stop" onChange={() => {}} options={[{ value: 'stop', label: 'Per stop' }, { value: 'route', label: 'One fee for the route' }]} className="w-full" /></Field>
      </FormSheet>
    </div>
  );
}

function RouteDetail({ r }) {
  const toast = useToast();
  const { go } = useNav();
  const canEdit = useCanEdit();
  const [stops, setStops] = useState(r.stops);
  const [open, setOpen] = useState(r.id === 'R4' ? 'KPHB 6th Phase' : null);
  const [add, setAdd] = useState(false);
  const [feeMode, setFeeMode] = useState('stop');
  const [archive, setArchive] = useState(false);
  const move = (i, d) => {
    const j = i + d; if (j < 0 || j >= stops.length) return;
    const before = stops; const n = [...stops]; [n[i], n[j]] = [n[j], n[i]]; setStops(n);
    toast({ title: `${stops[i].name} moved ${d < 0 ? 'up' : 'down'}`, body: 'Pickup times stay. Check them after reordering.', undo: () => setStops(before) });
  };
  const kidsAt = (s, idx) => {
    const pool = STUDENTS.filter((x, k) => (k + idx * 3 + Number(r.num)) % 23 === 0).slice(0, Math.min(s.kids, 6));
    const list = r.id === 'R4' && s.name === 'KPHB 6th Phase' ? [FEATURED, ...pool.slice(0, 5)] : pool;
    return list;
  };
  return (
    <div>
      <Back page="routes" label="Routes & Stops" extra={`Route ${r.num}`} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card className="p-4 @md:p-5 flex flex-col @lg:flex-row @lg:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <BusBadge r={r} size={52} />
            <div className="min-w-0">
              <h1 className="font-display text-[22px] @md:text-[26px] font-semibold tracking-tight leading-tight">{r.name}</h1>
              <p className="text-[13.5px] text-ink3 mt-0.5 truncate">{r.bus} · <span className="font-mono text-[12.5px]">{r.reg}</span> · {r.driver} · attendant {r.attendant}</p>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <Pill tone={r.seats - r.students <= 3 ? 'warn' : 'neutral'}>{r.students} of {r.seats} seats</Pill>
                <Pill tone="neutral">{stops.length} stops</Pill>
                <Pill tone="neutral">Morning {fmt(r.pick[0] - 10)}</Pill>
                <Pill tone="neutral">Evening {fmt(EVENING)}</Pill>
              </div>
            </div>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="primary" icon={I.Plus} className="flex-1 @lg:flex-none" onClick={() => setAdd(true)}>Add stop</Button>
              <MoreMenu items={[
                [I.ArrowUpDown, 'Copy for evening drop (reverse)', () => toast({ title: 'Evening drop copied in reverse order', body: `${stops.length} stops, first drop ${stops[stops.length - 1].name} at ${fmt(stops[stops.length - 1].drop)}` })],
                [I.Send, 'Message this route’s parents', () => go('communication', { page: 'send' })],
                [I.Archive, 'Archive route', () => setArchive(true)],
              ]} />
            </div>
          )}
        </Card>

        <Split side={380} className="[&>*]:min-w-0">
          <Card className="overflow-hidden">
            <CardHead title="Stops in order" sub={canEdit ? 'Use the arrows to reorder. Tap a stop to see its students.' : 'Tap a stop to see its students'} icon={I.ListOrdered} />
            <div className="hidden @md:grid grid-cols-[28px_minmax(0,1fr)_88px_88px_120px_76px] gap-3 px-5 py-2 border-y border-line text-[12px] font-semibold text-ink3">
              <span>#</span><span>Stop</span><span>Pickup</span><span>Drop</span><span className="text-right">Fee a month</span><span />
            </div>
            <ul className="divide-y divide-line/70 border-t border-line @md:border-t-0">
              {stops.map((s, i) => {
                const on = open === s.name;
                return (
                  <li key={s.name}>
                    <div className={cx('grid grid-cols-[28px_minmax(0,1fr)_auto] @md:grid-cols-[28px_minmax(0,1fr)_88px_88px_120px_76px] gap-3 items-center px-4 @md:px-5 py-3', on && 'bg-brand/5')}>
                      <span className="w-7 h-7 rounded-full bg-sunken text-[12px] font-bold grid place-items-center tnum">{i + 1}</span>
                      <button onClick={() => setOpen(on ? null : s.name)} className="min-w-0 text-left">
                        <p className="font-semibold text-[14.5px] truncate flex items-center gap-1.5">{s.name}<I.ChevronDown size={15} className={cx('text-ink3 transition shrink-0', on && 'rotate-180')} /></p>
                        <p className="text-[12.5px] text-ink3 truncate">{s.kids} students<span className="@md:hidden"> · {fmt(s.pick)} · drop {fmt(s.drop)}</span></p>
                      </button>
                      <span className="hidden @md:block text-[14px] tnum">{fmt(s.pick)}</span>
                      <span className="hidden @md:block text-[14px] tnum">{fmt(s.drop)}</span>
                      <span className="text-right">
                        <span className="block font-semibold tnum text-[14.5px]">{inr(feeMode === 'stop' ? s.fee : 2200)}</span>
                        <span className="block text-[12px] text-ink3 tnum">one-way {inr(feeMode === 'stop' ? s.fee1 : 1350)}</span>
                      </span>
                      <span className={cx('hidden @md:flex gap-0.5 justify-end', !canEdit && '@md:invisible')}>
                        <button aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => move(i, -1)} className="w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken hover:text-ink disabled:opacity-30"><I.ArrowUp size={16} /></button>
                        <button aria-label={`Move ${s.name} down`} disabled={i === stops.length - 1} onClick={() => move(i, 1)} className="w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken hover:text-ink disabled:opacity-30"><I.ArrowDown size={16} /></button>
                      </span>
                    </div>
                    {on && (
                      <div className="px-4 @md:px-5 pb-3 pl-[56px] @md:pl-[60px] animate-fade">
                        <ul className="flex flex-col gap-1">
                          {kidsAt(s, i).map((k) => (
                            <li key={k.id} className="flex items-center gap-2.5 text-[13.5px]">
                              <Avatar name={k.name} size={26} />
                              <button onClick={() => go('student', { id: k.id })} className="font-semibold hover:underline truncate">{k.name}</button>
                              <span className="text-ink3 shrink-0">{k.cls.replace('Class ', '')} {k.sec}</span>
                            </li>
                          ))}
                        </ul>
                        {s.kids > 6 && <p className="text-[12.5px] text-ink3 mt-1.5">and {s.kids - Math.min(s.kids, 6)} more · full list in Student Transport</p>}
                        {canEdit && (
                          <div className="flex gap-2 mt-2.5 @md:hidden">
                            <Button size="sm" variant="secondary" icon={I.ArrowUp} disabled={i === 0} onClick={() => move(i, -1)}>Up</Button>
                            <Button size="sm" variant="secondary" icon={I.ArrowDown} disabled={i === stops.length - 1} onClick={() => move(i, 1)}>Down</Button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
              <li className="grid grid-cols-[28px_minmax(0,1fr)_auto] @md:grid-cols-[28px_minmax(0,1fr)_88px_88px_120px_76px] gap-3 items-center px-4 @md:px-5 py-3 bg-sunken/40">
                <span className="w-7 h-7 rounded-full bg-brand text-brandink grid place-items-center"><I.School size={14} /></span>
                <div className="min-w-0"><p className="font-semibold text-[14.5px]">School</p><p className="text-[12.5px] text-ink3 @md:hidden">Arrive {fmt(r.school)} · leave {fmt(EVENING)}</p></div>
                <span className="hidden @md:block text-[14px] tnum">{fmt(r.school)}</span>
                <span className="hidden @md:block text-[14px] tnum">{fmt(EVENING)}</span>
                <span /><span className="hidden @md:block" />
              </li>
            </ul>
          </Card>

          <Col>
            <Card className="overflow-hidden">
              <CardHead title="On the map" sub="Stop locations are used for arrival times and ‘bus arriving’ messages" icon={I.MapPinned} />
              <div className="px-3 pb-3"><div className="rounded-xl overflow-hidden border border-line/70"><TransportMap routeIds={[r.id]} sel={r.id} labelStops vb={phoneBox(r.stops[Math.floor(r.stops.length / 2)].xy)} /></div></div>
            </Card>
            <Card>
              <CardHead title="Transport fee" sub="Added to each student’s fees when they get a stop" icon={I.IndianRupee} />
              <div className="px-5 pb-5 flex flex-col gap-3">
                <Segmented value={feeMode} onChange={(v) => { if (!canEdit) return; setFeeMode(v); toast({ title: v === 'stop' ? 'Fee set per stop' : 'One fee for the whole route: ₹2,200', body: 'Applies to new assignments from the next installment. Logged.' }); }}
                  options={[{ value: 'stop', label: 'Per stop' }, { value: 'route', label: 'One fee for the route' }]} className="w-full" />
                <DL rows={[['Fee head', 'Transport'], ['Installments', 'Monthly, from Fee Structure'], ['Two-way', feeMode === 'stop' ? feeRange(r) : inr(2200)], ['One-way', feeMode === 'stop' ? `${inr(Math.min(...r.stops.map((s) => s.fee1)))}–${inr(Math.max(...r.stops.map((s) => s.fee1)))}` : inr(1350)]]} />
                <Button variant="secondary" icon={I.ArrowRight} className="-mt-3" onClick={() => go('fees', { page: 'structure' })}>Open Fee Structure</Button>
              </div>
            </Card>
          </Col>
        </Split>
      </div>

      <AddStopSheet open={add} onClose={() => setAdd(false)} r={r} stops={stops} onAdd={(s) => setStops([...stops, s])} />
      <ConfirmSheet open={archive} onClose={() => setArchive(false)} title={`Archive ${r.name}?`} sub={`${r.students} students still use this route. Move them to another route in Student Transport first.`}
        confirmLabel="Open Student Transport" onConfirm={() => go('transport', { page: 'students' })} />
    </div>
  );
}

function AddStopSheet({ open, onClose, r, stops, onAdd }) {
  const toast = useToast();
  const last = stops[stops.length - 1];
  const [f, setF] = useState({ name: '', order: 'last', pick: '', drop: '', fee: '', fee1: '', loc: '' });
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setF({ name: '', order: 'last', pick: fmt(last.pick + 5), drop: fmt(last.drop - 3), fee: String(last.fee), fee1: String(last.fee1), loc: '' }); setTried(false); } }, [open]);
  const err = { name: !f.name.trim() ? 'Enter the stop name parents know' : stops.some((s) => s.name.toLowerCase() === f.name.trim().toLowerCase()) ? `${f.name.trim()} is already stop ${stops.findIndex((s) => s.name.toLowerCase() === f.name.trim().toLowerCase()) + 1} on this route` : '', fee: !Number(f.fee) ? 'Enter the two-way fee a month' : '' };
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  return (
    <FormSheet open={open} onClose={onClose} title={`Add stop to Route ${r.num}`} sub="Pickup time fills 5 minutes after the last stop" submitLabel="Add stop"
      onSubmit={() => {
        setTried(true); if (err.name || err.fee) return false;
        onAdd({ name: f.name.trim(), xy: [340, 228], kids: 0, fee: Number(f.fee), fee1: Number(f.fee1) || oneWay(Number(f.fee)), pick: last.pick + 5, drop: last.drop - 3 });
        toast({ title: `${f.name.trim()} added as stop ${stops.length + 1}`, body: `${inr(Number(f.fee))} a month two-way` });
        return true;
      }}>
      <Field label="Stop name" required id="as-stop" error={tried && err.name}><Input id="as-stop" value={f.name} onChange={set('name')} error={tried && err.name} placeholder="Like Hafeezpet Railway Station" autoComplete="off" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Route" required id="as-route"><Select id="as-route" value={r.id} onChange={() => {}} options={[{ value: r.id, label: `Route ${r.num} · ${r.short}` }]} /></Field>
        <Field label="Order" required id="as-order"><Select id="as-order" value={f.order} onChange={set('order')} options={[{ value: 'last', label: `Last (${stops.length + 1})` }, ...stops.map((s, i) => ({ value: String(i), label: `Before ${s.name}` }))]} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pickup time" required id="as-pick"><Input id="as-pick" value={f.pick} onChange={set('pick')} className="tnum" /></Field>
        <Field label="Drop time" id="as-drop"><Input id="as-drop" value={f.drop} onChange={set('drop')} className="tnum" /></Field>
      </div>
      <Field label="Location" id="as-loc" hint={f.loc ? `Set: ${f.loc}` : 'Needed for arrival times and the ‘bus arriving’ message'}>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" icon={I.LocateFixed} onClick={() => setF({ ...f, loc: '17.4948° N, 78.3996° E (your location)' })}>Use my location</Button>
          <Button type="button" variant="secondary" icon={I.MapPin} onClick={() => setF({ ...f, loc: '17.4931° N, 78.4012° E (picked on map)' })}>Pick on map</Button>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fee two-way (₹ a month)" required id="as-fee" error={tried && err.fee}><Input id="as-fee" inputMode="numeric" value={f.fee} onChange={set('fee')} error={tried && err.fee} className="tnum" /></Field>
        <Field label="Fee one-way" id="as-fee1" hint="Fee variant"><Input id="as-fee1" inputMode="numeric" value={f.fee1} onChange={set('fee1')} className="tnum" /></Field>
      </div>
    </FormSheet>
  );
}

/* ======================= Vehicles & Drivers ======================= */
const TODAY = new Date(2026, 9, 9);
const D = (s) => { const [d, m, y] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const daysTo = (s) => Math.round((D(s) - TODAY) / 864e5);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nice = (s) => { const x = D(s); return `${x.getDate()} ${MON[x.getMonth()]} ${x.getFullYear()}`; };
const paperTone = (s) => { const d = daysTo(s); return d < 0 ? 'bad' : d <= 30 ? 'warn' : 'ok'; };
const paperWhen = (s) => { const d = daysTo(s); return d < 0 ? `Expired ${-d} days ago` : d === 0 ? 'Ends today' : d <= 60 ? `Ends in ${d} days` : 'Valid'; };
const PAPERS = ['Insurance', 'Fitness', 'Permit', 'PUC (pollution)'];

const VEHICLES = [
  { id: 'V1', num: 'Bus 1', reg: 'TS 07 UA 1182', type: 'Bus', model: 'Tata Starbus', seats: 52, route: 'R1', owned: 'Owned', gps: 'Device and app', status: 'Active', km: 96410, next: 100000, papers: ['14-02-2027', '30-06-2027', '31-03-2028', '12-01-2027'] },
  { id: 'V2', num: 'Bus 2', reg: 'TS 07 UA 2245', type: 'Bus', model: 'Tata Starbus', seats: 52, route: 'R2', owned: 'Owned', gps: 'Driver app', status: 'Active', km: 88120, next: 90000, papers: ['05-05-2027', '18-04-2027', '31-03-2028', '20-12-2026'] },
  { id: 'V3', num: 'Bus 3', reg: 'TS 07 UB 0917', type: 'Bus', model: 'Ashok Leyland Sunshine', seats: 40, route: 'R3', owned: 'Owned', gps: 'Driver app', status: 'Active', km: 69580, next: 70000, papers: ['11-03-2027', '18-11-2026', '31-03-2028', '02-02-2027'] },
  { id: 'V4', num: 'Bus 4', reg: 'TS 07 UB 2236', type: 'Bus', model: 'Tata Starbus', seats: 52, route: 'R4', owned: 'Owned', gps: 'Device and app', status: 'Active', km: 84215, next: 90000, papers: ['28-07-2027', '09-09-2027', '31-03-2028', '15-03-2027'] },
  { id: 'V5', num: 'Bus 5', reg: 'TS 08 UC 4410', type: 'Bus', model: 'Ashok Leyland Sunshine', seats: 40, route: 'R5', owned: 'Owned', gps: 'Driver app', status: 'Active', km: 112870, next: 120000, papers: ['21-10-2026', '22-01-2027', '31-03-2028', '26-11-2026'] },
  { id: 'V6', num: 'Bus 6', reg: 'TS 08 UC 5187', type: 'Bus', model: 'Eicher Skyline', seats: 52, route: 'R6', owned: 'Hired · Sri Lakshmi Travels', gps: 'Driver app', status: 'Active', km: 143300, next: 150000, papers: ['30-04-2027', '10-08-2027', '31-03-2027', '30-09-2026'] },
  { id: 'V7', num: 'Van 7', reg: 'TS 07 UE 3390', type: 'Van', model: 'Force Traveller', seats: 17, route: null, owned: 'Owned', gps: 'None', status: 'Under repair', km: 51200, next: 60000, papers: ['15-12-2026', '01-03-2027', '31-03-2027', '05-11-2026'] },
];
const PEOPLE = [
  { id: 'P1', name: 'Narsimha', role: 'Driver', phone: '98481 20734', lic: 'TS07 2009 0041128', exp: '12-03-2029', kind: 'Staff', app: 'Active', veh: 'Bus 1' },
  { id: 'P2', name: 'Yadagiri', role: 'Driver', phone: '99636 41820', lic: 'TS07 2012 0077314', exp: '04-08-2027', kind: 'Staff', app: 'Active', veh: 'Bus 2' },
  { id: 'P3', name: 'Srisailam', role: 'Driver', phone: '90004 71236', lic: 'TS08 2011 0052290', exp: '19-11-2026', kind: 'Staff', app: 'Active', veh: 'Bus 3' },
  { id: 'P4', name: 'Mallesh Kumar', role: 'Driver', phone: '99120 33671', lic: 'TS07 2008 0019653', exp: '22-06-2028', kind: 'Staff', app: 'Active', veh: 'Bus 4' },
  { id: 'P5', name: 'Ramesh', role: 'Driver', phone: '98853 60219', lic: 'TS08 2006 0008817', exp: '24-10-2026', kind: 'Staff', app: 'Active', veh: 'Bus 5' },
  { id: 'P6', name: 'Jangaiah', role: 'Driver', phone: '97010 88342', lic: 'TS13 2010 0033471', exp: '30-01-2027', kind: 'Hired · Sri Lakshmi Travels', app: 'Active', veh: 'Bus 6' },
  { id: 'P7', name: 'Bhikshapathi', role: 'Driver', phone: '93910 72215', lic: 'TS07 2014 0090046', exp: '17-07-2030', kind: 'Staff', app: 'Invited', veh: 'Spare' },
  { id: 'P8', name: 'Sujatha', role: 'Attendant', phone: '90590 44120', lic: null, exp: null, kind: 'Staff', app: 'Active', veh: 'Bus 4' },
  { id: 'P9', name: 'Saraswathi', role: 'Attendant', phone: '91001 23876', lic: null, exp: null, kind: 'Staff', app: 'Active', veh: 'Bus 1' },
  { id: 'P10', name: 'Anjamma', role: 'Attendant', phone: '98490 61102', lic: null, exp: null, kind: 'Staff', app: 'Active', veh: 'Bus 3' },
  { id: 'P11', name: 'Renuka', role: 'Attendant', phone: '97052 66310', lic: null, exp: null, kind: 'Hired · Sri Lakshmi Travels', app: 'Active', veh: 'Bus 6' },
  { id: 'P12', name: 'Raju', role: 'Driver', phone: '99854 10337', lic: 'TS07 2013 0061520', exp: '08-02-2028', kind: 'Staff · left 31 Aug 2026', app: 'Disabled', veh: '—' },
];
const COSTS = [
  { id: 'c1', date: '8 Oct 2026', veh: 'Bus 4', kind: 'Fuel', what: 'Diesel 120 L · Indian Oil, Kukatpally', odo: '84,215 km', amt: 11280 },
  { id: 'c2', date: '7 Oct 2026', veh: 'Bus 2', kind: 'Fuel', what: 'Diesel 110 L · HP, Nizampet', odo: '88,120 km', amt: 10340 },
  { id: 'c3', date: '7 Oct 2026', veh: 'Bus 5', kind: 'Repair', what: 'Breakdown at Y Junction: fan belt and radiator hose', odo: '112,870 km', amt: 4650 },
  { id: 'c4', date: '6 Oct 2026', veh: 'Bus 5', kind: 'Repair', what: 'Brake pads, front · Sri Venkateshwara Motors', odo: '112,790 km', amt: 6800 },
  { id: 'c5', date: '5 Oct 2026', veh: 'Bus 3', kind: 'Fuel', what: 'Diesel 95 L · Indian Oil, Bachupally', odo: '69,580 km', amt: 8930 },
  { id: 'c6', date: '3 Oct 2026', veh: 'Van 7', kind: 'Repair', what: 'Gearbox overhaul (in the garage) · advance paid', odo: '51,200 km', amt: 18500 },
  { id: 'c7', date: '1 Oct 2026', veh: 'Bus 1', kind: 'Fuel', what: 'Diesel 125 L · Indian Oil, Kukatpally', odo: '96,410 km', amt: 11750 },
];
const paperIssues = () => {
  const out = [];
  VEHICLES.forEach((v) => v.papers.forEach((p, i) => { const d = daysTo(p); if (d <= 45) out.push({ id: v.id + i, who: `${v.num} · ${v.reg}`, what: PAPERS[i], date: p, d }); }));
  PEOPLE.filter((p) => p.exp && p.app !== 'Disabled').forEach((p) => { const d = daysTo(p.exp); if (d <= 45) out.push({ id: p.id, who: `${p.name} · driver of ${p.veh}`, what: 'Driving licence', date: p.exp, d }); });
  return out.sort((a, b) => a.d - b.d);
};
const appTone = { Active: 'ok', Invited: 'info', Disabled: 'neutral' };

function VehiclesPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [view, setView] = useState('vehicles');
  const [q, setQ] = useState('');
  const [veh, setVeh] = useState(null);
  const [addV, setAddV] = useState(false);
  const [addD, setAddD] = useState(false);
  const [cost, setCost] = useState(false);
  const [upload, setUpload] = useState(null);
  const [people, setPeople] = useState(PEOPLE);
  const [disable, setDisable] = useState(null);
  const issues = paperIssues();
  const expired = issues.filter((x) => x.d < 0).length;
  const vRows = VEHICLES.filter((v) => !q || (v.num + v.reg + v.model + (v.route ? RT[v.route].driver : '')).toLowerCase().includes(q.toLowerCase()));
  const pRows = people.filter((p) => !q || (p.name + p.phone + (p.lic || '') + p.veh).toLowerCase().includes(q.toLowerCase()));
  const vPaper = (v) => {
    const t = v.papers.map(paperTone);
    if (t.includes('bad')) return <Pill tone="bad">{PAPERS[t.indexOf('bad')].split(' ')[0]} expired</Pill>;
    if (t.includes('warn')) return <Pill tone="warn">{PAPERS[t.indexOf('warn')].split(' ')[0]} ends soon</Pill>;
    return <Pill tone="ok" dot>All valid</Pill>;
  };
  return (
    <div>
      <ModuleHead sub="7 vehicles · 7 drivers · 4 attendants · papers and licences with reminders"
        actions={<>
          <Button variant="secondary" icon={I.UserPlus} onClick={() => setAddD(true)}>Add driver</Button>
          <Button variant="primary" icon={I.Plus} onClick={() => setAddV(true)}>Add vehicle</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Vehicles', value: '7', sub: '6 on routes · 1 under repair', icon: I.Bus },
          { label: 'Drivers', value: '7', sub: '1 hired · 1 spare', icon: I.IdCard },
          { label: 'Ending in 30 days', value: String(issues.filter((x) => x.d >= 0 && x.d <= 30).length), sub: 'Papers and licences', tone: 'warn', icon: I.CalendarClock },
          { label: 'Expired', value: String(expired), sub: 'Bus 6 PUC since 30 Sep', tone: expired ? 'bad' : undefined, icon: I.TriangleAlert },
        ]} />

        <Card>
          <CardHead title="Papers needing attention" sub="Reminders go to you 30 days before expiry, and again 7 days before" icon={I.FileText} action={<Pill tone={expired ? 'bad' : 'warn'}>{issues.length}</Pill>} />
          <ul className="px-2 pb-2">
            {issues.map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', TONE_SOFT[x.d < 0 ? 'bad' : x.d <= 30 ? 'warn' : 'info'])}>{x.what === 'Driving licence' ? <I.IdCard size={19} /> : <I.FileWarning size={19} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14.5px] truncate">{x.what} · {x.who}</p>
                  <p className={cx('text-[12.5px] truncate', x.d < 0 ? 'text-bad' : 'text-ink3')}>{x.d < 0 ? `Expired on ${nice(x.date)}. Do not run this bus until it is renewed.` : `Ends ${nice(x.date)} · in ${x.d} days`}</p>
                </div>
                {canEdit && <Button size="sm" variant={x.d < 0 ? 'primary' : 'secondary'} icon={I.Upload} onClick={() => setUpload(x)}><span className="hidden @sm:inline">Upload renewed</span><span className="@sm:hidden">Renew</span></Button>}
              </li>
            ))}
          </ul>
        </Card>

        <div className="-mx-4 px-4 @md:mx-0 @md:px-0 overflow-x-auto no-scrollbar">
          <Segmented value={view} onChange={(v) => { setView(v); setQ(''); }} className="w-max" options={[{ value: 'vehicles', label: 'Vehicles' }, { value: 'people', label: 'Drivers & attendants' }, { value: 'papers', label: 'Papers' }, { value: 'costs', label: 'Fuel & repairs' }, { value: 'vendors', label: 'Vendors' }]} />
        </div>

        {view === 'vehicles' && (
          <Card className="overflow-hidden animate-rise">
            <Toolbar><SearchBox id="veh-q" value={q} onChange={setQ} placeholder="Vehicle number, model or driver" /><ExportButton what="vehicles" /></Toolbar>
            <DataList rows={vRows} onRow={(v) => setVeh(v)} minWidth={860}
              columns={[
                { key: 'v', label: 'Vehicle', render: (v) => <div className="flex items-center gap-3"><span className="w-9 h-9 rounded-xl bg-sunken text-ink2 grid place-items-center">{v.type === 'Van' ? <I.CarFront size={18} /> : <I.Bus size={18} />}</span><div><p className="font-semibold leading-tight">{v.num}</p><p className="text-[12px] text-ink3 font-mono whitespace-nowrap">{v.reg}</p></div></div> },
                { key: 't', label: 'Type', render: (v) => <><p>{v.model}</p><p className="text-[12.5px] text-ink3">{v.seats} seats</p></> },
                { key: 'r', label: 'Route and driver', render: (v) => v.route ? <><p>Route {RT[v.route].num} · {RT[v.route].short}</p><p className="text-[12.5px] text-ink3">{RT[v.route].driver}</p></> : <span className="text-ink3">Spare</span> },
                { key: 'o', label: 'Owned or hired', render: (v) => <span className="text-[13.5px]">{v.owned}</span> },
                { key: 'g', label: 'Tracking', render: (v) => <Pill tone={v.gps === 'None' ? 'neutral' : 'info'}>{v.gps}</Pill> },
                { key: 'p', label: 'Papers', render: vPaper },
                { key: 's', label: 'Status', render: (v) => <Pill tone={v.status === 'Active' ? 'ok' : 'warn'} dot>{v.status}</Pill> },
              ]}
              mobile={(v) => ({ title: `${v.num} · ${v.reg}`, sub: `${v.model} · ${v.seats} seats · ${v.route ? RT[v.route].driver : 'Spare'}`, icon: v.type === 'Van' ? 'CarFront' : 'Bus', iconTone: v.status === 'Active' ? 'brand' : 'warn', pills: [<span key="p">{vPaper(v)}</span>] })}
              footer={`Showing ${vRows.length} of 7 vehicles`} />
          </Card>
        )}

        {view === 'people' && (
          <Card className="overflow-hidden animate-rise">
            <Toolbar><SearchBox id="drv-q" value={q} onChange={setQ} placeholder="Name, phone, licence or bus" /><ExportButton what="drivers and attendants" /></Toolbar>
            <DataList rows={pRows} minWidth={900}
              columns={[
                { key: 'n', label: 'Name', render: (p) => <div className="flex items-center gap-3"><Avatar name={p.name} size={36} /><div><p className="font-semibold leading-tight">{p.name}</p><p className="text-[12.5px] text-ink3">{p.role}</p></div></div> },
                { key: 'ph', label: 'Phone', nowrap: true, render: (p) => <span className="tnum">{p.phone}</span> },
                { key: 'l', label: 'Licence', render: (p) => p.lic ? <><p className="font-mono text-[12.5px]">{p.lic}</p><p className={cx('text-[12.5px]', paperTone(p.exp) === 'ok' ? 'text-ink3' : paperTone(p.exp) === 'warn' ? 'text-warn font-semibold' : 'text-bad font-semibold')}>Ends {nice(p.exp)}</p></> : <span className="text-ink3">Not needed</span> },
                { key: 'k', label: 'Staff or hired', render: (p) => <span className="text-[13.5px]">{p.kind}</span> },
                { key: 'a', label: 'Driver app', render: (p) => <Pill tone={appTone[p.app]}>{p.app}</Pill> },
                { key: 'v', label: 'Vehicle', nowrap: true, render: (p) => p.veh },
                { key: 'm', label: '', render: (p) => canEdit && <MoreMenu size="sm" items={[
                  [I.Phone, `Call ${p.name}`, () => toast({ title: `Calling ${p.name}`, body: p.phone, tone: 'info' })],
                  ...(p.app === 'Invited' ? [[I.Send, 'Send app invite again', () => toast({ title: `Driver app invite sent to ${p.phone}`, body: 'SMS with the Play Store link and a one-time code' })]] : []),
                  ...(p.app === 'Active' ? [[I.Ban, 'Turn off app login', () => setDisable(p), 'bad']] : []),
                  ...(p.app === 'Disabled' ? [[I.KeyRound, 'Turn app login back on', () => { setPeople((x) => x.map((y) => (y.id === p.id ? { ...y, app: 'Active' } : y))); toast({ title: `${p.name} can sign in to the driver app again` }); }]] : []),
                ]} /> },
              ]}
              mobile={(p) => ({ title: p.name, sub: `${p.role} · ${p.veh} · ${p.phone}`, avatar: p.name, pills: [<Pill key="a" tone={appTone[p.app]} className="!h-[22px] !text-[11.5px]">App {p.app.toLowerCase()}</Pill>, p.exp && paperTone(p.exp) !== 'ok' ? <Pill key="l" tone={paperTone(p.exp)} className="!h-[22px] !text-[11.5px]">Licence ends {nice(p.exp)}</Pill> : null] })}
              footer={`Showing ${pRows.length} of ${people.length} · drivers on the staff also have a Staff & HR record`} />
          </Card>
        )}

        {view === 'papers' && (
          <Card className="overflow-hidden animate-rise">
            <CardHead title="Vehicle papers" sub="Insurance, fitness, permit and pollution (PUC) expiry dates" action={<ExportButton what="vehicle papers" />} />
            <div className="overflow-x-auto scroll-thin">
              <table className="text-[13.5px] min-w-full">
                <thead>
                  <tr className="border-y border-line text-ink3 text-[12px]">
                    <th className="sticky left-0 bg-surface text-left font-semibold px-4 py-2.5 min-w-[150px]">Vehicle</th>
                    {PAPERS.map((p) => <th key={p} className="text-left font-semibold px-3 py-2.5 min-w-[150px]">{p}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {VEHICLES.map((v) => (
                    <tr key={v.id} className="border-b border-line/60 last:border-0">
                      <td className="sticky left-0 bg-surface px-4 py-2.5 whitespace-nowrap"><p className="font-semibold">{v.num}</p><p className="text-[12px] text-ink3 font-mono">{v.reg}</p></td>
                      {v.papers.map((d, i) => (
                        <td key={i} className="px-3 py-2.5">
                          <button onClick={() => canEdit && setUpload({ who: `${v.num} · ${v.reg}`, what: PAPERS[i], date: d })} className={cx('w-full text-left rounded-lg px-2.5 py-1.5', TONE_SOFT[paperTone(d)], canEdit && 'hover:brightness-95')}>
                            <span className="block font-semibold tnum text-[13px]">{nice(d)}</span>
                            <span className="block text-[11.5px] opacity-90">{paperWhen(d)}</span>
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CardHead title="Driving licences" sub="An expired licence shows in red on the trip and the Dashboard" />
            <ul className="px-2 pb-2">
              {people.filter((p) => p.lic && p.app !== 'Disabled').map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-sunken/60">
                  <Avatar name={p.name} size={34} />
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{p.name} · {p.veh}</p><p className="text-[12px] text-ink3 font-mono truncate">{p.lic}</p></div>
                  <Pill tone={paperTone(p.exp)}>{paperTone(p.exp) === 'ok' ? nice(p.exp) : paperWhen(p.exp)}</Pill>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {view === 'costs' && <CostsView onAdd={() => setCost(true)} />}

        {view === 'vendors' && (
          <div className="grid @xl:grid-cols-[minmax(0,1fr)_340px] gap-5 @lg:gap-6 items-start [&>*]:min-w-0 animate-rise">
            <Card>
              <CardHead title="Sri Lakshmi Travels" sub="Hired bus with driver and attendant · contract till 31 Mar 2027" icon={I.Building2}
                action={canEdit && <Button size="sm" variant="ghost" icon={I.Pencil} onClick={() => toast({ title: 'Editing Sri Lakshmi Travels', tone: 'info' })}>Edit</Button>} />
              <DL rows={[['Contact person', 'K. Srinivas'], ['Phone', '98490 55621'], ['Address', 'Plot 14, Phase 2, KPHB Colony, Hyderabad 500072'], ['GSTIN', <span key="g" className="font-mono text-[13px]">36ABCFS1234K1Z5</span>], ['Bank account', <span key="b" className="tnum">HDFC Bank · XXXX XXXX 4821</span>], ['Monthly charge', <b key="m" className="font-semibold tnum">{inr(110000)}</b>]]} />
              <div className="px-5 pb-5">
                <p className="eyebrow text-ink3 mb-2">Hired from this vendor</p>
                <ul className="flex flex-col gap-2">
                  {[['Bus 6 · TS 08 UC 5187', 'Eicher Skyline · 52 seats · Route 6 Chandanagar', 'Bus'], ['Jangaiah', 'Driver · licence ends 30 Jan 2027 · own driver app login', 'IdCard'], ['Renuka', 'Attendant on Bus 6', 'User']].map(([t, s, ic]) => (
                    <li key={t} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                      <span className="w-9 h-9 rounded-lg bg-sunken text-ink2 grid place-items-center shrink-0">{React.createElement(I[ic], { size: 17 })}</span>
                      <div className="min-w-0"><p className="font-semibold text-[14px] truncate">{t}</p><p className="text-[12.5px] text-ink3 truncate">{s}</p></div>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
            <Card className="p-5 flex flex-col gap-3">
              <span className="w-11 h-11 rounded-2xl bg-brand/10 text-brand grid place-items-center"><I.Handshake size={21} /></span>
              <p className="font-semibold text-[15px]">Another bus company?</p>
              <p className="text-[13.5px] text-ink3">Add the vendor once with company and bank details, then link the vehicles and drivers you hire from them.</p>
              {canEdit && <Button variant="secondary" icon={I.Plus} onClick={() => toast({ title: 'Add vendor', body: 'Name, contact, GSTIN and bank details', tone: 'info' })}>Add vendor</Button>}
            </Card>
          </div>
        )}
      </div>

      <VehicleSheet v={veh} onClose={() => setVeh(null)} onUpload={(x) => { setVeh(null); setUpload(x); }} onCost={() => { setVeh(null); setCost(true); }} />
      <AddVehicleSheet open={addV} onClose={() => setAddV(false)} />
      <AddDriverSheet open={addD} onClose={() => setAddD(false)} />
      <CostSheet open={cost} onClose={() => setCost(false)} />
      <UploadPaperSheet x={upload} onClose={() => setUpload(null)} />
      <ConfirmSheet open={!!disable} onClose={() => setDisable(null)} title={disable ? `Turn off ${disable.name}’s driver app login?` : ''}
        sub="They are signed out of the driver app at once and cannot start trips. Their trip history stays." confirmLabel="Turn off login" danger
        onConfirm={() => { const p = disable; setPeople((x) => x.map((y) => (y.id === p.id ? { ...y, app: 'Disabled' } : y))); toast({ title: `${p.name} can no longer sign in to the driver app`, undo: () => setPeople((x) => x.map((y) => (y.id === p.id ? { ...y, app: 'Active' } : y))) }); }} />
    </div>
  );
}

function CostsView({ onAdd }) {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [k, setK] = useState('all');
  const rows = COSTS.filter((c) => k === 'all' || c.kind === k);
  return (
    <div className="flex flex-col gap-5 @lg:gap-6 animate-rise">
      <div className="grid @xl:grid-cols-[minmax(0,1fr)_340px] gap-5 @lg:gap-6 items-start [&>*]:min-w-0">
        <Card className="overflow-hidden">
          <CardHead title="Fuel and repairs" sub="Each entry goes to Finance as an expense. Entries are cancelled with a reason, never deleted." icon={I.Fuel}
            action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={onAdd}>Record</Button>} />
          <Toolbar className="border-t">
            <Segmented value={k} onChange={setK} options={[{ value: 'all', label: 'All' }, { value: 'Fuel', label: 'Fuel' }, { value: 'Repair', label: 'Repairs' }]} />
            <ExportButton what="fuel and repairs" className="@md:ml-auto" />
          </Toolbar>
          <DataList rows={rows} minWidth={720}
            columns={[
              { key: 'd', label: 'Date', nowrap: true, render: (c) => c.date },
              { key: 'v', label: 'Vehicle', nowrap: true, render: (c) => c.veh },
              { key: 'w', label: 'Details', render: (c) => <><p className="leading-tight">{c.what}</p><p className="text-[12px] text-ink3">Odometer {c.odo} · bill photo added</p></> },
              { key: 'k', label: 'Type', render: (c) => <Pill tone={c.kind === 'Fuel' ? 'info' : 'warn'}>{c.kind}</Pill> },
              { key: 'a', label: 'Amount', align: 'right', render: (c) => <b className="font-semibold">{inr(c.amt)}</b> },
              { key: 'm', label: '', render: (c) => canEdit && <MoreMenu size="sm" items={[[I.Eye, 'View bill photo', () => toast({ title: `Bill for ${c.veh}, ${c.date}`, tone: 'info' })], [I.CircleX, 'Cancel with a reason', () => toast({ title: 'Cancel this entry?', body: 'Give a reason. The original stays in Finance with a reversal.', tone: 'info' }), 'bad']]} /> },
            ]}
            mobile={(c) => ({ title: `${c.veh} · ${inr(c.amt)}`, sub: `${c.date} · ${c.what}`, icon: c.kind === 'Fuel' ? 'Fuel' : 'Wrench', iconTone: c.kind === 'Fuel' ? 'info' : 'warn' })}
            footer={`Showing ${rows.length} entries from October`} />
        </Card>
        <Card>
          <CardHead title="Service schedule" sub="Every 10,000 km or 90 days, whichever comes first" icon={I.Wrench} />
          <ul className="px-5 pb-5 flex flex-col gap-3.5">
            {VEHICLES.map((v) => {
              const left = v.next - v.km; const pct = 100 - (left / 10000) * 100;
              return (
                <li key={v.id}>
                  <div className="flex justify-between text-[13.5px] mb-1"><span className="font-semibold">{v.num}</span><span className={cx('tnum', left < 1000 ? 'text-warn font-semibold' : 'text-ink3')}>{left.toLocaleString('en-IN')} km left</span></div>
                  <Progress value={pct} tone={left < 1000 ? 'warn' : 'brand'} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <Card>
        <CardHead title="Cost per vehicle" sub="Fuel and repairs, September 2026 (₹ thousand)" icon={I.ChartColumn} action={<button onClick={() => toast({ title: 'Opening Transport Reports', tone: 'info' })} className="text-[13px] font-semibold text-brand hover:underline">All months</button>} />
        <div className="px-3 pb-2"><Bars data={[{ k: 'Bus 1', v: 41 }, { k: 'Bus 2', v: 37 }, { k: 'Bus 3', v: 50, tone: 'warn' }, { k: 'Bus 4', v: 42 }, { k: 'Bus 5', v: 71, tone: 'warn' }, { k: 'Bus 6', v: 110 }, { k: 'Van 7', v: 19 }]} max={120} label={(v) => `${v}k`} ariaLabel="Cost per vehicle in September" ticks={[0, 40, 80]} /></div>
        <p className="px-5 pb-4 text-[12.5px] text-ink3">Bus 6 is the vendor’s monthly charge. Bus 5 had new tyres (₹42,000); Bus 3 a clutch plate (₹18,500).</p>
      </Card>
    </div>
  );
}

function VehicleSheet({ v, onClose, onUpload, onCost }) {
  const canEdit = useCanEdit();
  if (!v) return null;
  const r = v.route ? RT[v.route] : null;
  return (
    <Sheet open={!!v} onClose={onClose} title={`${v.num} · ${v.reg}`} sub={`${v.model} · ${v.seats} seats · ${v.owned}`} wide>
      <div className="flex flex-col gap-4">
        <div className="flex gap-1.5 flex-wrap"><Pill tone={v.status === 'Active' ? 'ok' : 'warn'} dot>{v.status}</Pill><Pill tone="info">{v.gps}</Pill>{r && <Pill tone="neutral">Route {r.num} · {r.short}</Pill>}</div>
        <div className="rounded-2xl border border-line overflow-hidden">
          <p className="eyebrow text-ink3 px-4 pt-3 pb-1">Papers</p>
          <ul className="divide-y divide-line/70">
            {v.papers.map((d, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className={cx('w-2 h-2 rounded-full shrink-0', { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad' }[paperTone(d)])} />
                <span className="flex-1 text-[14px] font-semibold">{PAPERS[i]}</span>
                <span className={cx('text-[13px] tnum', paperTone(d) === 'bad' ? 'text-bad font-semibold' : paperTone(d) === 'warn' ? 'text-warn font-semibold' : 'text-ink3')}>{nice(d)} · {paperWhen(d)}</span>
                {canEdit && paperTone(d) !== 'ok' && <Button size="sm" variant="ghost" icon={I.Upload} onClick={() => onUpload({ who: `${v.num} · ${v.reg}`, what: PAPERS[i], date: d })}>Renew</Button>}
              </li>
            ))}
          </ul>
        </div>
        <DL rows={[['Driver', r ? `${r.driver} · ${r.phone}` : 'None (spare)'], ['Attendant', r ? r.attendant : '—'], ['Odometer', `${v.km.toLocaleString('en-IN')} km`], ['Next service', `At ${v.next.toLocaleString('en-IN')} km`]]} />
        {canEdit && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" icon={I.Fuel} onClick={onCost}>Record fuel or repair</Button>
            <Button variant="ghost" icon={I.Pencil} onClick={onClose}>Edit vehicle</Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function AddVehicleSheet({ open, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ reg: '', type: 'Bus', seats: '', owned: 'Owned', vendor: 'Sri Lakshmi Travels' });
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setF({ reg: '', type: 'Bus', seats: '', owned: 'Owned', vendor: 'Sri Lakshmi Travels' }); setTried(false); } }, [open]);
  const norm = f.reg.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const dup = VEHICLES.find((v) => v.reg.replace(/\s/g, '') === norm);
  const err = {
    reg: !norm ? 'Enter the vehicle number' : !/^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/.test(norm) ? 'This doesn’t look like an Indian vehicle number, like TS 07 UB 2236' : dup ? `${dup.reg} is already added as ${dup.num}` : '',
    seats: !Number(f.seats) ? 'Enter the number of seats' : '',
  };
  return (
    <FormSheet open={open} onClose={onClose} title="Add vehicle" sub="Expiry dates can be added now or later. Reminders need them." submitLabel="Add vehicle"
      onSubmit={() => { setTried(true); if (err.reg || err.seats) return false; toast({ title: `${f.type} ${norm.replace(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{4})$/, '$1 $2 $3 $4')} added`, body: 'Assign a route and driver from its page.' }); return true; }}>
      <Field label="Vehicle number" required id="av-reg" error={tried && err.reg}><Input id="av-reg" value={f.reg} onChange={(e) => setF({ ...f, reg: e.target.value })} error={tried && err.reg} className="font-mono uppercase" placeholder="TS 07 UB 2236" autoComplete="off" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" required id="av-type"><Select id="av-type" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={['Bus', 'Van', 'Car']} /></Field>
        <Field label="Capacity (seats)" required id="av-seats" error={tried && err.seats}><Input id="av-seats" inputMode="numeric" value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value.replace(/\D/g, '') })} error={tried && err.seats} className="tnum" placeholder="40" /></Field>
      </div>
      <Field label="Owned or hired" required id="av-own"><Segmented value={f.owned} onChange={(v) => setF({ ...f, owned: v })} options={['Owned', 'Hired']} className="w-full" /></Field>
      {f.owned === 'Hired' && <Field label="Vendor" required id="av-vendor"><Select id="av-vendor" value={f.vendor} onChange={(v) => setF({ ...f, vendor: v })} options={['Sri Lakshmi Travels']} /></Field>}
      <details className="group rounded-xl border border-line px-3.5 py-2.5">
        <summary className="cursor-pointer text-[14px] font-semibold text-ink2 list-none flex items-center gap-2"><I.ChevronRight size={16} className="group-open:rotate-90 transition" />More details: route, driver, GPS, paper dates</summary>
        <div className="flex flex-col gap-3 pt-3">
          <Field label="Route and driver" id="av-route"><Select id="av-route" value="" onChange={() => {}} options={[{ value: '', label: 'Not yet' }]} /></Field>
          <Field label="GPS device" id="av-gps" hint="From the connected GPS company. The driver app also sends the location."><Select id="av-gps" value="" onChange={() => {}} options={[{ value: '', label: 'None, use the driver app' }]} /></Field>
          <div className="grid grid-cols-2 gap-3">
            {['Insurance', 'Fitness', 'Permit', 'PUC'].map((p) => <Field key={p} label={`${p} expiry`} id={`av-${p}`}><Input id={`av-${p}`} placeholder="DD-MM-YYYY" className="tnum" /></Field>)}
          </div>
        </div>
      </details>
    </FormSheet>
  );
}

function AddDriverSheet({ open, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', phone: '', role: 'Driver', lic: '', exp: '', kind: 'Staff', invite: true });
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setF({ name: '', phone: '', role: 'Driver', lic: '', exp: '', kind: 'Staff', invite: true }); setTried(false); } }, [open]);
  const digits = f.phone.replace(/\D/g, '');
  const dup = PEOPLE.find((p) => p.phone.replace(/\s/g, '') === digits);
  const err = {
    name: !f.name.trim() ? 'Enter the full name' : '',
    phone: digits.length !== 10 || !/^[6-9]/.test(digits) ? 'Enter a 10-digit Indian mobile number' : '',
    lic: f.role === 'Driver' && !f.lic.trim() ? 'A driver needs a licence number' : '',
    exp: f.role === 'Driver' && !/^\d{2}-\d{2}-\d{4}$/.test(f.exp) ? 'Enter the expiry as DD-MM-YYYY' : '',
  };
  return (
    <FormSheet open={open} onClose={onClose} title="Add driver or attendant" sub="Each one gets their own login for the driver app" submitLabel={f.invite ? 'Add and send invite' : 'Add'}
      onSubmit={() => { setTried(true); if (Object.values(err).some(Boolean)) return false; toast({ title: `${f.name.trim()} added as ${f.role.toLowerCase()}`, body: f.invite ? `Driver app invite sent to ${f.phone}` : 'No app invite sent' }); return true; }}>
      <Field label="Role" required id="ad-role"><Segmented value={f.role} onChange={(v) => setF({ ...f, role: v })} options={['Driver', 'Attendant']} className="w-full" /></Field>
      <Field label="Full name" required id="ad-name" error={tried && err.name}><Input id="ad-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={tried && err.name} autoComplete="off" /></Field>
      <Field label="Mobile number" required id="ad-phone" error={tried && err.phone} hint={dup ? `This number belongs to ${dup.name} (${dup.role}, ${dup.veh}). Open the existing record instead?` : 'The driver app login uses this number'}>
        <div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]">+91</span><Input id="ad-phone" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^\d ]/g, '').slice(0, 11) })} error={tried && err.phone} className="pl-12 tnum" placeholder="99120 33671" /></div>
      </Field>
      {f.role === 'Driver' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Licence number" required id="ad-lic" error={tried && err.lic}><Input id="ad-lic" value={f.lic} onChange={(e) => setF({ ...f, lic: e.target.value.toUpperCase() })} error={tried && err.lic} className="font-mono" placeholder="TS07 2014 0090046" /></Field>
          <Field label="Licence expiry" required id="ad-exp" error={tried && err.exp}><Input id="ad-exp" value={f.exp} onChange={(e) => setF({ ...f, exp: e.target.value })} error={tried && err.exp} className="tnum" placeholder="DD-MM-YYYY" /></Field>
        </div>
      )}
      <Field label="Staff or hired" required id="ad-kind" hint={f.kind === 'Staff' ? 'Also added to Staff & HR for attendance and salary' : 'Not on the staff. Pick the vendor they come from.'}><Segmented value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={['Staff', 'Hired']} className="w-full" /></Field>
      <div className="rounded-xl bg-sunken p-3.5 flex items-center gap-3">
        <Switch id="ad-invite" on={f.invite} onChange={(v) => setF({ ...f, invite: v })} label="Send driver app invite" />
        <label htmlFor="ad-invite" className="text-[14px]"><b className="font-semibold">Send driver app invite</b><span className="block text-[12.5px] text-ink3">SMS with the Play Store link. They see only their own trips.</span></label>
      </div>
    </FormSheet>
  );
}

function CostSheet({ open, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ veh: 'Bus 4', kind: 'Fuel', amt: '', odo: '', what: '' });
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setF({ veh: 'Bus 4', kind: 'Fuel', amt: '', odo: '', what: '' }); setTried(false); } }, [open]);
  const amt = Number(f.amt.replace(/\D/g, ''));
  return (
    <FormSheet open={open} onClose={onClose} title="Record fuel or repair" sub="Goes to Finance, Expenses. Keep the bill photo." submitLabel="Record"
      onSubmit={() => { setTried(true); if (!amt) return false; toast({ title: `${f.kind} ${inr(amt)} recorded for ${f.veh}`, body: 'Added to Finance, Expenses · Transport' }); return true; }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vehicle" required id="cs-veh"><Select id="cs-veh" value={f.veh} onChange={(v) => setF({ ...f, veh: v })} options={VEHICLES.map((v) => v.num)} /></Field>
        <Field label="Date" required id="cs-date"><Input id="cs-date" defaultValue="09-10-2026" className="tnum" /></Field>
      </div>
      <Field label="Type" required id="cs-kind"><Segmented value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={['Fuel', 'Repair']} className="w-full" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" required id="cs-amt" error={tried && !amt && 'Enter the amount on the bill'}><Input id="cs-amt" inputMode="numeric" value={f.amt} onChange={(e) => setF({ ...f, amt: e.target.value })} error={tried && !amt} className="tnum" placeholder="11,280" /></Field>
        <Field label="Odometer (km)" id="cs-odo"><Input id="cs-odo" inputMode="numeric" value={f.odo} onChange={(e) => setF({ ...f, odo: e.target.value })} className="tnum" placeholder="84,215" /></Field>
      </div>
      <Field label={f.kind === 'Fuel' ? 'Litres and pump' : 'What was repaired'} id="cs-what"><Input id="cs-what" value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} placeholder={f.kind === 'Fuel' ? '120 L · Indian Oil, Kukatpally' : 'Brake pads, front'} /></Field>
      <Button type="button" variant="secondary" icon={I.Camera} onClick={() => toast({ title: 'Bill photo added', body: 'bill-09-10-2026.jpg' })}>Add bill photo</Button>
    </FormSheet>
  );
}

function UploadPaperSheet({ x, onClose }) {
  const toast = useToast();
  const [date, setDate] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { setDate(''); setTried(false); }, [x]);
  const bad = !/^\d{2}-\d{2}-\d{4}$/.test(date) ? 'Enter the new expiry as DD-MM-YYYY' : daysTo(date) <= 0 ? 'The new expiry must be after today' : '';
  return (
    <FormSheet open={!!x} onClose={onClose} title={x ? `Renewed ${x.what}` : ''} sub={x ? `${x.who} · now ends ${nice(x.date)}` : ''} submitLabel="Save renewal"
      onSubmit={() => { setTried(true); if (bad) return false; toast({ title: `${x.what} renewed for ${x.who.split(' · ')[0]}`, body: `Valid till ${nice(date)}. Next reminder 30 days before.` }); return true; }}>
      <Field label="New expiry date" required id="up-date" error={tried && bad}><Input id="up-date" value={date} onChange={(e) => setDate(e.target.value)} error={tried && bad} placeholder="DD-MM-YYYY" className="tnum" /></Field>
      <Button type="button" variant="secondary" icon={I.Upload} onClick={() => toast({ title: 'File added', body: 'renewal-certificate.pdf · 412 KB' })}>Add the certificate (PDF or photo)</Button>
    </FormSheet>
  );
}

/* ======================= Student Transport ======================= */
const TS_ROWS = (() => {
  const rows = [{ id: FEATURED.id, s: FEATURED, route: 'R4', stop: 'KPHB 6th Phase', fee: 2200, type: 'Two-way', from: '1 Apr 2026', feeOk: true }];
  STUDENTS.forEach((s, i) => {
    if (s.id === FEATURED.id || s.status === 'Inactive' || i % 3 !== 0) return;
    const k = i / 3; const r = TR[(k * 5 + 1) % 6]; const st = r.stops[(k * 7 + 2) % r.stops.length]; const one = k % 7 === 3;
    rows.push({ id: s.id, s, route: r.id, stop: st.name, fee: one ? st.fee1 : st.fee, type: one ? 'One-way' : 'Two-way', from: i % 11 === 0 ? '1 Aug 2026' : '1 Jun 2026', feeOk: true });
  });
  let n = 0;
  STUDENTS.forEach((s, i) => {
    if (n >= 5 || s.status !== 'New' || rows.some((x) => x.id === s.id)) return;
    const r = TR[(n * 2 + 1) % 6]; const st = r.stops[(n * 3 + 1) % r.stops.length];
    rows.push({ id: s.id, s, route: r.id, stop: st.name, fee: st.fee, type: 'Two-way', from: ['5 Oct 2026', '1 Oct 2026', '28 Sep 2026', '6 Oct 2026', '1 Oct 2026'][n], feeOk: false });
    n++;
  });
  return rows;
})();
const NO_STOP = STUDENTS.filter((s, i) => i % 3 === 1 && s.status === 'Active').slice(0, 2).map((s, i) => ({ s, fee: [1800, 2400][i], since: ['Stopped transport 30 Sep', 'Moved house in September'][i] }));

function StudentsPage() {
  const { go } = useNav();
  const { role } = useRole();
  const toast = useToast();
  const canEdit = useCanEdit();
  const [rows, setRows] = useState(TS_ROWS);
  const [q, setQ] = useState('');
  const [route, setRoute] = useState('all');
  const [f, setF] = useState('all');
  const [sel, setSel] = useState(new Set());
  const [assign, setAssign] = useState(null);
  const [stopIt, setStopIt] = useState(null);
  const [pass, setPass] = useState(null);
  const [fixAll, setFixAll] = useState(false);
  const [changes, setChanges] = useState([
    { id: 'tc1', who: 'Diya Menon, UKG B', what: 'Change stop: Vasanth Nagar → KPHB 3rd Phase from 1 Nov', by: 'Anita Sharma' },
    { id: 'tc2', who: 'Rohan Gupta, 6 A', what: 'Stop transport from 1 Nov · family moving to Gachibowli', by: 'Venkatesh Goud' },
  ]);
  const missing = rows.filter((r) => !r.feeOk);
  const list = rows.filter((r) => (route === 'all' || r.route === route) && (f === 'all' || (f === 'one' ? r.type === 'One-way' : !r.feeOk)) &&
    (!q || (r.s.name + r.s.adm + r.stop).toLowerCase().includes(q.toLowerCase())));
  const used = (rid) => RT[rid].students + rows.filter((x) => x.route === rid && x.added).length;
  const addFee = (ids) => { setRows((x) => x.map((r) => (ids.includes(r.id) ? { ...r, feeOk: true } : r))); };
  const isApprover = role.id === 'principal' || role.id === 'schooladmin';
  return (
    <div>
      <ModuleHead sub="251 students use the buses. Giving a stop adds the transport fee by itself."
        actions={<>
          <Button variant="secondary" icon={I.IdCard} onClick={() => setPass(rows.slice(0, 1))}>Bus passes</Button>
          <Button variant="primary" icon={I.UserPlus} onClick={() => setAssign({ ids: [] })}>Assign transport</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        {missing.length > 0 && (
          <Banner tone="warn" title={`${missing.length} students on transport have no transport fee.`}
            action={canEdit && <Button size="sm" variant="secondary" onClick={() => setFixAll(true)}>Add fee for all {missing.length}</Button>}>
            They were given a stop before the fee head was set. Add the fee below.
          </Banner>
        )}
        <div className="grid @lg:grid-cols-2 @xl:grid-cols-3 gap-5 @lg:gap-6 items-start [&>*]:min-w-0">
            <Card>
              <CardHead title="Seats on each route" sub="A full bus takes no new students" icon={I.Armchair} />
              <ul className="px-5 pb-5 flex flex-col gap-3.5">
                {TR.map((r) => {
                  const u = used(r.id); const free = r.seats - u;
                  return (
                    <li key={r.id}>
                      <div className="flex justify-between text-[13.5px] mb-1 gap-2"><span className="font-semibold truncate">Route {r.num} · {r.short}</span><span className={cx('tnum shrink-0', free <= 3 ? 'text-warn font-semibold' : 'text-ink3')}>{u} of {r.seats} · {free} free</span></div>
                      <Progress value={(u / r.seats) * 100} tone={free <= 3 ? 'warn' : 'brand'} />
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card>
              <CardHead title="Fee check" sub="Transport and fees should always agree" icon={I.ShieldCheck} />
              <div className="px-5 pb-2 text-[13px] font-semibold text-ink2">On a bus, no transport fee <span className="text-ink3 font-normal">· {missing.length}</span></div>
              <ul className="px-2 pb-2">
                {missing.length === 0 && <li className="px-3 py-2 text-[13.5px] text-ink3 flex items-center gap-2"><I.CircleCheck size={16} className="text-ok" />Everyone on a bus has the fee.</li>}
                {missing.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-sunken/60">
                    <Avatar name={r.s.name} size={32} />
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{r.s.name}</p><p className="text-[12px] text-ink3 truncate">Route {RT[r.route].num} · {r.stop} · since {r.from}</p></div>
                    {canEdit && <Button size="sm" variant="soft" onClick={() => { addFee([r.id]); toast({ title: `Transport fee added for ${r.s.name}`, body: `${inr(r.fee)} a month · from ${r.from}` }); }}>Add fee</Button>}
                  </li>
                ))}
              </ul>
              <div className="px-5 pb-2 pt-1 text-[13px] font-semibold text-ink2 border-t border-line/70">Transport fee, but no stop <span className="text-ink3 font-normal">· {NO_STOP.length}</span></div>
              <ul className="px-2 pb-3">
                {NO_STOP.map((x) => (
                  <li key={x.s.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-sunken/60">
                    <Avatar name={x.s.name} size={32} />
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{x.s.name}</p><p className="text-[12px] text-ink3 truncate">{inr(x.fee)} a month · {x.since}</p></div>
                    {canEdit && <Button size="sm" variant="ghost" onClick={() => toast({ title: `Transport fee stopped for ${x.s.name}`, body: 'From the November installment. Paid months stay as they are.' })}>Stop fee</Button>}
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHead title="Changes waiting for approval" sub="Stop changes need the Principal’s approval" icon={I.ListChecks} action={<Pill tone="info">{changes.length}</Pill>} />
              {changes.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3">Nothing waiting.</p> : (
                <ul className="px-3 pb-3 flex flex-col gap-1">
                  {changes.map((c) => (
                    <li key={c.id} className="p-2.5 rounded-xl hover:bg-sunken/60">
                      <p className="text-[14px] font-semibold leading-snug">{c.who}</p>
                      <p className="text-[12.5px] text-ink3">{c.what} · asked by {c.by}</p>
                      {isApprover && canEdit && c.by !== role.person.name ? (
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="soft" icon={I.Check} onClick={() => { setChanges((x) => x.filter((y) => y !== c)); toast({ title: `Approved: ${c.who}`, body: 'Fee changes from the next installment.', undo: () => setChanges((x) => [c, ...x]) }); }}>Approve</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setChanges((x) => x.filter((y) => y !== c)); toast({ title: `Declined: ${c.who}`, undo: () => setChanges((x) => [c, ...x]) }); }}>Decline</Button>
                        </div>
                      ) : <p className="text-[12px] text-ink3 mt-1 flex items-center gap-1"><I.Clock size={13} />{c.by === role.person.name ? 'Your request · waiting for Lakshmi Rao' : 'Waiting for Lakshmi Rao'}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
        </div>
          <Card className="overflow-hidden">
            <Toolbar>
              <SearchBox id="ts-q" value={q} onChange={setQ} placeholder="Student name, admission no. or stop" />
              <Select id="ts-route" value={route} onChange={setRoute} className="@md:w-52" options={[{ value: 'all', label: 'All routes' }, ...TR.map((r) => ({ value: r.id, label: `Route ${r.num} · ${r.short}` }))]} />
              <Segmented value={f} onChange={setF} options={[{ value: 'all', label: 'Everyone' }, { value: 'one', label: 'One-way' }, { value: 'nofee', label: `No fee (${missing.length})` }]} />
              <ExportButton what="student transport list" />
            </Toolbar>
            {canEdit && (
              <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
                <Button size="sm" variant="secondary" icon={I.ArrowRightLeft} onClick={() => setAssign({ ids: [...sel] })}>Change stop</Button>
                <Button size="sm" variant="secondary" icon={I.IdCard} onClick={() => setPass(rows.filter((r) => sel.has(r.id)))}>Bus passes</Button>
                <Button size="sm" variant="dangerSoft" icon={I.CircleSlash} onClick={() => setStopIt([...sel])}>Stop transport</Button>
              </BulkBar>
            )}
            <DataList rows={list} select={canEdit ? [sel, setSel] : undefined} minWidth={860}
              empty={<Empty icon={I.SearchX} title="No student matches" body="Try the admission number or another route." action={<Button variant="secondary" onClick={() => { setQ(''); setRoute('all'); setF('all'); }}>Clear filters</Button>} />}
              columns={[
                { key: 'n', label: 'Student', render: (r) => <div className="flex items-center gap-3"><Avatar name={r.s.name} size={34} /><div className="min-w-0"><button onClick={(e) => { e.stopPropagation(); go('student', { id: r.s.id }); }} className="font-semibold leading-tight hover:underline text-left">{r.s.name}</button><p className="text-[12px] text-ink3 font-mono">{r.s.adm}</p></div></div> },
                { key: 'c', label: 'Class', nowrap: true, render: (r) => `${r.s.cls.replace('Class ', '')} ${r.s.sec}` },
                { key: 'r', label: 'Route and stop', render: (r) => <><p className="whitespace-nowrap">Route {RT[r.route].num} · {RT[r.route].area}</p><p className="text-[12.5px] text-ink3">{r.stop}</p></> },
                { key: 't', label: 'Type', nowrap: true, render: (r) => r.type },
                { key: 'f', label: 'From', nowrap: true, render: (r) => r.from },
                { key: 'fee', label: 'Transport fee', nowrap: true, render: (r) => r.feeOk ? <Pill tone="ok" dot>{inr(r.fee)} a month</Pill> : <Pill tone="bad">Not added</Pill> },
                { key: 'm', label: '', render: (r) => canEdit && <MoreMenu size="sm" items={[
                  ...(!r.feeOk ? [[I.IndianRupee, 'Add transport fee', () => { addFee([r.id]); toast({ title: `Transport fee added for ${r.s.name}`, body: `${inr(r.fee)} a month from ${r.from}`, undo: () => setRows((x) => x.map((y) => (y.id === r.id ? { ...y, feeOk: false } : y))) }); }]] : []),
                  [I.ArrowRightLeft, 'Change stop or route', () => setAssign({ ids: [r.id] })],
                  [I.IdCard, 'Print bus pass', () => setPass([r])],
                  [I.CircleSlash, 'Stop transport', () => setStopIt([r.id]), 'bad'],
                ]} /> },
              ]}
              mobile={(r) => ({ title: r.s.name, sub: `${r.s.cls.replace('Class ', '')} ${r.s.sec} · Route ${RT[r.route].num} · ${r.stop}`, avatar: r.s.name, pills: [r.feeOk ? <Pill key="f" tone="ok" className="!h-[22px] !text-[11.5px]">{inr(r.fee)} a month</Pill> : <Pill key="f" tone="bad" className="!h-[22px] !text-[11.5px]">No transport fee</Pill>, <Pill key="t" tone="neutral" className="!h-[22px] !text-[11.5px]">{r.type}</Pill>] })}
              footer={route === 'all' && f === 'all' && !q ? `Showing ${list.length} of 251 · example records` : `Showing ${list.length} matching`} />
          </Card>

      </div>

      <AssignSheet open={!!assign} ids={assign?.ids || []} rows={rows} onClose={() => setAssign(null)} onDone={(n) => { setSel(new Set()); setRows(n); }} />
      <ConfirmSheet open={!!stopIt} onClose={() => setStopIt(null)} title={stopIt ? `Stop transport for ${stopIt.length} ${stopIt.length === 1 ? 'student' : 'students'}?` : ''}
        sub="From 1 Nov 2026. The transport fee stops from the November installment and their seats become free. Parents are told on WhatsApp."
        confirmLabel={stopIt ? `Stop transport for ${stopIt.length}` : ''} danger
        onConfirm={() => { const ids = stopIt; const before = rows; setRows((x) => x.filter((r) => !ids.includes(r.id))); setSel(new Set()); toast({ title: `Transport stopped for ${ids.length} from 1 Nov`, body: 'Fee rows end with the October installment.', undo: () => setRows(before) }); }} />
      <ConfirmSheet open={fixAll} onClose={() => setFixAll(false)} title={`Add transport fee for ${missing.length} students?`}
        sub="Each gets the fee of their stop from the date they started. Parents see it in Parent Link." confirmLabel={`Add fee for ${missing.length} students`}
        onConfirm={() => { const ids = missing.map((r) => r.id); addFee(ids); toast({ title: `Transport fee added for ${ids.length} students`, body: 'Fee rows created in Fee Management', undo: () => setRows((x) => x.map((r) => (ids.includes(r.id) ? { ...r, feeOk: false } : r))) }); }}>
        <ul className="rounded-xl border border-line divide-y divide-line/70 text-[14px]">
          {missing.map((r) => <li key={r.id} className="flex justify-between gap-3 px-3.5 py-2"><span className="truncate">{r.s.name} <span className="text-ink3">· {r.stop}</span></span><span className="tnum font-semibold shrink-0">{inr(r.fee)}</span></li>)}
        </ul>
      </ConfirmSheet>
      <BusPassSheet list={pass} onClose={() => setPass(null)} />
    </div>
  );
}

function AssignSheet({ open, ids, rows, onClose, onDone }) {
  const toast = useToast();
  const [picked, setPicked] = useState([]);
  const [q, setQ] = useState('');
  const [route, setRoute] = useState('R4');
  const [stop, setStop] = useState('');
  const [type, setType] = useState('Two-way');
  const [from, setFrom] = useState('09-10-2026');
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    const pre = rows.filter((r) => ids.includes(r.id)).map((r) => r.s);
    setPicked(pre); setQ(''); setTried(false); setType('Two-way'); setFrom('09-10-2026');
    const first = rows.find((r) => ids.includes(r.id));
    setRoute(first ? first.route : 'R4'); setStop(first ? first.stop : '');
  }, [open]);
  const r = RT[route];
  const st = r.stops.find((s) => s.name === stop);
  const free = r.seats - r.students;
  const newOnes = picked.filter((s) => !rows.some((x) => x.id === s.id && x.route === route)).length;
  const t = q.trim().toLowerCase();
  const res = t ? STUDENTS.filter((s) => (s.name.toLowerCase().includes(t) || s.adm.toLowerCase().includes(t)) && !picked.some((p) => p.id === s.id)).slice(0, 5) : [];
  const err = {
    who: !picked.length ? 'Pick at least one student' : '',
    stop: !st ? 'Choose the stop' : '',
    seats: newOnes > free ? `Route ${r.num} bus has ${r.students} of ${r.seats} seats used. Only ${free} free; you picked ${newOnes}. Pick another route, or a bigger vehicle.` : '',
  };
  const fee = st ? (type === 'Two-way' ? st.fee : st.fee1) : 0;
  return (
    <FormSheet open={open} onClose={onClose} title={ids.length ? 'Change stop or route' : 'Assign transport'} sub="The stop’s transport fee is added to fees from this date" submitLabel={picked.length > 1 ? `Assign ${picked.length} students` : 'Assign'}
      onSubmit={() => {
        setTried(true); if (err.who || err.stop || err.seats) return false;
        const next = rows.filter((x) => !picked.some((p) => p.id === x.id));
        picked.forEach((s) => next.unshift({ id: s.id, s, route, stop, fee, type, from: from.replace(/^(\d{2})-(\d{2})-(\d{4})$/, (m, d, mo, y) => `${Number(d)} ${MON[Number(mo) - 1]} ${y}`), feeOk: true }));
        onDone(next);
        toast({ title: picked.length === 1 ? `${picked[0].name}: Route ${r.num}, ${stop}` : `${picked.length} students given Route ${r.num}, ${stop}`, body: `Transport fee ${inr(fee)} a month added from the October installment` });
        return true;
      }}>
      <Field label="Student(s)" required id="asg-q" error={tried && err.who}>
        {picked.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1">
            {picked.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 h-8 pl-1 pr-1.5 rounded-full bg-sunken text-[13px] font-semibold">
                <Avatar name={s.name} size={24} />{s.name}<span className="text-ink3 font-normal">{s.cls.replace('Class ', '')} {s.sec}</span>
                <button type="button" aria-label={`Remove ${s.name}`} onClick={() => setPicked(picked.filter((p) => p.id !== s.id))} className="w-5 h-5 grid place-items-center rounded-full hover:bg-line"><I.X size={13} /></button>
              </span>
            ))}
          </div>
        )}
        <SearchBox id="asg-q" value={q} onChange={setQ} placeholder="Name or admission no." />
        {res.length > 0 && (
          <ul className="rounded-xl border border-line divide-y divide-line/70 overflow-hidden">
            {res.map((s) => (
              <li key={s.id}><button type="button" onClick={() => { setPicked([...picked, s]); setQ(''); }} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-sunken text-left"><Avatar name={s.name} size={28} /><span className="font-semibold text-[14px] flex-1 truncate">{s.name}</span><span className="text-[12.5px] text-ink3">{s.cls.replace('Class ', '')} {s.sec}</span></button></li>
            ))}
          </ul>
        )}
      </Field>
      <Field label="Route" required id="asg-route" error={tried && err.seats} hint={!(tried && err.seats) && `${free} of ${r.seats} seats free on ${r.bus}`}>
        <Select id="asg-route" value={route} onChange={(v) => { setRoute(v); setStop(''); }} error={tried && err.seats} options={TR.map((x) => ({ value: x.id, label: `Route ${x.num} · ${x.short} (${x.seats - x.students} free)` }))} />
      </Field>
      <Field label="Stop" required id="asg-stop" error={tried && err.stop}>
        <Select id="asg-stop" value={stop} onChange={setStop} error={tried && err.stop} options={[{ value: '', label: 'Choose a stop' }, ...r.stops.map((s) => ({ value: s.name, label: `${s.name} · ${fmt(s.pick)} · ${inr(s.fee)}` }))]} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" required id="asg-type"><Segmented value={type} onChange={setType} options={['Two-way', 'One-way']} className="w-full" size="sm" /></Field>
        <Field label="From date" required id="asg-from"><Input id="asg-from" value={from} onChange={(e) => setFrom(e.target.value)} className="tnum" /></Field>
      </div>
      {st && picked.length > 0 && (
        <div className="rounded-xl bg-brand/[.06] border border-brand/20 p-3.5 text-[13.5px] text-ink2 flex gap-2.5">
          <I.IndianRupee size={17} className="text-brand shrink-0 mt-0.5" />
          <p><b className="font-semibold text-ink">{inr(fee)} a month</b> ({type.toLowerCase()}, {stop}) will be added to the fees of {picked.length === 1 ? picked[0].name : `${picked.length} students`} from the October installment. Free seats on Route {r.num}: {free} → {Math.max(0, free - newOnes)}.</p>
        </div>
      )}
    </FormSheet>
  );
}

function BusPassSheet({ list, onClose }) {
  const toast = useToast();
  if (!list) return null;
  const r0 = list[0];
  return (
    <Sheet open={!!list} onClose={onClose} title={list.length > 1 ? `${list.length} bus passes` : 'Bus pass'} sub="Design from Settings, Document Designs · ID card size"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Printer} onClick={() => { onClose(); toast({ title: `${list.length} bus ${list.length === 1 ? 'pass' : 'passes'} sent to the office printer`, body: 'Also saved as bus-passes.pdf' }); }}>Print {list.length} {list.length === 1 ? 'pass' : 'passes'}</Button></>}>
      <div className="mx-auto max-w-[320px] rounded-2xl border border-line overflow-hidden shadow-card">
        <div className="bg-brand text-brandink px-4 py-3 relative overflow-hidden"><div className="absolute inset-0 dotgrid opacity-50" /><p className="relative font-display font-semibold text-[15px] leading-tight">Sunrise Public School</p><p className="relative text-[11.5px] opacity-80">Bus pass · 2026–27</p></div>
        <div className="p-4 flex gap-3.5 bg-surface">
          <Avatar name={r0.s.name} size={64} />
          <div className="min-w-0 text-[13px]">
            <p className="font-semibold text-[15px] leading-tight">{r0.s.name}</p>
            <p className="text-ink3">{r0.s.cls} {r0.s.sec} · <span className="font-mono text-[11.5px]">{r0.s.adm}</span></p>
            <p className="mt-2"><b className="font-semibold">Route {RT[r0.route].num}</b> · {RT[r0.route].short}</p>
            <p>Stop: {r0.stop}</p>
            <p className="text-ink3">{r0.type} · pickup {fmt(RT[r0.route].stops.find((s) => s.name === r0.stop)?.pick || RT[r0.route].pick[0])}</p>
          </div>
        </div>
      </div>
      {list.length > 1 && <p className="text-center text-[13px] text-ink3 mt-3">and {list.length - 1} more, printed in batches of up to 50</p>}
    </Sheet>
  );
}

/* ======================= Trips ======================= */
const TRIPS = [
  { id: 'R1', start: T(7, 8), end: T(7, 53), reached: 9, boarded: 45, late: 0, notes: [] },
  { id: 'R2', start: T(7, 15), end: T(8, 6), reached: 8, boarded: 40, late: 1, notes: ['Over-speed 62 km/h at 7:39 AM'] },
  { id: 'R3', start: T(7, 25), end: T(8, 24), reached: 7, boarded: 36, late: 14, notes: ['14 min late · traffic at Pragathi Nagar'] },
  { id: 'R4', start: T(7, 4), end: T(8, 10), reached: 10, boarded: 47, late: 2, notes: [] },
  { id: 'R5', start: T(7, 32), end: T(8, 13), reached: 6, boarded: 31, late: 1, notes: ['Emergency pressed by mistake at 7:41 AM'] },
  { id: 'R6', start: T(7, 16), end: T(8, 19), reached: 8, boarded: 39, late: 4, missed: 'Madhava Nagar', notes: ['Missed stop: Madhava Nagar · road closed for pipeline work', 'No location 7:51–8:04 AM'] },
];
const HISTORY = [
  { id: 'h1', date: 'Thu 8 Oct', trip: 'Evening drop', done: '6 of 6', late: 'Bus 3 by 9 min', stops: '49 of 49', note: '' },
  { id: 'h2', date: 'Thu 8 Oct', trip: 'Morning pickup', done: '6 of 6', late: 'Bus 3 by 11 min, Bus 6 by 6 min', stops: '49 of 49', note: '' },
  { id: 'h3', date: 'Wed 7 Oct', trip: 'Evening drop', done: '6 of 6', late: 'None', stops: '49 of 49', note: '' },
  { id: 'h4', date: 'Wed 7 Oct', trip: 'Morning pickup', done: '6 of 6', late: 'Bus 5 by 32 min', stops: '48 of 49', note: 'Bus 5 breakdown at Y Junction. Bus 2 sent after its trip. Parents of Route 5 told at 8:01 AM.' },
  { id: 'h5', date: 'Tue 6 Oct', trip: 'Evening drop', done: '6 of 6', late: 'None', stops: '49 of 49', note: '' },
  { id: 'h6', date: 'Tue 6 Oct', trip: 'Morning pickup', done: '6 of 6', late: 'Bus 3 by 8 min', stops: '49 of 49', note: '' },
];

function TripsPage() {
  const { go } = useNav();
  const toast = useToast();
  const canEdit = useCanEdit();
  const [view, setView] = useState('today');
  const [open, setOpen] = useState(null);
  const [sched, setSched] = useState(null);
  const [hist, setHist] = useState(false);
  const [swap, setSwap] = useState(false);
  const boarded = TRIPS.reduce((a, t) => a + t.boarded, 0);
  return (
    <div>
      <ModuleHead sub="Friday 9 Oct · morning pickup done · evening drop starts 3:50 PM"
        actions={<>
          <Button variant="secondary" icon={I.ArrowRightLeft} onClick={() => setSwap(true)}>Change for one day</Button>
          <Button variant="primary" icon={I.CalendarClock} onClick={() => setSched({ route: 'R4', trip: 'morning' })}>Set trip schedule</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex flex-col @md:flex-row gap-3 @md:items-center">
          <Segmented value={view} onChange={setView} options={[{ value: 'today', label: 'Today' }, { value: 'schedule', label: 'Schedule' }, { value: 'history', label: 'History' }]} />
          <button onClick={() => go('driver')} className="@md:ml-auto inline-flex items-center gap-2 text-[13.5px] font-semibold text-brand hover:underline"><I.Smartphone size={16} />See the driver app (Android)</button>
        </div>

        {view === 'today' && (
          <>
            <Stats items={[
              { label: 'Morning trips', value: '6 of 6', sub: 'Completed by 8:24 AM', tone: 'ok', icon: I.Sunrise },
              { label: 'Students boarded', value: `${boarded} of 251`, sub: '13 absent or came by car', icon: I.UserCheck },
              { label: 'Missed stops', value: '1', sub: 'Madhava Nagar · Route 6', tone: 'warn', icon: I.MapPin },
              { label: 'Evening trips', value: '6', sub: 'Scheduled for 3:50 PM', icon: I.Sunset },
            ]} />
            <Card className="overflow-hidden">
              <CardHead title="Morning pickup" sub="Tap a trip to see each stop and who boarded" icon={I.Sunrise} action={<ExportButton what="today's trips" />} />
              <ul className="divide-y divide-line/70 border-t border-line">
                {TRIPS.map((t) => {
                  const r = RT[t.id];
                  return (
                    <li key={t.id}>
                      <button onClick={() => setOpen(t)} className="w-full text-left px-4 @md:px-5 py-3.5 flex flex-col @lg:flex-row @lg:items-center gap-2.5 @lg:gap-4 hover:bg-sunken/60 transition group">
                        <div className="flex items-center gap-3 min-w-0 @lg:w-[300px] @lg:shrink-0">
                          <BusBadge r={r} tone={t.missed ? 'warn' : t.late > 5 ? 'warn' : 'ok'} size={38} />
                          <div className="min-w-0"><p className="font-semibold text-[14.5px] truncate">{r.name}</p><p className="text-[12.5px] text-ink3 truncate">{r.driver} · {r.bus}</p></div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 flex-1 text-[13px] tnum">
                          <div><p className="text-[11.5px] text-ink3 font-semibold">Time</p><p className="font-semibold">{fmt(t.start).replace(' AM', '')}–{fmt(t.end)}</p></div>
                          <div><p className="text-[11.5px] text-ink3 font-semibold">Stops</p><p className={cx('font-semibold', t.missed && 'text-warn')}>{t.reached} of {r.stops.length}</p></div>
                          <div><p className="text-[11.5px] text-ink3 font-semibold">Boarded · dropped</p><p className="font-semibold">{t.boarded} of {r.students} · {t.boarded}</p></div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap @lg:justify-end @lg:w-[230px]">
                          <Pill tone="ok" dot>Completed</Pill>
                          {t.late > 5 && <Pill tone="warn">{t.late} min late</Pill>}
                          {t.missed && <Pill tone="warn">1 missed stop</Pill>}
                          <I.ChevronRight size={18} className="text-ink3 hidden @lg:block" />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card className="overflow-hidden">
              <CardHead title="Evening drop" sub="Drivers start these on the driver app at 3:50 PM" icon={I.Sunset} />
              <ul className="divide-y divide-line/70 border-t border-line">
                {TR.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 @md:px-5 py-3">
                    <BusBadge r={r} tone="neutral" size={36} />
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{r.name}</p><p className="text-[12.5px] text-ink3 truncate">{r.id === 'R5' ? 'Bhikshapathi (for Ramesh, on leave from 2 PM)' : r.driver} · {r.stops.length} stops · last drop {fmt(r.stops[0].drop)}</p></div>
                    {r.id === 'R5' && <Pill tone="info" className="hidden @sm:inline-flex">Driver changed today</Pill>}
                    <Pill tone="neutral">Scheduled · {fmt(EVENING)}</Pill>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}

        {view === 'schedule' && (
          <Card className="overflow-hidden animate-rise">
            <CardHead title="Trip schedule" sub="Monday to Saturday on school working days. No trips on holidays from the school calendar." icon={I.CalendarClock} />
            <DataList rows={TR} minWidth={760} footer="Dussehra holidays 19–25 Oct: no trips. Restarts Mon 26 Oct."
              onRow={canEdit ? (r) => setSched({ route: r.id, trip: 'morning' }) : undefined}
              columns={[
                { key: 'r', label: 'Route', render: (r) => <div className="flex items-center gap-3"><BusBadge r={r} size={34} /><span className="font-semibold">{r.name}</span></div> },
                { key: 'v', label: 'Vehicle and driver', render: (r) => <><p>{r.bus} · {r.driver}</p><p className="text-[12.5px] text-ink3">Attendant {r.attendant}</p></> },
                { key: 'm', label: 'Morning pickup', nowrap: true, render: (r) => <><p className="font-semibold tnum">{fmt(r.pick[0] - 10)}</p><p className="text-[12.5px] text-ink3">reaches school {fmt(r.school)}</p></> },
                { key: 'e', label: 'Evening drop', nowrap: true, render: (r) => <><p className="font-semibold tnum">{fmt(EVENING)}</p><p className="text-[12.5px] text-ink3">last drop {fmt(r.stops[0].drop)}</p></> },
                { key: 'd', label: 'Days', render: () => <span className="text-[13px]">Mon–Sat</span> },
              ]}
              mobile={(r) => ({ title: r.name, sub: `Morning ${fmt(r.pick[0] - 10)} · Evening ${fmt(EVENING)} · Mon–Sat`, icon: 'Bus', iconTone: 'brand' })} />
          </Card>
        )}

        {view === 'history' && (
          <Card className="overflow-hidden animate-rise">
            <CardHead title="Trip history" sub="Every trip with start, end, stops reached and delays" icon={I.History} action={<ExportButton what="trip history" />} />
            <DataList rows={HISTORY} minWidth={780}
              columns={[
                { key: 'd', label: 'Date', nowrap: true, render: (h) => <b className="font-semibold">{h.date}</b> },
                { key: 't', label: 'Trip', nowrap: true, render: (h) => h.trip },
                { key: 'c', label: 'Completed', nowrap: true, render: (h) => h.done },
                { key: 's', label: 'Stops reached', nowrap: true, render: (h) => <span className={h.stops !== '49 of 49' ? 'text-warn font-semibold' : ''}>{h.stops}</span> },
                { key: 'l', label: 'Late', render: (h) => <><p>{h.late}</p>{h.note && <p className="text-[12.5px] text-bad">{h.note}</p>}</> },
                { key: 'p', label: '', render: () => <Button size="sm" variant="ghost" icon={I.Play} onClick={() => setHist(true)}>Replay</Button> },
              ]}
              mobile={(h) => ({ title: `${h.date} · ${h.trip}`, sub: h.note || `${h.done} completed · late: ${h.late}`, icon: h.note ? 'TriangleAlert' : 'History', iconTone: h.note ? 'bad' : 'neutral' })} />
          </Card>
        )}
      </div>

      <TripSheet t={open} onClose={() => setOpen(null)} onReplay={() => { setOpen(null); setHist(true); }} />
      <HistorySheet open={hist} onClose={() => setHist(false)} />
      <ScheduleSheet x={sched} onClose={() => setSched(null)} />
      <FormSheet open={swap} onClose={() => setSwap(false)} title="Change vehicle or driver for one day" sub="Only for the date you pick. The schedule stays the same." submitLabel="Save change"
        onSubmit={() => { toast({ title: 'Bus 5 evening drop: Bhikshapathi drives today', body: 'He sees the trip in his driver app now. Ramesh is off from 2 PM.' }); return true; }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Route" required id="sw-route"><Select id="sw-route" value="R5" onChange={() => {}} options={TR.map((r) => ({ value: r.id, label: `Route ${r.num} · ${r.short}` }))} /></Field>
          <Field label="Trip" required id="sw-trip"><Select id="sw-trip" value="e" onChange={() => {}} options={[{ value: 'm', label: 'Morning pickup' }, { value: 'e', label: 'Evening drop' }]} /></Field>
        </div>
        <Field label="Date" required id="sw-date"><Input id="sw-date" defaultValue="09-10-2026" className="tnum" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vehicle" id="sw-veh"><Select id="sw-veh" value="Bus 5" onChange={() => {}} options={VEHICLES.filter((v) => v.status === 'Active').map((v) => v.num)} /></Field>
          <Field label="Driver" id="sw-drv" hint="Only drivers with a valid licence"><Select id="sw-drv" value="Bhikshapathi" onChange={() => {}} options={['Bhikshapathi', 'Narsimha', 'Yadagiri']} /></Field>
        </div>
      </FormSheet>
    </div>
  );
}

function TripSheet({ t, onClose, onReplay }) {
  if (!t) return null;
  const r = RT[t.id];
  const notb = NOTB[r.id];
  const names = { R4: ['Ishaan Reddy, 5 A · absent today, parent told', 'Meera Pillai, 3 B · came by car'], R3: ['Tanvi Rao, 4 B · absent today'], R6: ['5 students at Madhava Nagar: 3 came by auto, 2 absent'] };
  return (
    <Sheet open={!!t} onClose={onClose} title={`${r.name} · morning pickup`} sub={`${r.driver} · ${r.bus} · started ${fmt(t.start)}, ended ${fmt(t.end)}`} wide>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          {[['Stops reached', `${t.reached} of ${r.stops.length}`, t.missed ? 'text-warn' : ''], ['Boarded', `${t.boarded} of ${r.students}`, ''], ['Dropped at school', String(t.boarded), '']].map(([k, v, c]) => (
            <div key={k} className="rounded-xl bg-sunken/70 px-3 py-2.5"><p className="text-[11.5px] text-ink3 font-semibold">{k}</p><p className={cx('font-display font-semibold text-[18px] tnum', c)}>{v}</p></div>
          ))}
        </div>
        {t.notes.map((n) => <Banner key={n} tone={n.startsWith('Missed') || n.startsWith('Emergency') ? 'warn' : 'info'}>{n}</Banner>)}
        <div className="rounded-2xl border border-line overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_70px_70px_80px] gap-2 px-4 py-2 text-[12px] font-semibold text-ink3 border-b border-line"><span>Stop</span><span>Planned</span><span>Reached</span><span className="text-right">Boarded</span></div>
          <ul className="divide-y divide-line/70 text-[13.5px]">
            {r.stops.map((s, i) => {
              const missed = t.missed === s.name; const miss = notb[i] || 0; const act = s.pick + Math.min(t.late, i > r.stops.length - 3 ? t.late : Math.max(0, t.late - 2));
              return (
                <li key={s.name} className={cx('grid grid-cols-[minmax(0,1fr)_70px_70px_80px] gap-2 px-4 py-2 items-center', missed && 'bg-warn/[.07]')}>
                  <span className="min-w-0"><span className="font-semibold block truncate">{s.name}</span>{r.id === 'R4' && s.name === 'KPHB 6th Phase' && <span className="text-[12px] text-ink3">Aarav Sharma, 7 B boarded 7:43</span>}</span>
                  <span className="tnum text-ink3">{fmt(s.pick).replace(' AM', '')}</span>
                  <span className={cx('tnum font-semibold', missed ? 'text-warn' : '')}>{missed ? 'Missed' : fmt(act).replace(' AM', '')}</span>
                  <span className="tnum text-right">{missed ? `0 of ${s.kids}` : `${s.kids - miss} of ${s.kids}`}</span>
                </li>
              );
            })}
          </ul>
        </div>
        {names[r.id] && (
          <div>
            <p className="eyebrow text-ink3 mb-1.5">Not boarded</p>
            <ul className="text-[13.5px] flex flex-col gap-1">{names[r.id].map((n) => <li key={n} className="flex gap-2"><I.UserX size={16} className="text-ink3 shrink-0 mt-0.5" />{n}</li>)}</ul>
          </div>
        )}
        <div className="flex gap-2"><Button variant="secondary" icon={I.Play} onClick={onReplay}>Replay this trip</Button></div>
      </div>
    </Sheet>
  );
}

function ScheduleSheet({ x, onClose }) {
  const toast = useToast();
  const [days, setDays] = useState(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  const [route, setRoute] = useState('R4');
  const [trip, setTrip] = useState('morning');
  useEffect(() => { if (x) { setRoute(x.route); setTrip(x.trip); setDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']); } }, [x]);
  const r = RT[route];
  return (
    <FormSheet open={!!x} onClose={onClose} title="Trip schedule" sub="Drivers see these trips in their app on each day picked" submitLabel="Save schedule"
      onSubmit={() => { if (!days.length) return false; toast({ title: `Route ${r.num} ${trip === 'morning' ? 'morning pickup' : 'evening drop'} saved`, body: `${days.join(', ')} · drivers’ apps update now` }); return true; }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Route" required id="sc-route"><Select id="sc-route" value={route} onChange={setRoute} options={TR.map((t) => ({ value: t.id, label: `Route ${t.num} · ${t.short}` }))} /></Field>
        <Field label="Trip" required id="sc-trip"><Select id="sc-trip" value={trip} onChange={setTrip} options={[{ value: 'morning', label: 'Morning pickup' }, { value: 'evening', label: 'Evening drop' }]} /></Field>
      </div>
      <Field label="Vehicle and driver" required id="sc-veh"><Select id="sc-veh" value="own" onChange={() => {}} options={[{ value: 'own', label: `${r.bus} · ${r.driver}` }, { value: 'spare', label: 'Van 7 · Bhikshapathi' }]} /></Field>
      <Field label="Start time" required id="sc-time" hint={trip === 'morning' ? `10 minutes before the first stop (${r.stops[0].name}, ${fmt(r.pick[0])})` : 'When school gets over'}><Input id="sc-time" key={route + trip} defaultValue={trip === 'morning' ? fmt(r.pick[0] - 10) : fmt(EVENING)} className="tnum" /></Field>
      <Field label="Days" required id="sc-days" error={!days.length && 'Pick at least one day'}>
        <div className="flex gap-1.5 flex-wrap">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => {
            const on = days.includes(d);
            return <button type="button" key={d} aria-pressed={on} onClick={() => setDays(on ? days.filter((y) => y !== d) : [...days, d])} className={cx('h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition', on ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink2')}>{d}</button>;
          })}
        </div>
      </Field>
    </FormSheet>
  );
}

/* ======================= Transport Reports ======================= */
function ReportsPage() {
  const { go } = useNav();
  const toast = useToast();
  const [period, setPeriod] = useState('oct');
  const P = { oct: { label: 'October so far', trips: 96, ontime: '91%', missed: 1, cost: '₹1,174' }, sep: { label: 'September', trips: 288, ontime: '89%', missed: 3, cost: '₹1,229' }, year: { label: 'Jun to Oct 2026', trips: 1206, ontime: '90%', missed: 9, cost: '₹1,191' } }[period];
  const ex = (w) => () => toast({ title: `Exported ${w}`, body: `${P.label} · Excel, with the school name and your name on top. Logged.` });
  return (
    <div>
      <ModuleHead sub="Trips, timings, seats, costs, fees and papers" actions={<Button variant="secondary" icon={I.CalendarClock} onClick={() => toast({ title: 'Scheduled: Transport summary', body: 'Every Monday 8 AM to Lakshmi Rao and Venkatesh Goud' })}>Email every week</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Segmented value={period} onChange={setPeriod} className="self-start" options={[{ value: 'oct', label: 'This month' }, { value: 'sep', label: 'Last month' }, { value: 'year', label: 'This year' }]} />
        <Stats items={[
          { label: 'Trips run', value: String(P.trips), sub: P.label, icon: I.Route },
          { label: 'On time', value: P.ontime, sub: 'Within 5 minutes', tone: 'ok', icon: I.Timer },
          { label: 'Missed stops', value: String(P.missed), sub: 'Of all stops on all trips', tone: P.missed ? 'warn' : undefined, icon: I.MapPin },
          { label: 'Cost per student', value: P.cost, sub: 'A month, fuel and repairs', icon: I.IndianRupee },
        ]} />
        <Suggestion title="Route 3 is late most mornings" source="Trip times for Route 3, 1 Sep to 9 Oct (31 mornings)"
          actions={<><Button size="sm" variant="primary" onClick={() => go('transport', { page: 'trips' })}>Open trip schedule</Button><Button size="sm" variant="ghost" onClick={() => toast({ title: 'Thanks. We will improve these suggestions.', tone: 'info' })}>Not useful</Button></>}>
          Bus 3 reached Pragathi Nagar Kaman late on <b className="font-semibold text-ink">19 of 31 mornings</b>, by 11 minutes on average, always after 7:40 AM. Starting the trip <b className="font-semibold text-ink">10 minutes earlier (7:12 AM)</b> would likely bring it on time. Parents of the first 3 stops would need to be told.
        </Suggestion>
        <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 [&>*]:min-w-0 items-start">
          <Card>
            <CardHead title="On-time record" sub="Planned against actual arrival at each stop · goal 90%" icon={I.Timer} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('on-time record')}>Export</Button>} />
            <div className="px-5 pb-5"><HBars rows={[{ k: 'Route 1', v: 97 }, { k: 'Route 2', v: 94 }, { k: 'Route 3', v: 61 }, { k: 'Route 4', v: 93 }, { k: 'Route 5', v: 90 }, { k: 'Route 6', v: 86 }]} goal={90} lowBelow={88} labelWidth={64} /></div>
          </Card>
          <Card>
            <CardHead title="Seats used" sub="Students per route against seats" icon={I.Armchair} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('seats used')}>Export</Button>} />
            <div className="px-5 pb-5"><HBars rows={TR.map((r) => ({ k: `Route ${r.num}`, v: Math.round((r.students / r.seats) * 100), label: `${r.students}/${r.seats}` }))} labelWidth={64} /></div>
          </Card>
          <Card>
            <CardHead title="Fuel and repair costs" sub="All vehicles, by month (₹ thousand) · grey is the budget" icon={I.Fuel} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('fuel and repair costs')}>Export</Button>} />
            <div className="px-3 pb-2"><Bars data={[{ k: 'Jun', v: 292, v2: 300 }, { k: 'Jul', v: 318, v2: 300 }, { k: 'Aug', v: 301, v2: 300 }, { k: 'Sep', v: 370, v2: 300, tone: 'warn' }, { k: 'Oct', v: 82, v2: 300 }]} max={400} label={(v) => `${v}k`} ariaLabel="Monthly transport costs" ticks={[0, 150, 300]} /></div>
            <div className="px-5 pb-4"><Legend items={[['bg-brand', 'Spent'], ['bg-ink3/25', 'Budget'], ['bg-warn', 'Over budget']]} /></div>
          </Card>
          <Card className="overflow-hidden">
            <CardHead title="Transport fee by route" sub="2026–27 so far · from Fee Management" icon={I.IndianRupee} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('transport fee by route')}>Export</Button>} />
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-[13.5px] min-w-[420px]">
                <thead><tr className="text-[12px] text-ink3 text-left border-y border-line"><th className="px-5 py-2 font-semibold">Route</th><th className="px-3 py-2 font-semibold text-right">Due</th><th className="px-3 py-2 font-semibold text-right">Collected</th><th className="px-5 py-2 font-semibold text-right">%</th></tr></thead>
                <tbody>
                  {TR.map((r, i) => { const due = r.students * 2150 * 7; const pct = [94, 91, 88, 92, 84, 90][i]; return (
                    <tr key={r.id} className="border-b border-line/70 last:border-0"><td className="px-5 py-2 font-semibold">Route {r.num} · {r.short}</td><td className="px-3 py-2 text-right tnum">{inr(due)}</td><td className="px-3 py-2 text-right tnum">{inr(Math.round((due * pct) / 100 / 100) * 100)}</td><td className={cx('px-5 py-2 text-right tnum font-semibold', pct < 88 && 'text-warn')}>{pct}%</td></tr>
                  ); })}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardHead title="Alerts history" sub={P.label} icon={I.BellRing} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('alerts history')}>Export</Button>} />
            <ul className="px-2 pb-2">
              {[['Gauge', 'Over-speed', period === 'year' ? 41 : period === 'sep' ? 11 : 4, 'warn'], ['Route', 'Route deviation', period === 'year' ? 9 : 2, 'warn'], ['WifiOff', 'Vehicle offline', period === 'year' ? 27 : period === 'sep' ? 7 : 3, 'neutral'], ['Siren', 'Emergency button', period === 'year' ? 3 : 1, 'bad'], ['Wrench', 'Breakdown', period === 'year' ? 4 : 1, 'bad']].map(([ic, l, n, tone]) => (
                <li key={l} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-sunken/60">
                  <span className={cx('w-9 h-9 rounded-xl grid place-items-center shrink-0', TONE_SOFT[tone])}>{React.createElement(I[ic], { size: 17 })}</span>
                  <span className="flex-1 font-semibold text-[14px]">{l}</span>
                  <span className="font-display font-semibold text-[17px] tnum">{n}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="Papers and licences ending" sub="Next 45 days" icon={I.FileText} action={<button onClick={() => go('transport', { page: 'vehicles' })} className="text-[13px] font-semibold text-brand hover:underline">Open</button>} />
            <ul className="px-2 pb-2">
              {paperIssues().map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-3 py-2 rounded-xl">
                  <span className={cx('w-2 h-2 rounded-full shrink-0', x.d < 0 ? 'bg-bad' : x.d <= 30 ? 'bg-warn' : 'bg-info')} />
                  <span className="flex-1 min-w-0 text-[14px] truncate"><b className="font-semibold">{x.what}</b> · {x.who.split(' · ')[0]}</span>
                  <span className={cx('text-[12.5px] tnum shrink-0', x.d < 0 ? 'text-bad font-semibold' : 'text-ink3')}>{x.d < 0 ? 'Expired' : `${x.d} days`}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ======================= Transport Settings ======================= */
function SettingsPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [interval, setIntervalV] = useState('30');
  const [order, setOrder] = useState('all');
  return (
    <div>
      <ModuleHead sub="Alerts, bus messages to parents, live tracking and the driver app" />
      <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 [&>*]:min-w-0 items-start">
        <Col>
          <Card>
            <CardHead title="Live tracking" sub="Shows buses on a map during trips" icon={I.MapPinned} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              <SettingRow title="Live tracking" sub="Turn off to run buses without the map. Trips and boarding still work."><Switch id="ts-live" on label="Live tracking" onChange={() => toast({ title: 'Live tracking stays on', body: 'Turning it off asks the Principal first.', tone: 'info' })} /></SettingRow>
              <SettingRow title="Location update interval" sub="Shorter uses more of the driver’s phone battery and data" id="ts-int">
                <Segmented size="sm" value={interval} onChange={(v) => { if (!canEdit) return; setIntervalV(v); toast({ title: `Location every ${v} seconds`, body: 'Saved. Driver apps pick it up on the next trip.' }); }} options={[{ value: '15', label: '15 s' }, { value: '30', label: '30 s' }, { value: '60', label: '60 s' }]} />
              </SettingRow>
              <SettingRow title="Mark a location as old after" sub="The bus icon fades and shows ‘Last seen’"><span className="text-[14px] font-semibold tnum">2 minutes</span></SettingRow>
              <SettingRow title="Location only during a trip" sub="Collected from Start trip to End trip. Never off duty."><Pill tone="ok"><I.Lock size={12} />Always</Pill></SettingRow>
            </div>
          </Card>
          <SettingsCard title="Alerts" sub="Who is told: Venkatesh Goud and Lakshmi Rao. The emergency button is always on." icon={I.BellRing} rows={[
            { title: 'Over-speed limit', sub: 'Alert when a bus goes faster for 20 seconds', value: '50 km/h' },
            { title: 'Route deviation', sub: 'Alert when a bus leaves its route by more than', value: '300 m' },
            { title: 'Offline after', sub: 'No location from a running trip', value: '5 minutes' },
            { title: 'Trip left running', sub: 'Alert when a trip is not ended after its last stop', value: '30 minutes' },
          ]} />
          <SettingsCard title="Geofences" sub="Circles used for ‘reached’ and ‘bus arriving’" icon={I.Radar} rows={[
            { title: 'Around the school', value: '150 m' },
            { title: 'Around each stop', sub: 'Change a single stop from Routes & Stops', value: '100 m' },
          ]} />
        </Col>
        <Col>
          <SettingsCard title="Bus messages to parents" sub="Sent through Communication on WhatsApp, with SMS backup" icon={I.MessageCircle} rows={[
            { title: 'Picked up', sub: '“Aarav boarded Bus 4 at 7:43 AM”', on: true },
            { title: 'Dropped', sub: 'At school in the morning, at the stop in the evening', on: true },
            { title: 'Bus arriving', sub: 'One message per student per trip', on: true },
            { title: 'Minutes before arrival', value: '5 minutes' },
            { title: 'Delay message', sub: 'Suggested to the in-charge when a bus is 10 minutes late', on: true },
          ]} />
          <Card>
            <CardHead title="Driver app" sub="School OS Driver for Android, from the Play Store" icon={I.Smartphone} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              <SettingRow title="Mark boarding for each student" sub="Driver or attendant taps Boarded or Not boarded at each stop" id="ts-board"><Switch id="ts-board" on label="Mark boarding" onChange={() => toast({ title: 'Boarding marks stay on', body: 'Parents’ pickup messages need them.', tone: 'info' })} /></SettingRow>
              <SettingRow title="Show parents’ phone numbers to drivers" sub="Off: drivers call through the school’s number"><Switch id="ts-phone" on={false} label="Show phone numbers" onChange={() => toast({ title: 'Phone numbers stay hidden from drivers', tone: 'info' })} /></SettingRow>
            </div>
          </Card>
          <Card>
            <CardHead title="GPS tracking company" sub="For buses with a GPS device. The driver app works without one." icon={I.Satellite} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <div className="rounded-xl border border-line p-3.5 flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-ok/10 text-ok grid place-items-center shrink-0"><I.RadioTower size={19} /></span>
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px]">TrackOn GPS</p><p className="text-[12.5px] text-ink3">Connected 2 Jun 2026 · 2 devices · set up in Settings, Modules On/Off</p></div>
                <Pill tone="ok" dot>Working</Pill>
              </div>
              <ul className="text-[13.5px] divide-y divide-line/70 rounded-xl border border-line">
                {[['Bus 1 · TS 07 UA 1182', 'Device 864512039'], ['Bus 4 · TS 07 UB 2236', 'Device 864512047']].map(([v, d]) => <li key={v} className="flex justify-between gap-3 px-3.5 py-2"><span className="font-semibold truncate">{v}</span><span className="font-mono text-[12.5px] text-ink3 shrink-0">{d}</span></li>)}
              </ul>
            </div>
          </Card>
          <Card>
            <CardHead title="Transport change approvals" sub="Stored in Settings, Forms & Approvals" icon={I.ListChecks} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <Segmented value={order} onChange={(v) => { if (!canEdit) return; setOrder(v); toast({ title: v === 'all' ? 'Every stop change needs approval' : 'Only route changes need approval' }); }} className="w-full" options={[{ value: 'all', label: 'Every change' }, { value: 'route', label: 'Route only' }, { value: 'none', label: 'None' }]} />
              <p className="text-[13px] text-ink3">Approver: <b className="font-semibold text-ink2">Lakshmi Rao (Principal)</b>. Nobody approves their own request.</p>
            </div>
          </Card>
        </Col>
      </div>
    </div>
  );
}

export const TRANSPORT_PAGES = {
  live: LivePage,
  routes: RoutesPage,
  vehicles: VehiclesPage,
  students: StudentsPage,
  trips: TripsPage,
  reports: ReportsPage,
  settings: SettingsPage,
};
