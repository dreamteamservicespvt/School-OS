"use client";

// The School OS Assistant's panel (docs/assistant/plan.md §1): a round button
// at the bottom right opens a side panel (computer) or a full-height sheet
// (phone). Type or speak; replies, questions back, the card and the
// suggestions are all in the conversation's language. Speech is recognised in
// that language (te-IN, hi-IN, en-IN), never forced to English: before the
// first message a one-tap picker says which language the person will speak.
// Replies are read aloud only when the person turns it on, with a voice of the
// same language; with none on the device, the reply stays text and says so.
// The mascot (docs/assistant/mascot-live.html) is a separate design demo and
// is not part of this panel yet.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Mic, MessageCircle, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import { answerAssistantCard, sendToAssistant } from "@/app/(school)/assistant/actions";
import type { TurnReply } from "@/lib/assistant/conversation";
import { ASSISTANT_LANGS, pickVoice, SPEECH_LANG, type AssistantLang } from "@/lib/assistant/language";
import { words } from "@/lib/assistant/words";
import { buttonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";

type Line = { who: "person"; text: string; voice: boolean } | { who: "assistant"; r: TurnReply };

const OWN_NAME: Record<AssistantLang, string> = { en: "English", te: "తెలుగు", hi: "हिंदी" };

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const recognitionClass = (): (new () => Recognition) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function AssistantPanel({ screen }: { screen: string }) {
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
  const rec = useRef<Recognition | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const w = (k: Parameters<typeof words>[1], v?: Parameters<typeof words>[2]) => words(lang, k, v);
  const firstMessage = lines.length === 0;

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [lines, busy]);
  useEffect(() => () => { rec.current?.abort(); if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);

  const speak = useCallback((reply: string, l: AssistantLang) => {
    if (!speakOn || typeof window === "undefined" || !window.speechSynthesis) return;
    const voice = pickVoice(window.speechSynthesis.getVoices(), l);
    if (!voice) { setNote(words(l, "noVoice")); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(reply);
    u.voice = voice;
    u.lang = SPEECH_LANG[l];
    window.speechSynthesis.speak(u);
  }, [speakOn]);

  const take = useCallback((r: TurnReply) => {
    if (r.conversationId) setConversationId(r.conversationId);
    setLang(r.lang);
    setLines((ls) => [...ls, { who: "assistant", r }]);
    speak(r.reply, r.lang);
  }, [speak]);

  const send = useCallback(async (said: string, via: "typed" | "voice" | "chip") => {
    const words_ = said.trim();
    if (!words_ || busy) return;
    setNote(null);
    setLines((ls) => [...ls, { who: "person", text: words_, voice: via === "voice" }]);
    setText("");
    setBusy(true);
    try {
      take(await sendToAssistant({ conversationId, text: words_, chosen: firstMessage ? picked : null, via }));
    } catch {
      setLines((ls) => [...ls, { who: "assistant", r: { ok: true, conversationId, lang, switched: false, reply: words(lang, "error"), by: "rules", sources: [], chips: [], card: null } }]);
    } finally {
      setBusy(false);
    }
  }, [busy, conversationId, firstMessage, lang, picked, take]);

  const answer = useCallback(async (cardId: string, yes: boolean) => {
    if (!conversationId || busy) return;
    setBusy(true);
    try { take(await answerAssistantCard({ conversationId, cardId, yes })); } finally { setBusy(false); }
  }, [busy, conversationId, take]);

  const listen = useCallback(() => {
    // Tapping the mic while a reply is being read stops it at once and listens.
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (listening) { rec.current?.stop(); return; }
    const R = recognitionClass();
    if (!R) { setNote(words(lang, "noMic")); return; }
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
  }, [firstMessage, lang, listening, picked, send]);

  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="fixed right-4 bottom-24 md:bottom-6 z-40 h-14 w-14 rounded-full bg-brand text-brandink shadow-pop flex items-center justify-center no-print focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" aria-label={w("title")}>
          <MessageCircle size={24} aria-hidden="true" />
        </button>
      )}
      {open && (
        <section role="dialog" aria-modal="false" aria-label={w("title")} className="fixed z-40 inset-0 md:inset-auto md:right-4 md:bottom-4 md:top-20 md:w-[400px] flex flex-col bg-surface border-line md:border md:rounded-2xl shadow-pop no-print">
          <header className="flex items-center gap-2 px-4 h-14 border-b border-line shrink-0">
            <p className="font-semibold flex-1">{w("title")}</p>
            <button type="button" onClick={() => setSpeakOn((s) => !s)} className={buttonClass("ghost", "sm")} aria-pressed={speakOn} title={w("speakReplies")}>
              {speakOn ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}<span className="sr-only">{w("speakReplies")}</span>
            </button>
            <button type="button" onClick={() => { setOpen(false); rec.current?.abort(); window.speechSynthesis?.cancel(); }} className={buttonClass("ghost", "sm")}>
              <X size={16} aria-hidden="true" /><span className="sr-only">{w("close")}</span>
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" aria-live="polite">
            {firstMessage && (
              <div className="rounded-2xl bg-sunken px-4 py-3">
                <p className="text-[14px] mb-2">{w("picker")}</p>
                <div className="flex gap-2 flex-wrap">
                  {ASSISTANT_LANGS.map((l) => (
                    <button key={l} type="button" onClick={() => { setPicked(l); setLang(l); }} aria-pressed={(picked ?? lang) === l}
                      className={cx(buttonClass((picked ?? lang) === l ? "primary" : "secondary", "sm"))} lang={SPEECH_LANG[l]}>{OWN_NAME[l]}</button>
                  ))}
                </div>
              </div>
            )}
            {lines.map((l, i) => l.who === "person" ? (
              <div key={i} className="self-end max-w-[85%] rounded-2xl bg-brand/10 px-3.5 py-2 text-[14.5px]">
                {l.voice && <p className="text-[11.5px] text-ink3">{w("heard")}</p>}
                <p>{l.text}</p>
              </div>
            ) : (
              <Reply key={i} r={l.r} onChip={(c) => void send(c, "chip")} onCard={answer} busy={busy} />
            ))}
            {busy && <p className="text-[13px] text-ink3" role="status">{w("thinking")}</p>}
            {listening && <p className="text-[13px] text-ink3" role="status">{w("listening")} {heard}</p>}
            {note && <p className="text-[13px] text-ink3" role="status">{note}</p>}
            <div ref={end} />
          </div>

          <form className="flex items-center gap-2 p-3 border-t border-line shrink-0" onSubmit={(e) => { e.preventDefault(); void send(text, "typed"); }}>
            <button type="button" onClick={listen} className={buttonClass(listening ? "danger" : "secondary", "md")} aria-pressed={listening}>
              {listening ? <Square size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}<span className="sr-only">{listening ? w("stop") : w("speak")}</span>
            </button>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={w("placeholder")} aria-label={w("placeholder")} lang={SPEECH_LANG[lang]}
              className="flex-1 min-w-0 h-10 rounded-xl border border-line bg-surface px-3 text-[14.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
            <button type="submit" disabled={busy || !text.trim()} className={buttonClass("primary", "md")}>
              <Send size={16} aria-hidden="true" /><span className="sr-only">{w("send")}</span>
            </button>
          </form>
        </section>
      )}
    </>
  );
}

function Reply({ r, onChip, onCard, busy }: { r: TurnReply; onChip: (c: string) => void; onCard: (id: string, yes: boolean) => void; busy: boolean }) {
  const w = (k: Parameters<typeof words>[1]) => words(r.lang, k);
  return (
    <div className="self-start max-w-[92%] flex flex-col gap-2" lang={SPEECH_LANG[r.lang]}>
      <div className={cx("rounded-2xl px-3.5 py-2.5 text-[14.5px]", r.by === "ai" ? "bg-info/10 border border-info/25" : "bg-sunken")}>
        {r.by === "ai" && <p className="text-[11.5px] font-semibold text-info mb-1">{w("suggestion")}</p>}
        <p>{r.reply}</p>
        {r.sources.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {r.sources.map((s) => (
              <li key={s.href}>
                <Link href={s.href} prefetch={false} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
                  {s.label}<ArrowRight size={13} aria-hidden="true" />
                </Link>
                {s.scope && <span className="text-[12px] text-ink3"> · {s.scope}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {r.card && (
        <div className="rounded-2xl border border-line bg-surface px-3.5 py-3 text-[14px]">
          <p className="font-semibold mb-2">{r.card.title}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {r.card.rows.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-ink3">{row.label}</dt>
                <dd className={cx(!row.value && "text-bad")}>{row.value || "—"}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[12.5px] text-ink3 mt-2">{r.card.also}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" disabled={busy || !r.card.ready} onClick={() => onCard(r.card!.id, true)} className={buttonClass("primary", "sm")}>{r.card.yes}</button>
            <button type="button" disabled={busy} onClick={() => onCard(r.card!.id, false)} className={buttonClass("secondary", "sm")}>{r.card.no}</button>
            <Link href={r.card.form.href} prefetch={false} className={buttonClass("ghost", "sm")}>{r.card.form.label}</Link>
          </div>
        </div>
      )}
      {r.chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.chips.map((c) => (
            <button key={c} type="button" disabled={busy} onClick={() => onChip(c)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] hover:bg-sunken">{c}</button>
          ))}
        </div>
      )}
    </div>
  );
}
