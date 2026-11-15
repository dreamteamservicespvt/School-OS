"use client";

// The School OS Assistant's mascot: the owner-approved robot and cat art
// (public/assistant/*.webp, from docs/assistant/mascot-live.html), never
// redrawn. The robot's face screen is drawn live as neon SVG, fitted to each
// pose's measured screen; the cat has its faces in the art. Floats, tilts
// towards the pointer, crossfades between feelings, stands on a holo ring;
// sound arcs while listening, dots while thinking, sparkles when a task is
// done. The mouth moves with the words being said (LipSync). With reduced
// motion: no float, tilt or looping effects.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  CAT_HEAD, CAT_MOUTHS, CAT_POSES, MOUTH_Y, ROBOT_POSES, SCREENS, BASE_SCREEN, fxFor, LOOK, poseFor, speakMouth, superellipse,
  type Feeling, type LipSync, type MascotCharacter, type Pose, type RobotFace, type RobotPose,
} from "@/lib/assistant/mascot-state";
import s from "./mascot.module.css";

const ART = "/assistant/";
const EYE_X = 106, EYE_Y = -16;

function pair(fn: (x: number, side: -1 | 1) => ReactNode) {
  return <>{fn(-EYE_X, -1)}{fn(EYE_X, 1)}</>;
}

/** The robot's seven faces (face units: origin at the screen's centre, screen 454 x 299). */
function RobotFaceArt({ face, mouthRef }: { face: RobotFace; mouthRef: (el: SVGPathElement | null) => void }) {
  const on = (f: RobotFace) => (face === f ? "true" : "false");
  return (
    <g data-look="">
      <g className={s.x} data-on={on("idle")}>
        <g className={s.eyes}>{pair((x) => <ellipse key={x} className={s.neonFill} cx={x} cy={EYE_Y} rx="27" ry="38" />)}</g>
        <path className={s.neon} d={`M-30 ${MOUTH_Y - 4} Q0 ${MOUTH_Y + 18} 30 ${MOUTH_Y - 4}`} />
      </g>
      <g className={s.x} data-on={on("listen")}>
        <g className={s.eyes}>{pair((x) => <ellipse key={x} className={s.neonFill} cx={x} cy={EYE_Y - 4} rx="31" ry="43" />)}</g>
        <path className={s.neon} d={`M-22 ${MOUTH_Y} Q0 ${MOUTH_Y + 12} 22 ${MOUTH_Y}`} />
      </g>
      <g className={s.x} data-on={on("think")}>
        <g className={s.eyes}>{pair((x) => <ellipse key={x} className={s.neonFill} cx={x + 24} cy={EYE_Y - 26} rx="23" ry="29" />)}</g>
        <g className={s.neonFill}>{[-28, 0, 28].map((x) => <circle key={x} className={s.tdot} cx={x} cy={MOUTH_Y + 4} r="8" />)}</g>
      </g>
      <g className={s.x} data-on={on("speak")}>
        <g className={s.eyes}>{pair((x) => <path key={x} className={s.neon} d={`M${x - 44} ${EYE_Y + 16} C${x - 44} ${EYE_Y - 30} ${x + 44} ${EYE_Y - 30} ${x + 44} ${EYE_Y + 16}`} />)}</g>
        <path ref={mouthRef} className={s.neonFill} d={speakMouth(0)} />
      </g>
      <g className={s.x} data-on={on("done")}>
        <g className={s.eyes}>{pair((x) => <path key={x} className={s.neon} d={`M${x - 46} ${EYE_Y + 16} C${x - 46} ${EYE_Y - 32} ${x + 46} ${EYE_Y - 32} ${x + 46} ${EYE_Y + 16}`} />)}</g>
        <path className={s.neon} d={`M-46 ${MOUTH_Y - 8} Q0 ${MOUTH_Y + 40} 46 ${MOUTH_Y - 8}`} />
      </g>
      <g className={s.x} data-on={on("sorry")}>
        <g className={s.eyes}>{pair((x) => <ellipse key={x} className={s.neonFill} cx={x} cy={EYE_Y + 8} rx="22" ry="27" />)}</g>
        {pair((x, side) => <path key={`b${x}`} className={s.neon} d={`M${x + side * 34} ${EYE_Y - 40} L${x - side * 28} ${EYE_Y - 58}`} />)}
        <path className={s.neon} d={`M-30 ${MOUTH_Y + 16} Q0 ${MOUTH_Y - 8} 30 ${MOUTH_Y + 16}`} />
      </g>
      <g className={s.x} data-on={on("surprised")}>
        <g className={s.eyes}>{pair((x) => <g key={x}><circle className={s.neon} cx={x} cy={EYE_Y - 4} r="32" /><circle className={s.neonFill} cx={x} cy={EYE_Y - 4} r="9" /></g>)}</g>
        <ellipse className={s.neon} cx="0" cy={MOUTH_Y + 6} rx="14" ry="17" />
      </g>
    </g>
  );
}

function arcPath(cx: number, cy: number, r: number, side: -1 | 1) {
  const a = 0.62, x1 = cx + side * r * Math.cos(a), y1 = cy - r * Math.sin(a), y2 = cy + r * Math.sin(a);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 ${side > 0 ? 1 : 0} ${x1.toFixed(1)} ${y2.toFixed(1)}`;
}
function sparkPath(x: number, y: number, r: number) {
  const k = r * 0.22;
  return `M${x} ${y - r} C${x + k} ${y - k} ${x + k} ${y - k} ${x + r} ${y} C${x + k} ${y + k} ${x + k} ${y + k} ${x} ${y + r} C${x - k} ${y + k} ${x - k} ${y + k} ${x - r} ${y} C${x - k} ${y - k} ${x - k} ${y - k} ${x} ${y - r}Z`;
}

/** Arcs, sparkles and thinking dots around the head of the current pose. */
function Effects({ head, catSparks, glow, fx }: { head: { cx: number; cy: number; hw: number }; catSparks: boolean; glow: string; fx: string }) {
  const arcs: ReactNode[] = [];
  for (const side of [-1, 1] as const) for (const i of [0, 1, 2]) {
    arcs.push(<path key={`${side}${i}`} className={`${s.arc} ${i === 1 ? s.a2 : i === 2 ? s.a3 : ""}`} filter={`url(#${glow})`} d={arcPath(head.cx + side * (head.hw - 70), head.cy, 92 + i * 30, side)} />);
  }
  let sp: [number, number, number, string][] = [
    [head.cx - head.hw - 10, head.cy - 150, 34, "#FFF6C2"], [head.cx + head.hw + 6, head.cy - 190, 26, "#BDF7FF"],
    [head.cx - head.hw + 40, head.cy - 250, 18, "#E7DBFF"], [head.cx + head.hw - 20, head.cy - 60, 20, "#FFF6C2"],
  ];
  // The cat art already has sparkles on its right.
  if (catSparks) sp = [sp[0], [head.cx - head.hw - 40, head.cy - 30, 18, "#BDF7FF"], sp[2]];
  const dx = head.cx + head.hw + 4, dy = head.cy - 150;
  return (
    <svg className={s.fx} viewBox="0 0 1024 1024" aria-hidden="true" data-fx={fx}>
      <g>{arcs}</g>
      {/* Remounted each time "done" starts, so the sparkles play again. */}
      <g key={fx === "done" ? "on" : "off"}>{sp.map((p, i) => <path key={i} className={`${s.spark} ${[null, s.s2, s.s3, s.s4][i] ?? ""}`} fill={p[3]} filter={`url(#${glow})`} d={sparkPath(p[0], p[1], p[2])} />)}</g>
      <g>{[0, 1, 2].map((i) => <circle key={i} className={`${s.cdot} ${i === 1 ? s.d2 : i === 2 ? s.d3 : ""}`} cx={dx} cy={dy + i * 30} r="10" filter={`url(#${glow})`} />)}</g>
    </svg>
  );
}

const REDUCED = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (on) => { const mq = window.matchMedia(REDUCED); mq.addEventListener?.("change", on); return () => mq.removeEventListener?.("change", on); },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

export type MascotProps = {
  character: MascotCharacter;
  feeling: Feeling;
  /** The words being said move the mouth while the feeling is "speaking". */
  lip?: LipSync | null;
  /** A still picture (settings preview): no tap, no tilt, no blink. */
  still?: boolean;
  /** Read by screen readers on the tap button. */
  label?: string;
  className?: string;
};

export function Mascot({ character, feeling, lip = null, still = false, label, className }: MascotProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const glow = `${uid}-glow`, soft = `${uid}-soft`, ringGrad = `${uid}-ring`, pool = `${uid}-pool`;
  const reduced = useReducedMotion();
  const [waving, setWaving] = useState(false);
  const [blink, setBlink] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const mouthRefs = useRef<Map<string, SVGPathElement>>(new Map());
  const catMid = useRef<HTMLImageElement | null>(null);
  const catOpen = useRef<HTMLImageElement | null>(null);
  const live = useRef({ feeling, character, reduced, still, lip });
  useLayoutEffect(() => { live.current = { feeling, character, reduced, still, lip }; });

  const greet = waving && feeling === "idle";
  const pose: Pose = poseFor(character, feeling, greet);
  const face: RobotFace = greet ? "done" : LOOK[feeling].face;
  const fx = fxFor(character, feeling, greet) ?? "";
  const head = character === "robot" ? { cx: SCREENS[pose as RobotPose].cx, cy: SCREENS[pose as RobotPose].cy, hw: SCREENS[pose as RobotPose].w * 0.5 + 120 } : CAT_HEAD;


  // A small pop when the pose changes.
  const lastPose = useRef(pose);
  useEffect(() => {
    if (lastPose.current === pose) return;
    lastPose.current = pose;
    if (!reduced) popRef.current?.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.025)" }, { transform: "scale(1)" }], { duration: 260, easing: "cubic-bezier(.3,.7,.4,1)" });
  }, [pose, reduced]);


  // Blink now and then while idle or listening.
  useEffect(() => {
    if (still || character !== "robot") return;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(() => {
        const f = live.current.feeling;
        if (f === "idle" || f === "listening") { setBlink(true); setTimeout(() => setBlink(false), 120); }
        next();
      }, 2400 + Math.random() * 3000);
    };
    next();
    return () => clearTimeout(t);
  }, [still, character]);

  // One frame loop: mouth, pointer tilt and the eyes following it.
  useEffect(() => {
    let tx = 0, ty = 0, cx = 0, cy = 0, mouth = 0, raf = 0, catFrame = 0, catAt = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !rootRef.current) return;
      const r = rootRef.current.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.45)));
      ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.4)) / (window.innerHeight * 0.45)));
    };
    const leave = () => { tx = 0; ty = 0; };
    if (!still) { window.addEventListener("pointermove", move, { passive: true }); document.addEventListener("pointerleave", leave); }
    const frame = () => {
      const { feeling: f, character: c, reduced: rm, lip: l } = live.current;
      const now = performance.now() / 1000;
      const target = f === "speaking" && l ? l.level(now) : 0;
      mouth += (target - mouth) * 0.5;
      if (c === "robot") {
        const d = speakMouth(mouth);
        mouthRefs.current.forEach((p) => p.setAttribute("d", d));
      } else {
        const want = target > 0.62 ? 2 : target > 0.22 ? 1 : 0;
        const t = performance.now();
        if (want !== catFrame && t - catAt >= 70) { catFrame = want; catAt = t; }
        if (catMid.current) catMid.current.style.opacity = catFrame === 1 ? "1" : "0";
        if (catOpen.current) catOpen.current.style.opacity = catFrame === 2 ? "1" : "0";
      }
      const k = rm ? 1 : 0.08;
      cx += ((rm ? 0 : tx) - cx) * k; cy += ((rm ? 0 : ty) - cy) * k;
      if (tiltRef.current) tiltRef.current.style.transform = rm ? "none" : `rotateY(${(cx * 6).toFixed(2)}deg) rotateX(${(-cy * 6).toFixed(2)}deg)`;
      const look = `translate(${(cx * 16).toFixed(1)} ${(cy * 10).toFixed(1)})`;
      rootRef.current?.querySelectorAll("[data-look]").forEach((g) => g.setAttribute("transform", look));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave); };
  }, [still]);

  const tap = () => {
    if (still || feeling !== "idle") return;
    setWaving(true);
    if (!reduced) popRef.current?.animate?.([{ transform: "rotate(0) scale(1)" }, { transform: "rotate(-3deg) scale(1.03)" }, { transform: "rotate(3deg) scale(1.03)" }, { transform: "rotate(-1.5deg) scale(1.01)" }, { transform: "rotate(0) scale(1)" }], { duration: 700, easing: "ease-in-out" });
    setTimeout(() => setWaving(false), 1600);
  };

  const poses = character === "robot" ? ROBOT_POSES : CAT_POSES;
  const clips = useMemo(() => Object.fromEntries(ROBOT_POSES.map((p) => [p, superellipse(SCREENS[p].w - 14, SCREENS[p].h - 14, SCREENS[p].n)])), []);

  const Tag = still ? "div" : "button";
  return (
    <div ref={rootRef} className={`${s.wrap} ${still ? s.still : ""} ${className ?? ""}`} data-blink={blink ? "true" : "false"} data-feeling={feeling} data-character={character}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
        <defs>
          <filter id={glow} x="-40%" y="-60%" width="180%" height="220%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b1" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="11" result="b2" />
            <feColorMatrix in="b1" type="matrix" values="0 0 0 0 0.13  0 0 0 0 0.85  0 0 0 0 1  0 0 0 1.2 0" result="g1" />
            <feColorMatrix in="b2" type="matrix" values="0 0 0 0 0.10  0 0 0 0 0.70  0 0 0 0 1  0 0 0 0.55 0" result="g2" />
            <feMerge><feMergeNode in="g2" /><feMergeNode in="g1" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id={soft} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
          <linearGradient id={ringGrad} x1="0" x2="1">
            <stop offset="0" stopColor="#C9A8FF" stopOpacity=".2" /><stop offset=".5" stopColor="#B9F6FF" /><stop offset="1" stopColor="#C9A8FF" stopOpacity=".2" />
          </linearGradient>
          <radialGradient id={pool}>
            <stop offset="0" stopColor="#9BEFFF" stopOpacity=".55" /><stop offset=".55" stopColor="#8C7BFF" stopOpacity=".18" /><stop offset="1" stopColor="#8C7BFF" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
      <div className={s.platform} aria-hidden="true">
        <svg viewBox="0 0 360 100">
          <ellipse cx="180" cy="50" rx="150" ry="34" fill={`url(#${pool})`} />
          <ellipse className={s.shadow} cx="180" cy="44" rx="78" ry="13" fill="#0B0640" opacity=".5" filter={`url(#${soft})`} />
          <ellipse className={s.ring} cx="180" cy="52" rx="168" ry="38" fill="none" stroke={`url(#${ringGrad})`} strokeWidth="2.4" filter={`url(#${glow})`} />
          <ellipse className={`${s.ring} ${s.r2}`} cx="180" cy="52" rx="126" ry="27" fill="none" stroke={`url(#${ringGrad})`} strokeWidth="2" opacity=".8" />
          <ellipse className={`${s.ring} ${s.r3}`} cx="180" cy="52" rx="86" ry="17" fill="none" stroke="#B9F6FF" strokeOpacity=".55" strokeWidth="1.6" />
        </svg>
      </div>
      <Tag {...(still ? { "aria-hidden": true } : { type: "button" as const, onClick: tap, "aria-label": label })} className={s.char}>
        <div ref={tiltRef} className={s.tilt}>
          <div className={still || reduced ? undefined : s.bob} style={still || reduced ? { position: "absolute", inset: 0 } : undefined}>
            <div ref={popRef} className={s.pop}>
              {poses.map((p) => (
                <div key={p} className={s.pose} data-on={p === pose ? "true" : "false"} data-pose={p}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size art stacked for crossfades; the face is drawn over the exact pixels */}
                  <img src={`${ART}${p}.webp`} alt="" width={1024} height={1024} decoding="async" fetchPriority={p === pose ? "high" : "low"} draggable={false} />
                  {p === "c-idle" && CAT_MOUTHS.map((m) => (
                    // eslint-disable-next-line @next/next/no-img-element -- the cat's speaking mouth frames over c-idle
                    <img key={m} ref={m === "c-speak-mid" ? catMid : catOpen} className={s.mouth} src={`${ART}${m}.webp`} alt="" width={1024} height={1024} decoding="async" fetchPriority="low" draggable={false} />
                  ))}
                  {character === "robot" && (
                    <svg className={s.face} viewBox="0 0 1024 1024" aria-hidden="true">
                      <defs><clipPath id={`${uid}-clip-${p}`}><path d={clips[p]} /></clipPath></defs>
                      <g transform={`translate(${SCREENS[p as RobotPose].cx} ${SCREENS[p as RobotPose].cy}) rotate(${SCREENS[p as RobotPose].rot})`}>
                        <g clipPath={`url(#${uid}-clip-${p})`}>
                          <g filter={`url(#${glow})`}>
                            <g transform={`scale(${(SCREENS[p as RobotPose].w / BASE_SCREEN.w).toFixed(4)} ${(SCREENS[p as RobotPose].h / BASE_SCREEN.h).toFixed(4)})`}>
                              <RobotFaceArt face={face} mouthRef={(el) => { if (el) mouthRefs.current.set(p, el); else mouthRefs.current.delete(p); }} />
                            </g>
                          </g>
                        </g>
                      </g>
                    </svg>
                  )}
                </div>
              ))}
              <Effects head={head} catSparks={character === "cat"} glow={glow} fx={fx} />
            </div>
          </div>
        </div>
      </Tag>
    </div>
  );
}

export const mascotStyles = s;
