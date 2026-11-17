"use client";

// The School OS Assistant's panel (docs/assistant/plan.md §1), in the
// owner-approved look of docs/assistant/mascot-live.html: the mascot (robot or
// cat, the school's choice) on top on a phone and on the left on a computer,
// a greeting, question chips, a big mic button, a keyboard button and the
// replies. The mascot follows the real conversation: listening while the mic
// is on, thinking while a turn runs, speaking while the reply is read aloud or
// shown, done after a confirmed change, sorry on a refusal or a problem.
// The header names the school ("<School> assistant") with its own logo; the
// mascot keeps the School OS badge. Type or speak; replies, questions back, the
// card and the suggestions are all in the conversation's language. Speech is
// recognised in that language (te-IN, hi-IN, en-IN), never forced to English.
// Replies are read aloud only when the person turns it on. When DREAM TEAM
// connected the AI voice (Gemini), the reply is said by it with the reply's
// feeling (warm for good news, gentle for a worry) and the mascot's mouth and
// the wave follow the real sound; otherwise, or when it cannot answer, the
// browser's own voice of the same language reads it, exactly as before; with
// none on the device the reply stays text and says so.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Keyboard, MessageCircle, Mic, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import { answerAssistantCard, sendToAssistant } from "@/app/(school)/assistant/actions";
import type { TurnReply } from "@/lib/assistant/conversation";
import { ASSISTANT_LANGS, pickVoice, SPEECH_LANG, type AssistantLang } from "@/lib/assistant/language";
import { AFTER_MS, feelingFor, LipSync, SILENT_SPEAK_MAX, soundLevel, SURPRISE_MS, type Feeling, type MascotCharacter, type ReplyFeel, type ReplyMoment } from "@/lib/assistant/mascot-state";
import { spokenText, toneFor } from "@/lib/assistant/speech";
import { words, type WordKey } from "@/lib/assistant/words";
import { playUiSound } from "@/lib/ui-sound";
import { buttonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Mascot } from "./mascot";
import s from "./mascot.module.css";

type Line = { who: "person"; text: string; voice: boolean } | { who: "assistant"; r: TurnReply };

const OWN_NAME: Record<AssistantLang, string> = { en: "English", te: "తెలుగు", hi: "हिंदी" };
const STATUS: Record<Feeling, WordKey> = { idle: "stReady", listening: "listening", thinking: "thinking", speaking: "stSpeaking", done: "stDone", happy: "stHappy", sorry: "stSorry", surprised: "stSurprised" };

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const recognitionClass = (): (new () => Recognition) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const failed = (lang: AssistantLang, conversationId: string | null): TurnReply => ({ ok: true, conversationId, lang, switched: false, reply: words(lang, "error"), by: "rules", sources: [], chips: [], card: null, feel: "sorry" });

export type AssistantPanelProps = {
  screen: string;
  school: { name: string; logoUrl: string | null };
  character: MascotCharacter;
  /** The first question chips in each conversation language. */
  chips: Record<AssistantLang, string[]>;
  /** The AI voice is connected: replies are said by it, with the browser's voice as the fallback. */
  voice?: boolean;
};

/** How long the AI voice may take to arrive before the browser's voice reads the reply instead. */
const AI_VOICE_WAIT_MS = 10_000;

export function AssistantPanel({ screen, school, character, chips: startChips, voice: aiVoice = false }: AssistantPanelProps) {
  const start: AssistantLang = (ASSISTANT_LANGS as readonly string[]).includes(screen) ? (screen as AssistantLang) : "en";
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<AssistantLang>(start);
  const [picked, setPicked] = useState<AssistantLang | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [speakOn, setSpeakOn] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [moment, setMoment] = useState<ReplyMoment>(null);
  const [typing, setTyping] = useState(false);
  const [lip] = useState(() => new LipSync());
  const rec = useRef<Recognition | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const launcher = useRef<HTMLButtonElement | null>(null);
  const flow = useRef(0);
  // The AI voice: its sound system (made once, after the person has used the panel), the request on its way, the sound playing.
  const audio = useRef<AudioContext | null>(null);
  const fetching = useRef<AbortController | null>(null);
  const playing = useRef<AudioBufferSourceNode | null>(null);
  const greeted = useRef(false);
  const w = (k: WordKey, v?: Parameters<typeof words>[2]) => words(lang, k, v);
  const firstMessage = lines.length === 0;
  const greetLang = picked ?? lang;
  const feeling = feelingFor({ listening, busy, moment });

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [lines, busy]);
  useEffect(() => () => {
    rec.current?.abort();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    fetching.current?.abort();
    void audio.current?.close().catch(() => undefined);
  }, []);
  useEffect(() => { if (open) panel.current?.focus(); }, [open]);
  // On a phone the panel fills the screen, so the page behind it stays still (page-lock.tsx);
  // on a wider screen it sits beside the page, which keeps scrolling.
  const [covers, setCovers] = useState(false);
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia("(min-width: 768px)");
    const update = () => setCovers(!wide.matches);
    update();
    wide.addEventListener("change", update);
    return () => wide.removeEventListener("change", update);
  }, [open]);

  /** Stops whatever the reply is doing (speech, mouth, the beat after it). */
  const hush = useCallback(() => {
    flow.current++;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    fetching.current?.abort();
    fetching.current = null;
    try { playing.current?.stop(); } catch { /* not started yet */ }
    playing.current = null;
    lip.clear();
    setMoment(null);
  }, [lip]);

  /** Makes the AI voice's sound system while the person is pressing something, so the browser lets it play later. */
  const unlockAudio = useCallback(() => {
    if (!aiVoice || typeof window === "undefined" || !("AudioContext" in window)) return;
    try {
      const ctx = audio.current ?? (audio.current = new AudioContext());
      if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    } catch { /* no sound system: the browser's voice reads replies */ }
  }, [aiVoice]);

  const openPanel = useCallback(() => {
    setOpen(true);
    // The School OS signature, once, the first time the panel opens (only while sound is on).
    if (!greeted.current) { greeted.current = true; playUiSound("logo"); }
    if (window.matchMedia("(min-width: 1024px)").matches) setTyping(true);
  }, []);
  const closePanel = useCallback(() => {
    setOpen(false);
    rec.current?.abort();
    hush();
    setTimeout(() => launcher.current?.focus(), 0);
  }, [hush]);

  /**
   * The reply said by the AI voice: "played" when it was heard to the end (or
   * stopped), "fallback" when there is no AI audio (not connected, refused, too
   * slow, sound blocked), so the browser's voice reads it instead.
   */
  const sayWithAi = useCallback(async (r: TurnReply, id: number): Promise<"played" | "fallback"> => {
    if (!aiVoice || !r.conversationId || typeof window === "undefined" || !("AudioContext" in window)) return "fallback";
    const ctrl = new AbortController();
    fetching.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), AI_VOICE_WAIT_MS);
    try {
      const res = await fetch("/api/v1/assistant/speak", {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", signal: ctrl.signal,
        body: JSON.stringify({ conversationId: r.conversationId, text: r.reply, lang: r.lang, feel: r.feel ?? "answer", delivery: r.delivery ?? null }),
      });
      if (flow.current !== id) return "played";
      if (res.status !== 200) return "fallback";
      const bytes = await res.arrayBuffer();
      if (flow.current !== id) return "played";
      const ctx = audio.current ?? (audio.current = new AudioContext());
      if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
      if (ctx.state !== "running") return "fallback";
      const buffer = await ctx.decodeAudioData(bytes);
      if (flow.current !== id) return "played";
      clearTimeout(timer);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const meter = ctx.createAnalyser();
      meter.fftSize = 1024;
      src.connect(meter);
      meter.connect(ctx.destination);
      const samples = new Float32Array(meter.fftSize);
      // The mouth and the wave follow the real sound.
      lip.follow(() => { meter.getFloatTimeDomainData(samples); return soundLevel(samples); });
      await new Promise<void>((done) => { src.onended = () => done(); playing.current = src; src.start(); });
      return "played";
    } catch {
      return flow.current === id ? "fallback" : "played";
    } finally {
      clearTimeout(timer);
      if (fetching.current === ctrl) fetching.current = null;
      if (flow.current === id) { lip.follow(null); playing.current = null; }
    }
  }, [aiVoice, lip]);

  /** The browser's own voice (as before the AI voice), or the mouth moving for a short while with no voice. */
  const sayInBrowser = useCallback((reply: string, l: AssistantLang, id: number, feel: ReplyFeel = "answer") => new Promise<void>((resolve) => {
    const silent = () => {
      const now = performance.now() / 1000;
      const ends = Math.min(lip.text(reply, now + 0.05), now + SILENT_SPEAK_MAX);
      setTimeout(() => { if (flow.current === id) lip.clear(); resolve(); }, (ends - now) * 1000 + 150);
    };
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!speakOn || !synth) { silent(); return; }
    const voice = pickVoice(synth.getVoices(), l);
    if (!voice) { setNote(words(l, "noVoice")); silent(); return; }
    let started = false, finished = false;
    const finish = () => { if (finished) return; finished = true; lip.clear(); resolve(); };
    try {
      synth.cancel();
      // Said the way a person says it (dates as "today", "16 November"; ₹ as rupees), in the reply's feeling.
      const spoken = spokenText(reply, l);
      const tone = toneFor(feel, l);
      const u = new SpeechSynthesisUtterance(spoken);
      u.voice = voice;
      u.lang = SPEECH_LANG[l];
      u.pitch = (character === "cat" ? 1.3 : 1.08) + tone.pitch;
      u.rate = tone.rate;
      u.onstart = () => { started = true; lip.text(spoken, performance.now() / 1000); };
      u.onboundary = (e) => {
        if (e.name && e.name !== "word") return;
        const rest = spoken.slice(e.charIndex);
        lip.word(rest.slice(0, e.charLength || Math.max(1, rest.search(/\s|$/))) || "a", performance.now() / 1000);
      };
      u.onend = finish;
      u.onerror = () => { if (!started) { finished = true; silent(); } else finish(); };
      synth.speak(u);
      setTimeout(() => { if (!started && !finished) { finished = true; synth.cancel(); silent(); } }, 1500);
    } catch { silent(); }
  }), [speakOn, character, lip]);

  /** Reads the reply aloud (when on: the AI voice, else the browser's voice) or shows it with the mouth moving for a short while. Resolves when done. */
  const say = useCallback(async (r: TurnReply, id: number, feel: ReplyFeel = "answer") => {
    if (speakOn && (await sayWithAi(r, id)) === "played") return;
    if (flow.current !== id) return;
    await sayInBrowser(r.reply, r.lang, id, feel);
  }, [speakOn, sayWithAi, sayInBrowser]);

  const take = useCallback(async (r: TurnReply) => {
    if (r.conversationId) setConversationId(r.conversationId);
    setLang(r.lang);
    setLines((ls) => [...ls, { who: "assistant", r }]);
    const feel = r.feel ?? (r.ok ? "answer" : "sorry");
    const id = ++flow.current;
    if (r.switched) { setMoment({ feel, phase: "surprise" }); await sleep(SURPRISE_MS); if (flow.current !== id) return; }
    setMoment({ feel, phase: "speaking" });
    await say(r, id, feel);
    if (flow.current !== id) return;
    if (feel === "answer") { setMoment(null); return; }
    setMoment({ feel, phase: "after" });
    await sleep(AFTER_MS[feel]);
    if (flow.current === id) setMoment(null);
  }, [say]);

  const send = useCallback(async (said: string, via: "typed" | "voice" | "chip") => {
    const words_ = said.trim();
    if (!words_ || busy) return;
    hush();
    if (speakOn) unlockAudio();
    setNote(null);
    setLines((ls) => [...ls, { who: "person", text: words_, voice: via === "voice" }]);
    setText("");
    setBusy(true);
    let r: TurnReply;
    try { r = await sendToAssistant({ conversationId, text: words_, chosen: firstMessage ? picked : null, via }); }
    catch { r = failed(lang, conversationId); }
    setBusy(false);
    void take(r);
  }, [busy, conversationId, firstMessage, hush, lang, picked, speakOn, take, unlockAudio]);

  const answer = useCallback(async (cardId: string, yes: boolean) => {
    if (!conversationId || busy) return;
    hush();
    setBusy(true);
    let r: TurnReply;
    try { r = await answerAssistantCard({ conversationId, cardId, yes }); }
    catch { r = failed(lang, conversationId); }
    setBusy(false);
    void take(r);
  }, [busy, conversationId, hush, lang, take]);

  const listen = useCallback(() => {
    // Tapping the mic while a reply is being read stops it at once and listens.
    hush();
    if (listening) { rec.current?.stop(); return; }
    const R = recognitionClass();
    if (!R) { setNote(words(lang, "noMic")); setTyping(true); return; }
    const r = new R();
    // The conversation's language; before the first message, the one picked (else the screen's).
    r.lang = SPEECH_LANG[firstMessage ? picked ?? lang : lang];
    r.interimResults = true;
    r.continuous = false;
    let final = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript; else interim += res[0].transcript;
      }
      setHeard((final + interim).trim());
    };
    r.onend = () => { setListening(false); setHeard(""); if (final.trim()) void send(final, "voice"); };
    r.onerror = () => { setListening(false); setHeard(""); };
    rec.current = r;
    setListening(true);
    r.start();
  }, [firstMessage, hush, lang, listening, picked, send]);

  // The first picture of the mascot starts loading when the person reaches for the button.
  const preload = () => { new window.Image().src = `/assistant/${character === "cat" ? "c" : "r"}-idle.webp`; };
  const title = w("schoolTitle", { school: school.name });
  const shownChips = startChips[greetLang] ?? [];

  return (
    <>
      {!open && (
        <button ref={launcher} type="button" onClick={openPanel} onPointerEnter={preload} onFocus={preload}
          className={cx(s.launcher, "fixed right-4 bottom-24 md:bottom-6 z-40 h-14 w-14 overflow-hidden rounded-full text-white flex items-center justify-center no-print focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand")}
          aria-label={title} title={title} data-assistant-launcher="">
          {/* The assistant's own face (layman test 16 Nov 2026: a book icon did not say "assistant"). */}
          <span aria-hidden="true" className={cx(s.launcherFace, character === "cat" ? s.launcherCat : s.launcherRobot)} />
          {character !== "cat" && (
            // The robot's screen is blank in its art (the panel draws the face live): the same glowing eyes and smile here.
            <svg aria-hidden="true" viewBox="0 0 56 56" className="absolute inset-0 h-full w-full">
              <g fill="#67EDFF" style={{ filter: "drop-shadow(0 0 2px #22CFEA)" }}>
                <ellipse cx="22.6" cy="22.4" rx="3" ry="3.6" /><ellipse cx="35.4" cy="22.4" rx="3" ry="3.6" />
              </g>
              <path d="M25.6 28.2q3.4 2.6 6.8 0" fill="none" stroke="#67EDFF" strokeWidth="1.6" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 2px #22CFEA)" }} />
            </svg>
          )}
        </button>
      )}
      {open && (
        <section ref={panel} tabIndex={-1} role="dialog" aria-modal={covers ? "true" : "false"} data-scroll-lock={covers ? "" : undefined} aria-label={title} onKeyDown={(e) => { if (e.key === "Escape") closePanel(); }} data-assistant-panel="" data-feeling={feeling}
          className={cx(s.panel, "fixed z-50 inset-0 md:inset-auto md:right-4 md:bottom-4 md:top-20 md:w-[440px] lg:w-[min(900px,calc(100vw-2rem))] bg-surface md:border md:border-line md:rounded-[28px] shadow-pop overflow-hidden no-print outline-none")}>
          <header className={cx(s.head, "flex items-center gap-2.5 px-4 h-14 border-b border-line")}>
            {school.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the school's own logo, a signed file link
              <img src={school.logoUrl} alt="" width={30} height={30} className="h-[30px] w-[30px] shrink-0 rounded-lg object-contain bg-white ring-1 ring-line" />
            ) : (
              <span aria-hidden="true" className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-brand/15 text-[14px] font-bold text-brand">{school.name.trim().charAt(0).toUpperCase()}</span>
            )}
            <p className="flex-1 min-w-0 line-clamp-2 font-semibold text-[15px] leading-tight">{title}</p>
            <button type="button" onClick={() => { if (speakOn) hush(); else unlockAudio(); setSpeakOn((v) => !v); }} className={buttonClass("ghost", "sm")} aria-pressed={speakOn} title={w("speakReplies")}>
              {speakOn ? <Volume2 size={17} aria-hidden="true" /> : <VolumeX size={17} aria-hidden="true" />}<span className="sr-only">{w("speakReplies")}</span>
            </button>
            <button type="button" onClick={closePanel} className={buttonClass("ghost", "sm")} title={w("close")}>
              <X size={17} aria-hidden="true" /><span className="sr-only">{w("close")}</span>
            </button>
          </header>

          <div className={cx(s.stageArea, s.stage, "flex flex-col items-center justify-center gap-1 lg:gap-6 pt-3 pb-5 lg:py-8")}>
            <span className={cx(s.status, "lg:absolute lg:top-6")} aria-hidden="true"><i />{w(STATUS[feeling])}</span>
            <Mascot character={character} feeling={feeling} lip={lip} label={w("tapHello")}
              className={cx("transition-[width] duration-300", firstMessage ? "w-[min(170px,42vw)]" : "w-[min(118px,30vw)]", "lg:w-[300px]")} />
          </div>

          <div className={cx(s.body, "overflow-y-auto overscroll-contain px-4 lg:px-6 py-4 flex flex-col gap-3")} aria-live="polite">
            {firstMessage && (
              <div className="flex flex-col gap-4 text-center lg:text-left" lang={SPEECH_LANG[greetLang]}>
                <div>
                  <h2 className="text-[21px] lg:text-[26px] leading-tight font-extrabold tracking-[-0.02em]">{words(greetLang, "greet")}</h2>
                  <p className="mt-1 text-[15px] lg:text-[16px] text-ink-2">{words(greetLang, "greetLead")}</p>
                </div>
                <div className="flex flex-col items-center lg:items-start gap-1.5">
                  <p className="text-[12.5px] font-medium text-ink-3">{words(greetLang, "picker")}</p>
                  <div className="inline-flex rounded-full border border-line bg-sunken p-1" role="group" aria-label={words(greetLang, "picker")}>
                    {ASSISTANT_LANGS.map((l) => (
                      <button key={l} type="button" onClick={() => { setPicked(l); setLang(l); }} aria-pressed={greetLang === l} lang={SPEECH_LANG[l]}
                        className={cx("min-h-9 rounded-full px-3.5 text-[13.5px] font-semibold transition-colors", greetLang === l ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}>{OWN_NAME[l]}</button>
                    ))}
                  </div>
                </div>
                {shownChips.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2 text-left">
                    {shownChips.map((c) => (
                      <button key={c} type="button" disabled={busy} onClick={() => void send(c, "chip")}
                        className={cx(s.chip, "flex min-h-12 items-center gap-2.5 text-left rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-[14px] font-semibold leading-snug hover:bg-sunken")}>
                        <MessageCircle size={18} className={cx(s.accentText, "shrink-0")} aria-hidden="true" />{c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {lines.map((l, i) => l.who === "person" ? (
              <div key={i} className={cx(s.mine, "self-end max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-[14.5px]")}>
                {l.voice && <p className="text-[11.5px] text-ink-3">{w("heard")}</p>}
                <p>{l.text}</p>
              </div>
            ) : (
              <Reply key={i} r={l.r} last={i === lines.length - 1} onChip={(c) => void send(c, "chip")} onCard={answer} busy={busy} />
            ))}
            {busy && <p className={cx(s.typing, s.accentText, "self-start rounded-2xl rounded-bl-md bg-sunken px-4 py-3 text-[13px]")} role="status"><i /><i /><i /><span className="sr-only">{w("thinking")}</span></p>}
            {listening && <p className="self-end text-[13.5px] text-ink-2" role="status">{w("listening")} {heard}</p>}
            {note && <p className="text-[13px] text-ink-3" role="status">{note}</p>}
            <div ref={end} />
          </div>

          <div className={cx(s.ctrl, "border-t border-line px-4 lg:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]")}>
            <div className="flex items-center justify-center gap-4">
              <Wave feeling={feeling} lip={lip} />
              <button type="button" onClick={listen} className={cx(s.mic, "h-16 w-16 lg:h-[68px] lg:w-[68px]")} aria-pressed={listening}>
                {listening ? <Square size={24} aria-hidden="true" /> : <Mic size={28} aria-hidden="true" />}<span className="sr-only">{listening ? w("stop") : w("speak")}</span>
              </button>
              <button type="button" onClick={() => { setTyping((v) => !v); setTimeout(() => input.current?.focus(), 0); }} aria-expanded={typing} aria-controls="assistant-type"
                className={cx("grid h-12 w-12 place-items-center rounded-full border bg-surface", typing ? cx("border-[#6A5AF9]", s.accentText) : "border-line text-ink-2")}>
                <Keyboard size={21} aria-hidden="true" /><span className="sr-only">{w("typeInstead")}</span>
              </button>
            </div>
            {typing && (
              <form id="assistant-type" className="mt-3 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void send(text, "typed"); }}>
                <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={w("placeholder")} aria-label={w("placeholder")} lang={SPEECH_LANG[lang]}
                  className="flex-1 min-w-0 h-11 rounded-xl border border-line bg-surface px-3.5 text-[15px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
                <button type="submit" disabled={busy || !text.trim()} className={buttonClass("primary", "md")}>
                  <Send size={16} aria-hidden="true" /><span className="max-sm:sr-only">{w("ask")}</span>
                </button>
              </form>
            )}
          </div>
        </section>
      )}
    </>
  );
}

/** The voice wave beside the mic: moves with the mouth while speaking, gently while listening. */
function Wave({ feeling, lip }: { feeling: Feeling; lip: LipSync }) {
  const box = useRef<HTMLDivElement | null>(null);
  const live = useRef(feeling);
  useEffect(() => { live.current = feeling; }, [feeling]);
  useEffect(() => {
    let raf = 0, smooth = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bars = box.current ? ([...box.current.querySelectorAll("i")] as HTMLElement[]) : [];
    const frame = () => {
      const now = performance.now() / 1000, f = live.current;
      smooth += ((f === "speaking" ? lip.level(now) : 0) - smooth) * 0.5;
      bars.forEach((b, i) => {
        const amp = f === "speaking" ? smooth : f === "listening" ? (reduced ? 0.4 : 0.35 + 0.3 * Math.sin(now * 6 + i)) : 0;
        const shape = 1 - Math.abs(i - 3) / 4;
        b.style.height = (6 + amp * shape * 30 * (reduced ? 1 : 0.7 + 0.3 * Math.sin(now * 11 + i * 1.7))).toFixed(1) + "px";
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [lip]);
  return <div ref={box} className={s.wave} aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <i key={i} />)}</div>;
}

function Reply({ r, last, onChip, onCard, busy }: { r: TurnReply; last: boolean; onChip: (c: string) => void; onCard: (id: string, yes: boolean) => void; busy: boolean }) {
  const w = (k: WordKey) => words(r.lang, k);
  return (
    <div className="self-start max-w-[92%] flex flex-col gap-2" lang={SPEECH_LANG[r.lang]}>
      <div className={cx("rounded-2xl rounded-bl-md px-4 py-3 text-[14.5px] leading-relaxed", r.by === "ai" ? "bg-info/10 border border-info/25" : "bg-sunken")}>
        {r.by === "ai" && <p className="text-[11.5px] font-semibold text-info mb-1">{w("suggestion")}</p>}
        <p>{r.reply}</p>
        {r.sources.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {r.sources.map((src) => (
              <li key={src.href}>
                <Link href={src.href} prefetch={false} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
                  {src.label}<ArrowRight size={13} aria-hidden="true" />
                </Link>
                {src.scope && <span className="text-[12px] text-ink-3"> · {src.scope}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {r.card && (
        <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-[14px]">
          <p className="font-semibold mb-2">{r.card.title}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {r.card.rows.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-ink-3">{row.label}</dt>
                <dd className={cx(!row.value && "text-bad")}>{row.value || "—"}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[12.5px] text-ink-3 mt-2">{r.card.also}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" disabled={busy || !r.card.ready} onClick={() => onCard(r.card!.id, true)} className={buttonClass("primary", "sm")}>{r.card.yes}</button>
            <button type="button" disabled={busy} onClick={() => onCard(r.card!.id, false)} className={buttonClass("secondary", "sm")}>{r.card.no}</button>
            <Link href={r.card.form.href} prefetch={false} className={buttonClass("ghost", "sm")}>{r.card.form.label}</Link>
          </div>
        </div>
      )}
      {last && r.chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.chips.map((c) => (
            <button key={c} type="button" disabled={busy} onClick={() => onChip(c)} className={cx(s.chip, "rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium hover:bg-sunken")}>{c}</button>
          ))}
        </div>
      )}
    </div>
  );
}
