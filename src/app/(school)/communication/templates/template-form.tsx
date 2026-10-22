"use client";

// Add or edit a Message Template: text in each language, blanks inserted from
// a list, the DLT template ID for SMS, and a live preview with sample data.
import { useRef, useState, useTransition } from "react";
import { saveTemplateAction, type TemplateState } from "./actions";
import { Check, FileText, Languages, Lock, Plus } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { Card, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { Words } from "@/lib/i18n/client";

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
    <form onSubmit={submit} noValidate className="flex flex-col gap-5 lg:gap-6">
      {state && !state.ok && state.message && <Banner tone="bad" title={state.message} />}
      <Card>
        <CardHeader title="About the template" icon={FileText} description={data.id ? "A saved template keeps its channel" : "SMS templates need the DLT template ID registered on the telecom DLT portal"} />
        <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <FieldShell label="Name" id="t-name" required error={err("name")}>
            <input id="t-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-invalid={err("name") ? true : undefined}
              placeholder="For example: Exam fee reminder" className={cx(inputCls(err("name")), "h-11")} />
          </FieldShell>
          <FieldShell label="Category" id="t-category" required error={err("category")}>
            <select id="t-category" value={category} onChange={(e) => setCategory(e.target.value)} className={cx(inputCls(err("category")), "h-11 pr-9")}>
              <option value="">Choose…</option>
              {data.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </FieldShell>
          <FieldShell label="Channel" id="t-channel" required error={err("channel")}
            help={data.id ? undefined : channel === "sms" ? "Needs a DLT template ID before it can be used." : channel === "whatsapp" ? "Send it for WhatsApp approval after saving." : undefined}>
            <select id="t-channel" value={channel} disabled={Boolean(data.id)} onChange={(e) => setChannel(e.target.value)} className={cx(inputCls(), "h-11 pr-9 disabled:bg-sunken")}>
              {data.channels.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </FieldShell>
        </div>
      </Card>

      <Card className="min-w-0">
        <CardHeader title="The text" icon={Languages} description="One version in each language. Tap a blank to add it where the cursor is."
          action={unused.length > 0 ? (
            <div className="flex gap-2">
              <label htmlFor="t-addlang" className="sr-only"><Words k="Add a language" /></label>
              <select id="t-addlang" value={addLang} onChange={(e) => setAddLang(e.target.value)} className={cx(inputCls(), "h-9 w-auto pr-9 text-[13.5px]")}>
                <option value="">Add a language…</option>
                {unused.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
              <Button size="sm" variant="secondary" icon={Plus} disabled={!addLang} onClick={addLanguage}><Words k="Add" /></Button>
            </div>
          ) : undefined} />
        <div className="px-5 pb-5 flex flex-col gap-4">
          {texts.length > 1 && (
            <Segmented size="sm" label="Language" value={cur?.language ?? ""} onChange={setActive} className="self-start flex-wrap"
              options={texts.map((t) => ({ value: t.language, label: `${langLabel(t.language)}${Object.keys(errors).some((k) => k.endsWith(`:${t.language}`)) ? " (fix)" : ""}`, icon: t.locked ? Lock : undefined }))} />
          )}
          {cur && (
            <div className="grid grid-cols-1 gap-5 *:min-w-0 lg:grid-cols-2">
              <div className="flex flex-col gap-4">
                {cur.locked && <Banner tone="info" icon={Lock} title="Approved by WhatsApp and locked."><Words k="Make a new template to change the wording." /></Banner>}
                {hasSubject && (
                  <FieldShell label={channel === "email" ? "Subject" : "Title"} id="t-subject" required={channel === "email"} error={err(`subject:${cur.language}`)}>
                    <input id="t-subject" value={cur.subject} disabled={cur.locked} onChange={(e) => patch(cur.language, { subject: e.target.value })} maxLength={150} className={cx(inputCls(err(`subject:${cur.language}`)), "h-11")} />
                  </FieldShell>
                )}
                <FieldShell label={`Text in ${langLabel(cur.language)}`} id="t-body" required error={err(`body:${cur.language}`)}
                  help={`${[...cur.body].length} of 1000 characters${channel === "sms" ? ` · ${smsParts(cur.body)} SMS part${smsParts(cur.body) > 1 ? "s" : ""} before blanks are filled` : ""}`}>
                  <textarea id="t-body" ref={bodyRef} rows={6} value={cur.body} disabled={cur.locked} maxLength={1000} onChange={(e) => patch(cur.language, { body: e.target.value })}
                    aria-invalid={err(`body:${cur.language}`) ? true : undefined} placeholder="Dear {parent_name}, …" className={cx(inputCls(err(`body:${cur.language}`)), "py-2.5")} />
                </FieldShell>
                {!cur.locked && (
                  <div>
                    <p className="text-[12.5px] text-ink3 mb-1.5"><Words k="Tap a blank to add it" /></p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.variables.map((v) => (
                        <button key={v.key} type="button" onClick={() => insert(v.key)} title={v.label}
                          className="font-mono text-[12px] px-2 h-7 rounded-lg bg-brand/10 text-brand hover:bg-brand/15">{`{${v.key}}`}</button>
                      ))}
                    </div>
                  </div>
                )}
                {channel === "sms" && (
                  <FieldShell label="DLT template ID" id="t-dlt" error={err(`dlt:${cur.language}`)} help="From the telecom DLT portal, for this exact text. Without it the template is saved as a draft and cannot send SMS.">
                    <input id="t-dlt" value={cur.dltTemplateId} onChange={(e) => patch(cur.language, { dltTemplateId: e.target.value.trim() })} maxLength={40} autoComplete="off"
                      placeholder="1107161765432109876" className={cx(inputCls(err(`dlt:${cur.language}`)), "h-11 font-mono")} />
                  </FieldShell>
                )}
              </div>
              <div>
                <p className="eyebrow text-ink3 mb-1.5"><Words k="Preview with sample details" /></p>
                <div className="rounded-2xl bg-sunken/70 p-4">
                  <div className="max-w-sm rounded-2xl rounded-tl-md bg-surface border border-line p-3.5 shadow-card text-[14px] leading-relaxed">
                    {hasSubject && cur.subject && <p className="font-semibold">{cur.subject}</p>}
                    <p className="whitespace-pre-line break-words">{preview || <span className="text-ink3"><Words k="The text appears here as a parent would see it." /></span>}</p>
                  </div>
                </div>
                {cur.body && [...cur.body.matchAll(BLANK)].length > 0 && (
                  <p className="mt-2 text-[12.5px] text-ink3"><Words k="A person with no value for a blank is skipped and listed before sending." /></p>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap gap-2 justify-end">
        <ButtonLink href={data.id ? `/communication/templates/${data.id}` : "/communication/templates"} variant="secondary"><Words k="Cancel" /></ButtonLink>
        <Button type="submit" icon={Check} loading={pending} loadingText="Saving">{data.id ? "Save new version" : "Save template"}</Button>
      </div>
    </form>
  );
}
