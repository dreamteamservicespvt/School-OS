"use client";

// Add or edit a Message Template: text in each language, blanks inserted from
// a list, the DLT template ID for SMS, and a live preview with sample data.
import { useRef, useState, useTransition } from "react";
import { saveTemplateAction, type TemplateState } from "./actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Text = { language: string; subject: string; body: string; dltTemplateId: string; locked: boolean; saved: boolean };
export type TemplateFormData = {
  id: string | null;
  name: string;
  category: string;
  channel: string;
  texts: Text[];
  categories: { key: string; label: string }[];
  channels: { key: string; label: string }[];
  languages: { code: string; label: string }[];
  variables: { key: string; label: string; sample: string }[];
};

const BLANK = /\{([a-z_]+)\}/g;
const field = "w-full rounded-lg border bg-surface px-3";

function smsParts(text: string) {
  const unicode = /[^\x00-\x7F₹]/.test(text);
  const len = [...text].length;
  const single = unicode ? 70 : 160;
  return len <= single ? 1 : Math.ceil(len / (unicode ? 67 : 153));
}

export function TemplateForm({ data }: { data: TemplateFormData }) {
  const [name, setName] = useState(data.name);
  const [category, setCategory] = useState(data.category);
  const [channel, setChannel] = useState(data.channel);
  const [texts, setTexts] = useState<Text[]>(data.texts);
  const [active, setActive] = useState(data.texts[0]?.language ?? "en");
  const [addLang, setAddLang] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<TemplateState>(null);
  const [pending, start] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const known = new Set(data.variables.map((v) => v.key));
  const samples = Object.fromEntries(data.variables.map((v) => [v.key, v.sample]));
  const cur = texts.find((t) => t.language === active) ?? texts[0];
  const langLabel = (c: string) => data.languages.find((l) => l.code === c)?.label ?? c;
  const err = (k: string) => errors[k] ?? state?.errors?.[k];
  const hasSubject = channel === "email" || channel === "app";

  const patch = (lang: string, p: Partial<Text>) => setTexts((all) => all.map((t) => (t.language === lang ? { ...t, ...p } : t)));

  function insert(key: string) {
    if (!cur || cur.locked) return;
    const el = bodyRef.current;
    const token = `{${key}}`;
    const at = el ? el.selectionStart : cur.body.length;
    const end = el ? el.selectionEnd : cur.body.length;
    const next = cur.body.slice(0, at) + token + cur.body.slice(end);
    patch(cur.language, { body: next });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + token.length, at + token.length); });
  }

  function addLanguage() {
    if (!addLang || texts.some((t) => t.language === addLang)) return;
    const from = cur ?? texts[0];
    setTexts((all) => [...all, { language: addLang, subject: from?.subject ?? "", body: "", dltTemplateId: "", locked: false, saved: false }]);
    setActive(addLang);
    setAddLang("");
  }

  function check(): Record<string, string> {
    const out: Record<string, string> = {};
    if (name.trim().length < 3) out.name = "Give the template a name of at least 3 characters.";
    if (!category) out.category = "Choose a category.";
    if (!channel) out.channel = "Choose a channel.";
    for (const t of texts) {
      if (!t.body.trim()) out[`body:${t.language}`] = "Write the message text.";
      else {
        const bad = [...t.body.matchAll(BLANK)].map((m) => m[1]).filter((k) => !known.has(k));
        if (bad.length) out[`body:${t.language}`] = `Unknown blank ${[...new Set(bad)].map((b) => `{${b}}`).join(", ")}. Insert blanks from the list.`;
      }
      if (channel === "email" && !t.subject.trim()) out[`subject:${t.language}`] = "Email templates need a subject.";
      if (channel === "sms" && t.dltTemplateId && !/^[A-Za-z0-9]{6,40}$/.test(t.dltTemplateId.trim())) out[`dlt:${t.language}`] = "The DLT template ID can have only letters and numbers, as shown on the DLT portal.";
    }
    return out;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const out = check();
    setErrors(out);
    if (Object.keys(out).length) {
      const first = Object.keys(out)[0];
      const lang = first.split(":")[1];
      if (lang) setActive(lang);
      setState({ ok: false, message: Object.keys(out).length === 1 ? Object.values(out)[0] : `Please fix ${Object.keys(out).length} things before saving.` });
      return;
    }
    start(async () => {
      const r = await saveTemplateAction(data.id, { name, category, channel, texts: texts.map(({ language, subject, body, dltTemplateId }) => ({ language, subject, body, dltTemplateId })) });
      if (r) setState(r);
    });
  }

  const preview = cur ? cur.body.replace(BLANK, (m, k: string) => samples[k] ?? m) : "";
  const unused = data.languages.filter((l) => !texts.some((t) => t.language === l.code));

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {state && !state.ok && state.message && <Alert tone="danger">{state.message}</Alert>}
      <section className="grid gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card sm:grid-cols-3 sm:p-5">
        <div>
          <label htmlFor="t-name" className="mb-1 block text-sm font-medium">Name <span className="text-danger" aria-hidden>*</span></label>
          <input id="t-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-invalid={err("name") ? true : undefined}
            className={`${field} h-11 ${err("name") ? "border-danger" : "border-line-strong"}`} />
          {err("name") && <p className="mt-1 text-sm text-danger">{err("name")}</p>}
        </div>
        <div>
          <label htmlFor="t-category" className="mb-1 block text-sm font-medium">Category <span className="text-danger" aria-hidden>*</span></label>
          <select id="t-category" value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} h-11 ${err("category") ? "border-danger" : "border-line-strong"}`}>
            <option value="">Choose…</option>
            {data.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          {err("category") && <p className="mt-1 text-sm text-danger">{err("category")}</p>}
        </div>
        <div>
          <label htmlFor="t-channel" className="mb-1 block text-sm font-medium">Channel <span className="text-danger" aria-hidden>*</span></label>
          <select id="t-channel" value={channel} disabled={Boolean(data.id)} onChange={(e) => setChannel(e.target.value)} className={`${field} h-11 border-line-strong disabled:bg-surface-2`}>
            {data.channels.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <p className="mt-1 text-sm text-ink-2">{data.id ? "A saved template keeps its channel." : channel === "sms" ? "SMS needs a DLT template ID before it can be used." : channel === "whatsapp" ? "Send it for WhatsApp approval after saving." : " "}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div role="tablist" aria-label="Languages" className="flex flex-wrap gap-1">
            {texts.map((t) => (
              <button key={t.language} type="button" role="tab" aria-selected={t.language === cur?.language} onClick={() => setActive(t.language)}
                className={`min-h-11 rounded-lg px-4 ${t.language === cur?.language ? "bg-brand-soft font-medium text-brand-text" : "text-ink-2 hover:bg-surface-2"} ${Object.keys(errors).some((k) => k.endsWith(`:${t.language}`)) ? "ring-2 ring-danger" : ""}`}>
                {langLabel(t.language)}{t.locked ? " 🔒" : ""}
              </button>
            ))}
          </div>
          {unused.length > 0 && (
            <div className="ml-auto flex gap-2">
              <label htmlFor="t-addlang" className="sr-only">Add a language</label>
              <select id="t-addlang" value={addLang} onChange={(e) => setAddLang(e.target.value)} className={`${field} h-11 border-line-strong`}>
                <option value="">Add a language…</option>
                {unused.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
              <Button variant="secondary" disabled={!addLang} onClick={addLanguage}>Add</Button>
            </div>
          )}
        </div>

        {cur && (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              {cur.locked && <Alert tone="info">This text is approved by WhatsApp and locked. Make a new template to change the wording.</Alert>}
              {hasSubject && (
                <div>
                  <label htmlFor="t-subject" className="mb-1 block text-sm font-medium">{channel === "email" ? "Subject" : "Title"}{channel === "email" && <span className="text-danger" aria-hidden> *</span>}</label>
                  <input id="t-subject" value={cur.subject} disabled={cur.locked} onChange={(e) => patch(cur.language, { subject: e.target.value })} maxLength={150}
                    className={`${field} h-11 ${err(`subject:${cur.language}`) ? "border-danger" : "border-line-strong"}`} />
                  {err(`subject:${cur.language}`) && <p className="mt-1 text-sm text-danger">{err(`subject:${cur.language}`)}</p>}
                </div>
              )}
              <div>
                <label htmlFor="t-body" className="mb-1 block text-sm font-medium">Text in {langLabel(cur.language)} <span className="text-danger" aria-hidden>*</span></label>
                <textarea id="t-body" ref={bodyRef} rows={7} value={cur.body} disabled={cur.locked} maxLength={1000} onChange={(e) => patch(cur.language, { body: e.target.value })}
                  aria-invalid={err(`body:${cur.language}`) ? true : undefined} aria-describedby="t-body-help"
                  className={`${field} py-2 ${err(`body:${cur.language}`) ? "border-danger" : "border-line-strong"}`} />
                {err(`body:${cur.language}`) ? <p className="mt-1 text-sm text-danger">{err(`body:${cur.language}`)}</p> : (
                  <p id="t-body-help" className="mt-1 text-sm text-ink-2">{[...cur.body].length} of 1000 characters{channel === "sms" ? ` · ${smsParts(cur.body)} SMS part${smsParts(cur.body) > 1 ? "s" : ""} before blanks are filled` : ""}</p>
                )}
              </div>
              {!cur.locked && (
                <div>
                  <p className="mb-1 text-sm font-medium">Insert a blank</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.variables.map((v) => (
                      <button key={v.key} type="button" onClick={() => insert(v.key)} title={`{${v.key}}`}
                        className="min-h-9 rounded-full border border-line-strong px-3 text-sm hover:border-brand hover:bg-brand-soft">{v.label}</button>
                    ))}
                  </div>
                </div>
              )}
              {channel === "sms" && (
                <div>
                  <label htmlFor="t-dlt" className="mb-1 block text-sm font-medium">DLT template ID</label>
                  <input id="t-dlt" value={cur.dltTemplateId} onChange={(e) => patch(cur.language, { dltTemplateId: e.target.value.trim() })} maxLength={40} inputMode="text" autoComplete="off"
                    className={`${field} h-11 font-mono ${err(`dlt:${cur.language}`) ? "border-danger" : "border-line-strong"}`} />
                  {err(`dlt:${cur.language}`) ? <p className="mt-1 text-sm text-danger">{err(`dlt:${cur.language}`)}</p> : (
                    <p className="mt-1 text-sm text-ink-2">From the telecom DLT portal, for this exact text. Without it the template is saved as a draft and cannot be used.</p>
                  )}
                </div>
              )}
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">Preview with sample data</p>
              <div className="rounded-2xl bg-surface-2 p-4">
                <div className="max-w-sm rounded-xl rounded-tl-none bg-surface p-3 shadow-card">
                  {hasSubject && cur.subject && <p className="font-semibold">{cur.subject}</p>}
                  <p className="whitespace-pre-line break-words">{preview || <span className="text-ink-2">The text appears here as a parent would see it.</span>}</p>
                </div>
              </div>
              {cur.body && [...cur.body.matchAll(BLANK)].length > 0 && (
                <p className="mt-2 text-sm text-ink-2">Blanks used: {[...new Set([...cur.body.matchAll(BLANK)].map((m) => m[1]))].map((k) => `{${k}}`).join(", ")}. A person with no value for a blank is skipped and listed before sending.</p>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} loadingText="Saving">{data.id ? "Save new version" : "Save template"}</Button>
        <ButtonLink href={data.id ? `/communication/templates/${data.id}` : "/communication/templates"}>Cancel</ButtonLink>
      </div>
    </form>
  );
}
