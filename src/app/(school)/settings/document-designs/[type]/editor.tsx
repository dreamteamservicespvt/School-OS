"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button, Spinner } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { BASES, CARD_SIZES, defaultOptions, type BaseKey, type DesignOptions } from "@/lib/documents/designs-shared";
import type { DocType, MergeField } from "@/lib/documents/types";
import { findRecords, previewDesign, saveDesignAction, uploadCardBackground, type RecordHit, type RecordRef } from "../actions";

type Props = {
  type: DocType;
  fields: MergeField[];
  initial: { base: BaseKey; options: DesignOptions };
  signatories: { id: string; name: string; title: string }[];
  canEdit: boolean;
  /** Which records the person may preview with. */
  recordKinds: ("student" | "staff")[];
};

const input = "h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base text-ink";

function Section({ title, children, help }: { title: string; children: React.ReactNode; help?: string }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-line p-4">
      <legend className="px-1 font-semibold">{title}</legend>
      {help && <p className="-mt-1 text-sm text-ink-2">{help}</p>}
      {children}
    </fieldset>
  );
}

function Check({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" />
      <span><span className="font-medium">{label}</span>{help && <span className="block text-sm text-ink-2">{help}</span>}</span>
    </label>
  );
}

export function DesignEditor({ type, fields, initial, signatories, canEdit, recordKinds }: Props) {
  const [base, setBase] = useState<BaseKey>(initial.base);
  const [o, setO] = useState<DesignOptions>(initial.options);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [html, setHtml] = useState<string | null>(null);
  const [previewProblem, setPreviewProblem] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const [saving, startSave] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [record, setRecord] = useState<RecordRef>(null);
  const [recordLabel, setRecordLabel] = useState<string>("Sample data");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const optionsJson = JSON.stringify(o);
  const dirty = JSON.stringify({ base, options: o }) !== saved;
  const family = type.family;

  const set = <K extends keyof DesignOptions>(k: K, v: DesignOptions[K]) => { setO((prev) => ({ ...prev, [k]: v })); setResult(null); };
  const setCard = <K extends keyof DesignOptions["card"]>(k: K, v: DesignOptions["card"][K]) => { setO((prev) => ({ ...prev, card: { ...prev.card, [k]: v } })); setResult(null); };

  // Live preview, a moment after the last change.
  useEffect(() => {
    const t = setTimeout(() => {
      startPreview(async () => {
        const r = await previewDesign(type.key, base, optionsJson, record);
        if (r.ok) { setHtml(r.html); setPreviewProblem(null); } else setPreviewProblem(r.message);
      });
    }, 350);
    return () => clearTimeout(t);
  }, [type.key, base, optionsJson, record]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const detailFields = useMemo(() => fields.filter((f) => !["son_daughter", "his_her", "he_she"].includes(f.key)), [fields]);

  function insertField(key: string) {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) { set("body", o.body + token); return; }
    const start = el.selectionStart ?? o.body.length;
    const end = el.selectionEnd ?? start;
    const next = o.body.slice(0, start) + token + o.body.slice(end);
    set("body", next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  }

  function toggleIn(list: string[], key: string, on: boolean, order: string[]) {
    const s = new Set(list);
    if (on) s.add(key); else s.delete(key);
    // Keep the order the fields are listed in, so the document reads naturally.
    return order.filter((k) => s.has(k));
  }

  function save() {
    startSave(async () => {
      const r = await saveDesignAction(type.key, base, optionsJson);
      setResult(r);
      if (r.ok) setSaved(JSON.stringify({ base, options: o }));
    });
  }

  const hasBody = family === "letter" || family === "admit" || family === "report" || (family === "money" && o.body !== "");
  const showsFields = family !== "letter";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
        <legend className="sr-only">Design choices</legend>
        <Section title="Ready design">
          <div className="grid gap-2">
            {BASES.map((b) => (
              <label key={b.key} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 ${base === b.key ? "border-brand bg-brand-soft" : "border-line-strong"}`}>
                <input type="radio" name="base" checked={base === b.key} disabled={!canEdit}
                  onChange={() => { setBase(b.key); if (b.key === "cbse" && !o.headerNote) set("headerNote", defaultOptions(type, "cbse").headerNote); }}
                  className="mt-1 size-5 accent-[var(--brand)]" />
                <span><span className="font-medium">{b.label}</span><span className="block text-sm text-ink-2">{b.about}</span></span>
              </label>
            ))}
          </div>
        </Section>

        <Section title="Heading and colours">
          <label className="block text-sm font-medium">Title on the document
            <input className={`${input} mt-1`} value={o.title} maxLength={80} disabled={!canEdit} onChange={(e) => set("title", e.target.value)} />
          </label>
          <label className="block text-sm font-medium">Line under the school name
            <input className={`${input} mt-1`} value={o.headerNote} maxLength={160} disabled={!canEdit} placeholder="For example: Affiliated to CBSE, No. {{affiliation_number}}" onChange={(e) => set("headerNote", e.target.value)} />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium">Colour
              <input type="color" className="mt-1 block h-11 w-16 cursor-pointer rounded-lg border border-line-strong bg-surface" disabled={!canEdit}
                value={o.accent || "#1d4ed8"} onChange={(e) => set("accent", e.target.value.toUpperCase())} />
            </label>
            {o.accent ? <Button variant="ghost" size="sm" disabled={!canEdit} onClick={() => set("accent", "")}>Use the school&apos;s colour</Button> : <p className="pb-3 text-sm text-ink-2">Using the school&apos;s branding colour.</p>}
          </div>
          <Check label="Show the school logo" checked={o.showLogo} onChange={(v) => set("showLogo", v)} help="The logo is set in School Profile." />
          {family !== "card" && <Check label="Faint logo behind the text" checked={o.watermark} onChange={(v) => set("watermark", v)} />}
          {family !== "card" && (
            <label className="block text-sm font-medium">Paper size
              <select className={`${input} mt-1`} value={o.paper} disabled={!canEdit} onChange={(e) => set("paper", e.target.value as "A4" | "A5")}>
                <option value="A4">A4</option><option value="A5">A5 (half page)</option>
              </select>
            </label>
          )}
        </Section>

        {family === "card" && (
          <Section title="ID card layout" help="Cards are printed several to an A4 sheet, ready to cut.">
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 block text-sm font-medium">Size
                <select className={`${input} mt-1`} value={o.card.size} disabled={!canEdit} onChange={(e) => setCard("size", e.target.value as DesignOptions["card"]["size"])}>
                  {CARD_SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">Orientation
                <select className={`${input} mt-1`} value={o.card.orientation} disabled={!canEdit} onChange={(e) => setCard("orientation", e.target.value as "landscape" | "portrait")}>
                  <option value="landscape">Horizontal</option><option value="portrait">Vertical</option>
                </select>
              </label>
              <label className="block text-sm font-medium">Cards per row
                <select className={`${input} mt-1`} value={o.card.perRow} disabled={!canEdit} onChange={(e) => setCard("perRow", Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">Background colour
                <input type="color" className="mt-1 block h-11 w-16 cursor-pointer rounded-lg border border-line-strong bg-surface" disabled={!canEdit} value={o.card.background} onChange={(e) => setCard("background", e.target.value.toUpperCase())} />
              </label>
              <label className="block text-sm font-medium">Valid until
                <input className={`${input} mt-1`} value={o.card.validUntil} maxLength={40} disabled={!canEdit} placeholder="31-03-2027" onChange={(e) => setCard("validUntil", e.target.value)} />
              </label>
            </div>
            <BackgroundPicker fileId={o.card.backgroundFileId} disabled={!canEdit} onChange={(id) => setCard("backgroundFileId", id)} />
            <Check label="Show the academic year" checked={o.card.showYear} onChange={(v) => setCard("showYear", v)} />
          </Section>
        )}

        {showsFields && (
          <Section title={family === "card" ? "Fields on the card" : "Details shown"} help="Tick what to show. The name and photo always show on cards.">
            <div className="max-h-72 overflow-y-auto pr-1">
              {detailFields.map((f) => (
                <Check key={f.key} label={f.label} checked={o.fields.includes(f.key)} onChange={(v) => set("fields", toggleIn(o.fields, f.key, v, detailFields.map((x) => x.key)))} />
              ))}
            </div>
          </Section>
        )}

        {hasBody && (
          <Section title={family === "letter" ? "Text" : family === "admit" ? "Instructions" : "Remarks and notes"}
            help="Click a merge field to put it where the cursor is. Each document fills it with the student's or staff member's own details.">
            <textarea ref={bodyRef} rows={family === "letter" ? 10 : 4} value={o.body} disabled={!canEdit} maxLength={4000} aria-label="Text"
              onChange={(e) => set("body", e.target.value)} className="w-full rounded-lg border border-line-strong bg-surface p-3 text-base text-ink" />
            <div className="flex flex-wrap gap-1.5" aria-label="Merge fields">
              {fields.map((f) => (
                <button key={f.key} type="button" disabled={!canEdit} onClick={() => insertField(f.key)} title={`Example: ${f.sample}`}
                  className="min-h-9 rounded-full border border-line bg-surface-2 px-3 text-sm hover:border-brand hover:text-brand-text">{f.label}</button>
              ))}
            </div>
          </Section>
        )}

        {family === "letter" && type.defaultTable && (
          <Section title="Numbered details" help="The rows of the certificate, in the order the board's format lists them.">
            <div className="max-h-72 overflow-y-auto pr-1">
              {detailFields.map((f) => (
                <Check key={f.key} label={f.label} checked={o.table.includes(f.key)} onChange={(v) => set("table", toggleIn(o.table, f.key, v, (type.defaultTable ?? []).concat(detailFields.map((x) => x.key)).filter((k, i, a) => a.indexOf(k) === i)))} />
              ))}
            </div>
          </Section>
        )}

        <Section title="Signatures and footer">
          {signatories.length === 0 ? (
            <p className="text-sm text-ink-2">No signatories yet. Add them on the Document Designs page, with a signature picture if you want it printed.</p>
          ) : (
            signatories.map((s) => (
              <Check key={s.id} label={`${s.name}, ${s.title}`} checked={o.signatoryIds.includes(s.id)}
                onChange={(v) => set("signatoryIds", v ? [...o.signatoryIds, s.id].slice(0, 3) : o.signatoryIds.filter((x) => x !== s.id))} />
            ))
          )}
          {o.signatoryIds.length >= 3 && <p className="text-sm text-ink-2">At most 3 signatures fit on one document.</p>}
          {type.codeField && <Check label="QR code to check the document" checked={o.showQr} onChange={(v) => set("showQr", v)} help="Holds the document's number, so anyone can check it with the school." />}
          {(family === "card" || family === "money") && type.codeField && <Check label="Barcode" checked={o.showBarcode} onChange={(v) => set("showBarcode", v)} help="For scanners at the library or the counter." />}
          <label className="block text-sm font-medium">Footer
            <input className={`${input} mt-1`} value={o.footer} maxLength={300} disabled={!canEdit} onChange={(e) => set("footer", e.target.value)} />
          </label>
        </Section>

        {canEdit && (
          <div className="sticky bottom-20 z-10 space-y-3 rounded-xl border border-line bg-surface p-4 shadow-pop lg:bottom-4">
            {result && <Alert tone={result.ok ? "success" : "danger"}>{result.message}</Alert>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink-2">{dirty ? "Changes not saved yet." : "No unsaved changes."}</p>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={!dirty || saving} onClick={() => { const s = JSON.parse(saved); setBase(s.base); setO(s.options); setResult(null); }}>Undo changes</Button>
                <Button onClick={save} loading={saving} loadingText="Saving…" disabled={!dirty}>Save design</Button>
              </div>
            </div>
          </div>
        )}
      </fieldset>

      <div className="space-y-3 xl:sticky xl:top-20 xl:self-start">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">Preview {previewing && <Spinner className="size-4 text-ink-2" />}</h2>
          <form method="post" action={`/settings/document-designs/${type.key}/pdf`} target="_blank">
            <input type="hidden" name="base" value={base} />
            <input type="hidden" name="options" value={optionsJson} />
            <input type="hidden" name="recordKind" value={record?.kind ?? ""} />
            <input type="hidden" name="recordId" value={record?.id ?? ""} />
            <Button type="submit" variant="secondary" size="sm">Open as PDF</Button>
          </form>
        </div>
        {recordKinds.length > 0 && <RecordPicker kinds={recordKinds} label={recordLabel} onPick={(r, label) => { setRecord(r); setRecordLabel(label); }} />}
        {previewProblem && <Alert tone="danger">{previewProblem}</Alert>}
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          {html ? (
            <iframe title={`Preview of the ${type.label.toLowerCase()}`} srcDoc={html} sandbox="" className="h-[70vh] min-h-[28rem] w-full bg-white" />
          ) : (
            <div className="grid h-[28rem] place-items-center text-ink-2" aria-busy="true"><Spinner className="size-6" /></div>
          )}
        </div>
        <p className="text-sm text-ink-2">The preview shows {recordLabel === "Sample data" ? "sample data" : recordLabel}. The PDF is exactly what prints.</p>
      </div>
    </div>
  );
}

function RecordPicker({ kinds, label, onPick }: { kinds: ("student" | "staff")[]; label: string; onPick: (r: RecordRef, label: string) => void }) {
  const [kind, setKind] = useState(kinds[0]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<RecordHit[] | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    const t = setTimeout(() => start(async () => setHits(await findRecords(kind, q))), 250);
    return () => clearTimeout(t);
  }, [q, kind]);
  return (
    <details className="rounded-xl border border-line bg-surface p-3">
      <summary className="min-h-9 cursor-pointer content-center text-sm font-medium">Preview with a real record: <span className="text-brand-text">{label}</span></summary>
      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          {kinds.length > 1 && (
            <select aria-label="Record kind" value={kind} onChange={(e) => { setKind(e.target.value as "student" | "staff"); setHits(null); }} className="h-11 rounded-lg border border-line-strong bg-surface px-2">
              <option value="student">Student</option><option value="staff">Staff</option>
            </select>
          )}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === "student" ? "Name or admission number" : "Name or staff ID"} aria-label="Search records"
            className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3" />
        </div>
        {pending && <p className="text-sm text-ink-2">Searching…</p>}
        {hits && hits.length === 0 && <p className="text-sm text-ink-2">Nobody found. Try part of the name.</p>}
        {hits && hits.length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {hits.map((h) => (
              <li key={h.id}><button type="button" className="min-h-11 w-full px-3 text-left hover:bg-surface-2" onClick={() => { onPick({ kind: h.kind, id: h.id }, h.label); setQ(""); setHits(null); }}>{h.label}</button></li>
            ))}
          </ul>
        )}
        {label !== "Sample data" && <Button variant="ghost" size="sm" onClick={() => onPick(null, "Sample data")}>Back to sample data</Button>}
      </div>
    </details>
  );
}

function BackgroundPicker({ fileId, disabled, onChange }: { fileId: string | null; disabled: boolean; onChange: (id: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Background picture</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line-strong px-4 text-sm font-medium hover:bg-surface-2 ${disabled ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? "Uploading…" : fileId ? "Change picture" : "Upload a picture"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={disabled || busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true); setProblem(null);
              const fd = new FormData(); fd.set("file", file);
              const r = await uploadCardBackground(fd);
              setBusy(false);
              if (r.ok) onChange(r.fileId); else setProblem(r.message);
              e.target.value = "";
            }} />
        </label>
        {fileId && <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}>Remove picture</Button>}
      </div>
      {problem && <p role="alert" className="text-sm text-danger">{problem}</p>}
      <p className="text-sm text-ink-2">Optional. A light picture keeps the text easy to read. JPG or PNG, at most 10 MB.</p>
    </div>
  );
}
