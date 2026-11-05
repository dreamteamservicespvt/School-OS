"use client";

// Keeps what was typed in a dialog or sheet form when it is closed by mistake or the page
// reloads, and puts it back when the form opens again (src/lib/form-draft.ts has the rules).
// Works with any form: it reads and writes the form's own fields, so plain, controlled and
// date/time boxes all come back. A form (or part of one) with data-no-draft is never kept.

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from "react";
import { History } from "lucide-react";
import { boxText, DRAFT_MAX_AGE_MS, draftKey, fingerprint, isPrivateField, readDraft, writeDraft, type DraftValues } from "@/lib/form-draft";
import { Words } from "@/lib/i18n/client";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const store = {
  get(key: string) { try { return window.sessionStorage.getItem(key); } catch { return null; } },
  set(key: string, v: string) { try { window.sessionStorage.setItem(key, v); } catch { /* full or blocked: a draft is a convenience */ } },
  remove(key: string) { try { window.sessionStorage.removeItem(key); } catch { /* blocked */ } },
};

/** The visible date or time box that goes with a hidden value (DateInput, TimeInput). */
function boxFor(el: HTMLInputElement): HTMLInputElement | null {
  return el.parentElement?.querySelector<HTMLInputElement>(":scope > input[role=combobox]") ?? null;
}

function fieldsOf(form: HTMLFormElement): Field[] {
  return Array.from(form.elements).filter((e): e is Field => {
    if (!(e instanceof HTMLInputElement || e instanceof HTMLSelectElement || e instanceof HTMLTextAreaElement)) return false;
    if (!e.name || e.disabled || e.closest("[data-no-draft]")) return false;
    const type = e instanceof HTMLInputElement ? e.type : "text";
    // A hidden value is kept only when it belongs to a date or time box.
    if (type === "hidden") return e instanceof HTMLInputElement && Boolean(boxFor(e)) && !isPrivateField(e.name, "text", e.autocomplete);
    return !isPrivateField(e.name, type, e.getAttribute("autocomplete") ?? "");
  });
}

/** The form's current values: checkboxes as lists of ticked values, repeated names as lists. */
export function readForm(form: HTMLFormElement): DraftValues {
  const out: DraftValues = {};
  const groups = new Map<string, Field[]>();
  for (const f of fieldsOf(form)) groups.set(f.name, [...(groups.get(f.name) ?? []), f]);
  for (const [name, list] of groups) {
    const first = list[0];
    if (first instanceof HTMLInputElement && first.type === "checkbox") out[name] = list.filter((e) => (e as HTMLInputElement).checked).map((e) => e.value);
    else if (first instanceof HTMLInputElement && first.type === "radio") out[name] = (list.find((e) => (e as HTMLInputElement).checked) as HTMLInputElement | undefined)?.value ?? "";
    else if (first instanceof HTMLSelectElement && first.multiple) out[name] = Array.from(first.selectedOptions).map((o) => o.value);
    else out[name] = list.length === 1 ? first.value : list.map((e) => e.value);
  }
  return out;
}

function setValue(el: Field, value: string) {
  if (el.value === value) return;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Puts values back into the form, so React state follows as if they were typed. */
export function writeForm(form: HTMLFormElement, values: DraftValues) {
  const fields = fieldsOf(form);
  for (const [name, value] of Object.entries(values)) {
    const list = fields.filter((f) => f.name === name);
    if (!list.length) continue;
    const first = list[0];
    if (first instanceof HTMLInputElement && (first.type === "checkbox" || first.type === "radio")) {
      const want = Array.isArray(value) ? value : [value];
      for (const e of list as HTMLInputElement[]) if (e.checked !== want.includes(e.value) && (e.type === "checkbox" || !e.checked)) e.click();
    } else if (first instanceof HTMLSelectElement && first.multiple) {
      const want = Array.isArray(value) ? value : [value];
      for (const o of Array.from(first.options)) o.selected = want.includes(o.value);
      first.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      list.forEach((el, i) => {
        const v = Array.isArray(value) ? value[i] : i === 0 ? value : undefined;
        if (v === undefined) return;
        const box = el instanceof HTMLInputElement && el.type === "hidden" ? boxFor(el) : null;
        if (box) {
          if (el.value === v) return;
          setValue(box, boxText(v));
          // The box takes the typed words on leaving it; after React has drawn them.
          window.setTimeout(() => box.dispatchEvent(new FocusEvent("focusout", { bubbles: true })), 0);
        } else setValue(el, v);
      });
    }
  }
}

export type FormDraft = {
  /** True when the form opened with a kept draft. */
  restored: boolean;
  /** Puts the form back to how it opened and forgets the draft. */
  clear: () => void;
  /** After a save that worked: forget the draft. */
  done: () => void;
};

const NONE: readonly string[] = [];

type Live = { form: HTMLFormElement | null; key: string; base: string; start: DraftValues; stopped: boolean };

/**
 * Keeps the form's typed values in this tab until a save works.
 * `name` tells forms on the same page apart (the dialog's title is enough).
 */
export function useFormDraft(formRef: RefObject<HTMLFormElement | null>, name: string, enabled = true, ignore: readonly string[] = NONE): FormDraft {
  const [restored, setRestored] = useState(false);
  const live = useRef<Live>({ form: null, key: "", base: "", start: {}, stopped: false });

  useEffect(() => {
    const form = formRef.current;
    if (!enabled || !form || form.closest("[data-no-draft]")) return;
    const owner = document.querySelector<HTMLElement>("[data-draft-owner]")?.dataset.draftOwner;
    if (!owner) return;
    const l = live.current;
    // The first time this form is seen: note how it opened and bring back a kept draft.
    // (A second run of the effect for the same form, as in development, changes nothing.)
    if (l.form !== form) {
      const ids = Array.from(form.querySelectorAll<HTMLInputElement>("input[type=hidden][name]")).filter((h) => !boxFor(h) && !isPrivateField(h.name, "text") && !ignore.includes(h.name)).map((h) => `${h.name}=${h.value}`).sort().join("&");
      const start = readForm(form);
      Object.assign(l, { form, key: draftKey(owner, window.location.pathname + window.location.search, `${name}|${ids}`), base: fingerprint(start), start, stopped: false });
      const kept = readDraft(store.get(l.key), l.base);
      if (kept) {
        writeForm(form, kept.values);
        window.setTimeout(() => setRestored(true), 0);
      }
    }
    const persist = () => {
      if (l.stopped || l.form !== form) return;
      const text = writeDraft(l.base, l.start, readForm(form));
      if (text) store.set(l.key, text);
      else store.remove(l.key);
    };
    // Typing saves at once; a click (chips, buttons that fill fields) saves after React has drawn it.
    let timer = 0;
    const later = () => { window.clearTimeout(timer); timer = window.setTimeout(() => { timer = 0; persist(); }, 60); };
    form.addEventListener("input", persist);
    form.addEventListener("change", persist);
    form.addEventListener("click", later);
    form.addEventListener("focusout", later);
    return () => {
      form.removeEventListener("input", persist);
      form.removeEventListener("change", persist);
      form.removeEventListener("click", later);
      form.removeEventListener("focusout", later);
      if (timer) { window.clearTimeout(timer); persist(); }
    };
    // Every render: a form that is drawn again as a new element (key change) is picked up.
  });

  const done = useCallback(() => {
    const l = live.current;
    l.stopped = true;
    if (l.key) store.remove(l.key);
    setRestored(false);
    // A form that stays open after saving (an inline form) starts a new draft from what it shows now.
    const form = l.form;
    window.setTimeout(() => {
      if (!form?.isConnected || l.form !== form) return;
      l.start = readForm(form);
      l.base = fingerprint(l.start);
      l.stopped = false;
    }, 100);
  }, []);

  const clear = useCallback(() => {
    const l = live.current;
    if (l.key) store.remove(l.key);
    if (l.form) {
      l.stopped = true;
      writeForm(l.form, l.start);
      l.stopped = false;
      store.remove(l.key);
    }
    setRestored(false);
  }, []);

  return useMemo(() => ({ restored, clear, done }), [restored, clear, done]);
}

/** The small note shown when a form opened with what was typed last time. */
export function DraftHint({ draft }: { draft: FormDraft }) {
  if (!draft.restored) return null;
  return (
    <p className="flex items-center gap-1.5 text-[12.5px] text-ink3" role="status">
      <History size={14} aria-hidden="true" />
      <span><Words k="Draft kept: what you typed last time." /></span>
      <button type="button" onClick={draft.clear} className="font-medium text-brand underline-offset-2 hover:underline focus-visible:underline"><Words k="Clear" /></button>
    </p>
  );
}

/**
 * Drafts for a form whose fields come and go inside it (a sheet that keeps its <form> while
 * closed): put this next to the fields so it mounts with them. `handle` gets done() and clear().
 */
export function DraftSpot({ name, enabled = true, handle }: { name: string; enabled?: boolean; handle?: React.RefObject<FormDraft | null> }) {
  const spot = useRef<HTMLSpanElement>(null);
  const [formRef] = useState(() => ({ get current() { return spot.current?.closest("form") ?? null; } }));
  const draft = useFormDraft(formRef, name, enabled);
  useImperativeHandle(handle, () => draft, [draft]);
  return <span ref={spot} className="contents"><DraftHint draft={draft} /></span>;
}

/** Marks who the drafts on this page belong to (the school and the person signed in). */
export function DraftOwner({ id }: { id: string }) {
  return <span hidden data-draft-owner={id} />;
}

type StateLive<T> = { key: string; base: string; start: T | null; stopped: boolean; ready: boolean };

/**
 * Drafts for a form whose values live in React state rather than in its boxes (rows that
 * appear only after a choice, as on the Datesheet). `value` is everything to keep; `apply`
 * puts a kept value back. Never pass private values (passwords, codes, bank references).
 * After a save that worked call done(); call resume() when the save came back with a problem.
 */
export function useStateDraft<T>(name: string, value: T, apply: (v: T) => void, enabled = true): FormDraft & { resume: () => void } {
  const [restored, setRestored] = useState(false);
  const live = useRef<StateLive<T>>({ key: "", base: "", start: null, stopped: false, ready: false });
  const text = JSON.stringify(value);
  const applyRef = useRef(apply);
  const textRef = useRef(text);
  useEffect(() => { applyRef.current = apply; textRef.current = text; });

  useEffect(() => {
    const l = live.current;
    if (!enabled) return;
    if (!l.ready) {
      l.ready = true;
      const owner = document.querySelector<HTMLElement>("[data-draft-owner]")?.dataset.draftOwner;
      if (!owner) { l.stopped = true; return; }
      Object.assign(l, { key: draftKey(owner, window.location.pathname + window.location.search, `state|${name}`), base: text, start: value });
      const raw = store.get(l.key);
      try {
        const d = raw ? (JSON.parse(raw) as { base: string; savedAt: number; value: T }) : null;
        if (d && d.base === l.base && typeof d.savedAt === "number" && Date.now() - d.savedAt <= DRAFT_MAX_AGE_MS && JSON.stringify(d.value) !== l.base) {
          applyRef.current(d.value);
          window.setTimeout(() => setRestored(true), 0);
        } else if (raw) store.remove(l.key);
      } catch { store.remove(l.key); }
      return;
    }
    if (l.stopped || !l.key) return;
    if (text === l.base) store.remove(l.key);
    else store.set(l.key, JSON.stringify({ base: l.base, savedAt: Date.now(), value: JSON.parse(text) as T }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, enabled, name]);

  const done = useCallback(() => {
    const l = live.current;
    l.stopped = true;
    if (l.key) store.remove(l.key);
    setRestored(false);
  }, []);

  const resume = useCallback(() => {
    const l = live.current;
    if (!l.key || !l.stopped) return;
    l.stopped = false;
    // The save did not go through: keep what is on screen again at once.
    if (textRef.current !== l.base) store.set(l.key, JSON.stringify({ base: l.base, savedAt: Date.now(), value: JSON.parse(textRef.current) as T }));
  }, []);

  const clear = useCallback(() => {
    const l = live.current;
    if (l.key) store.remove(l.key);
    if (l.start !== null) applyRef.current(l.start);
    setRestored(false);
  }, []);

  return useMemo(() => ({ restored, clear, done, resume }), [restored, clear, done, resume]);
}
