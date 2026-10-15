"use client";

// Photos, files and links added to homework, a lesson or a hand-in
// (mod-homework.jsx GiveHomeworkSheet and SubmitSheet). Real file inputs, so
// the files go with the form; each one can be taken off again before sending.

import { useId, useState } from "react";
import { Camera, CircleCheck, FileImage, FileText, Link2, Paperclip, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field";
import { useTyped } from "@/components/ui/url-sheet";
import { cx } from "@/components/ui/cx";

const ACCEPT = "image/jpeg,image/png,application/pdf";

/** A hidden file input whose chosen files are mirrored in state, so the list can show and remove them. */
function useFiles() {
  const id = useId();
  const [names, setNames] = useState<string[]>([]);
  const sync = (input: HTMLInputElement | null) => setNames(Array.from(input?.files ?? []).map((f) => f.name));
  const input = () => document.getElementById(id) as HTMLInputElement | null;
  const drop = (index: number) => {
    const el = input();
    if (!el?.files) return;
    const dt = new DataTransfer();
    Array.from(el.files).forEach((f, i) => { if (i !== index) dt.items.add(f); });
    el.files = dt.files;
    sync(el);
  };
  const open = () => input()?.click();
  return { id, names, sync, drop, open };
}

function FileInput({ name, accept, capture, f }: { name: string; accept: string; capture?: boolean; f: ReturnType<typeof useFiles> }) {
  return <input id={f.id} type="file" name={name} accept={accept} multiple className="sr-only" tabIndex={-1} aria-hidden="true" {...(capture ? { capture: "environment" } : {})} onChange={(e) => f.sync(e.currentTarget)} />;
}

/** "Photo of the board", "File" and "Link" buttons with the list of what was added. */
export function AttachPicker({ links = true, maxMb = 10, errorName = "attachments", lesson = false }: { links?: boolean; maxMb?: number; errorName?: string; lesson?: boolean }) {
  const photos = useFiles();
  const files = useFiles();
  const [urls, setUrls] = useState<string[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const t = useTyped(errorName, null);
  const shown = [
    ...photos.names.map((n, i) => ({ key: `p${i}${n}`, name: n, kind: "photo", drop: () => photos.drop(i) })),
    ...files.names.map((n, i) => ({ key: `f${i}${n}`, name: n, kind: /\.pdf$/i.test(n) ? "file" : "photo", drop: () => files.drop(i) })),
    ...urls.map((u, i) => ({ key: `l${i}${u}`, name: u, kind: "link", drop: () => setUrls((x) => x.filter((_, j) => j !== i)) })),
  ];
  const addLink = () => { const v = draft.trim(); if (v) setUrls((x) => [...x, v]); setDraft(""); setLinkOpen(false); };
  return (
    <div className="flex flex-col gap-2">
      <FileInput name="photos" accept="image/jpeg,image/png" capture f={photos} />
      <FileInput name="files" accept={ACCEPT} f={files} />
      {urls.map((u, i) => <input key={`${i}${u}`} type="hidden" name="links" value={u} />)}
      <div className="flex flex-wrap gap-2">
        {!lesson && <Button size="sm" variant="secondary" icon={Camera} onClick={photos.open}>Photo of the board</Button>}
        <Button size="sm" variant="secondary" icon={lesson ? Upload : Paperclip} onClick={files.open}>{lesson ? "Upload files" : "File"}</Button>
        {links && <Button size="sm" variant="secondary" icon={Link2} onClick={() => setLinkOpen(true)}>{lesson ? "Add a link" : "Link"}</Button>}
      </div>
      {linkOpen && (
        <div className="flex gap-2">
          <label htmlFor="attach-link" className="sr-only">Web address</label>
          <input id="attach-link" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={lesson ? "https://youtu.be/… or a web page" : "https://ncert.nic.in/…"} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} className={cx(inputCls(), "h-10")} />
          <Button size="sm" variant="soft" onClick={addLink}>Add</Button>
        </div>
      )}
      {shown.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {shown.map((f) => (
            <li key={f.key} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-[13.5px]">
              {f.kind === "link" ? <Link2 size={16} className="text-ink3" aria-hidden="true" /> : f.kind === "file" ? <FileText size={16} className="text-ink3" aria-hidden="true" /> : <FileImage size={16} className="text-ink3" aria-hidden="true" />}
              <span className="flex-1 min-w-0 truncate">{f.name}</span>
              <button type="button" onClick={f.drop} aria-label={`Remove ${f.name}`} className="w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken"><X size={15} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
      {t.error ? <p className="text-[12.5px] text-bad" role="alert">{t.error}</p> : shown.length > 0 && <p className="text-[12.5px] text-ink3">Photos or PDF, up to {maxMb} MB each.</p>}
    </div>
  );
}

/** The two big boxes of a hand-in: "Take a photo" and "Choose a file" (SubmitSheet). */
export function HandInPicker({ maxMb, onCount }: { maxMb: number; onCount?: (n: number) => void }) {
  const photos = useFiles();
  const files = useFiles();
  const t = useTyped("files", null);
  const shown = [
    ...photos.names.map((n, i) => ({ key: `p${i}${n}`, name: n, pdf: false, drop: () => photos.drop(i) })),
    ...files.names.map((n, i) => ({ key: `f${i}${n}`, name: n, pdf: /\.pdf$/i.test(n), drop: () => files.drop(i) })),
  ];
  const count = shown.length;
  const box = "h-24 rounded-2xl border-2 border-dashed border-line hover:border-brand hover:text-brand flex flex-col items-center justify-center gap-1.5 text-[13.5px] font-semibold text-ink2 transition";
  return (
    <div className="flex flex-col gap-2">
      <input id={photos.id} type="file" name="photos" accept="image/jpeg,image/png" capture="environment" multiple className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { photos.sync(e.currentTarget); onCount?.(e.currentTarget.files!.length + files.names.length); }} />
      <input id={files.id} type="file" name="files" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { files.sync(e.currentTarget); onCount?.(e.currentTarget.files!.length + photos.names.length); }} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={photos.open} className={box}><Camera size={22} aria-hidden="true" />Take a photo</button>
        <button type="button" onClick={files.open} className={box}><Paperclip size={22} aria-hidden="true" />Choose a file</button>
      </div>
      <p className="text-[12.5px] text-ink3">Photos or PDF, up to {maxMb} MB each. One photo per page.</p>
      {count > 0 && (
        <ul className="flex flex-col gap-1.5">
          {shown.map((f) => (
            <li key={f.key} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-[13.5px]">
              {f.pdf ? <FileText size={16} className="text-ink3" aria-hidden="true" /> : <FileImage size={16} className="text-ink3" aria-hidden="true" />}
              <span className="flex-1 min-w-0 truncate">{f.name}</span><CircleCheck size={16} className="text-ok" aria-hidden="true" />
              <button type="button" onClick={() => { f.drop(); onCount?.(count - 1); }} aria-label={`Remove ${f.name}`} className="w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken"><X size={15} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
      {t.error && <p className="text-[12.5px] text-bad" role="alert">{t.error}</p>}
    </div>
  );
}
