"use client";

// "Translate for parents" on Send Message (gap list G40; 11-communication.md, Send Message, Translation).
// Shown only when the school's AI assistant and its translation switch are on for this person. The typed
// message is translated once for each language the chosen parents read; each version shows beside the
// English as a Suggestion to read and edit. Only when the sender ticks "Use these translations" are they
// sent with the form, and each parent's copy ends with "Translated from English". Changing the English
// afterwards stops the send until it is translated again or sent in English.
import { useEffect, useState } from "react";
import { Languages, Sparkles, X } from "lucide-react";
import { translateForParents, type TranslateState } from "./actions";
import { TR_FIELDS, translatedLabel, translationKey, translationProblem, type TranslationLanguage } from "@/lib/messaging/translation";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { Words } from "@/lib/i18n/client";

type Version = NonNullable<TranslateState["versions"]>[number] & { aiText: string; aiTitle: string | null };

export function TranslatePanel({ text, title, languages, getForm, onChanged, onBlock }: {
  text: string;
  title: string;
  /** Parents' languages other than English the typed text reaches now, from the live preview ("Telugu"). */
  languages: { name: string; messages: number }[];
  getForm: () => FormData | null;
  onChanged: () => void;
  onBlock: (problem: string | null) => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [use, setUse] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const stale = Boolean(from) && from !== translationKey(text, title);
  const problems = (versions ?? []).map((v) => (v.text.trim() ? translationProblem({ text: text.trim(), title: title.trim() || null }, { text: v.text, title: v.title }, v.language) : null));
  const usable = (versions ?? []).filter((v) => v.text.trim());
  const blocking = !use ? null : stale ? "You changed the message after it was translated. Translate it again, or send in English." : problems.find(Boolean) ?? null;
  useEffect(() => { onBlock(blocking); }, [blocking, onBlock]);

  async function translate() {
    const fd = getForm();
    if (!fd) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await translateForParents(fd);
      if (r.versions?.length) {
        setVersions(r.versions.map((v) => ({ ...v, aiText: v.text, aiTitle: v.title })));
        setFrom(r.from ?? null);
        setUse(false);
        onChanged();
      }
      setMessage(r.ok ? null : r.message ?? "Nothing could be translated. Send in English, or try again.");
    } catch {
      setMessage("The translation did not come back. Try again, or send in English.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setVersions(null);
    setFrom(null);
    setUse(false);
    setMessage(null);
    onChanged();
  }

  function edit(lang: TranslationLanguage, patch: Partial<Pick<Version, "text" | "title">>) {
    setVersions((vs) => vs?.map((v) => (v.language === lang ? { ...v, ...patch } : v)) ?? null);
    if (use) onChanged();
  }

  const sending = use && !stale && usable.length > 0;
  return (
    <div className="rounded-xl border border-line p-3.5 flex flex-col gap-3">
      {/* Sent with the form only once the sender confirmed them. */}
      {sending && from && (
        <>
          <input type="hidden" name={TR_FIELDS.on} value="on" />
          <input type="hidden" name={TR_FIELDS.from} value={from} />
          {usable.map((v) => (
            <span key={v.language}>
              <input type="hidden" name={TR_FIELDS.text(v.language)} value={v.text} />
              {title.trim() && <input type="hidden" name={TR_FIELDS.title(v.language)} value={v.title ?? ""} />}
              {(v.text !== v.aiText || (v.title ?? "") !== (v.aiTitle ?? "")) && <input type="hidden" name={TR_FIELDS.edited(v.language)} value="on" />}
            </span>
          ))}
        </>
      )}
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-sunken text-ink2 grid place-items-center shrink-0"><Languages size={17} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold"><Words k="Translate into each parent's language" /></p>
          <p className="text-[12.5px] text-ink3 mt-0.5">
            {languages.length
              ? `${languages.map((l) => `${l.name} (${l.messages})`).join(", ")}. You read and can change each translation before sending; their copy says "Translated from English". SMS and templates go as they are.`
              : "Everyone chosen reads English, or gets this by SMS or a template. Nothing to translate."}
          </p>
        </div>
        {versions ? (
          <Button size="sm" variant="ghost" icon={X} onClick={clear}><Words k="Send in English" /></Button>
        ) : (
          <Button size="sm" variant="secondary" icon={Sparkles} loading={busy} loadingText="Translating" disabled={!languages.length || !text.trim()} onClick={translate}><Words k="Translate for parents" /></Button>
        )}
      </div>
      {message && <p className="text-[12.5px] text-warn" role="status">{message}</p>}

      {versions && (
        <>
          {stale && <p className="text-[12.5px] text-bad" role="alert"><Words k="You changed the message after it was translated." /> <button type="button" className="underline font-semibold" onClick={translate}><Words k="Translate again" /></button><Words k=", or send in English." /></p>}
          <ul className="flex flex-col gap-3" aria-label="Translations">
            {versions.map((v, i) => (
              <li key={v.language} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl bg-sunken/70 border border-line p-3">
                  <p className="text-[12px] font-semibold text-ink3 mb-1"><Words k="English, as typed" /></p>
                  {title.trim() && <p className="text-[13.5px] font-semibold mb-1 break-words">{title}</p>}
                  <p className="text-[13.5px] leading-relaxed whitespace-pre-line break-words">{text}</p>
                </div>
                <div className="rounded-xl border border-brand/25 bg-brand/[.03] p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] font-semibold text-ink3 flex-1">{v.name} · {v.messages} <Words k="message" />{v.messages === 1 ? "" : "s"}</p>
                    <Pill tone="brand" className="!h-5 !text-[11px]"><Words k="Suggestion" /></Pill>
                  </div>
                  {v.problem && !v.text.trim() && <p className="text-[12.5px] text-warn">{v.problem}</p>}
                  {title.trim() && (
                    <input aria-label={`${v.name} title`} value={v.title ?? ""} maxLength={120} onChange={(e) => edit(v.language, { title: e.target.value })} className={cx(inputCls(), "h-10")} lang={v.language} />
                  )}
                  <textarea aria-label={`${v.name} message`} rows={4} value={v.text} maxLength={1000} lang={v.language} onChange={(e) => edit(v.language, { text: e.target.value })}
                    aria-invalid={problems[i] ? true : undefined} className={cx(inputCls(Boolean(problems[i])), "py-2")} placeholder={`Type the ${v.name} version, or leave it empty to send these parents English`} />
                  {problems[i] && <p className="text-[12.5px] text-bad" role="alert">{problems[i]}</p>}
                  {v.text.trim() && <p className="text-[12px] text-ink3"><Words k="Ends with:" /> {translatedLabel(v.language)}</p>}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-start gap-3">
            <div className="pt-0.5"><Checkbox id="send-translations" checked={use} onChange={(on) => { setUse(on); onChanged(); }} label="I have read these translations. Use them." /></div>
            <label htmlFor="send-translations" className="text-[14px]">
              <span className="font-semibold"><Words k="I have read these translations. Use them." /></span>
              <span className="block text-[12.5px] text-ink3"><Words k="Until this is ticked, everyone gets the English. A language left empty gets the English." /></span>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
