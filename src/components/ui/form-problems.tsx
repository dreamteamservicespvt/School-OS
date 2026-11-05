"use client";

// Every bad box marked at once, and the first one brought into view (testing
// issues 10, 20 and 25; owner test 2026-11-05 on Add Staff). Put <FormProblems>
// inside a <form>, around its boxes:
//
//   <form action={act}><FormProblems errors={state?.errors}> ...boxes... </FormProblems></form>
//
// - Save or Next with boxes empty or wrong: in place of the browser's one
//   "Please fill out this field." bubble, every bad TextField, SelectField and
//   TextArea shows its own red message (src/lib/form-problems.ts), and the page
//   scrolls to the first one and puts the cursor there, opening a closed
//   "More details" section first.
// - The server's messages (`errors`) do the same: the first bad box comes into view.
// - A box's message goes as soon as the box holds a good value, without
//   pressing Save again.
// A step of a longer form is checked with checkBoxes(step) (Add Staff "Next").
// Boxes that are not shared fields (a group of ticks) show their message with
// <ProblemText name="..." />.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { firstInOrder, problemMessage, shownProblem } from "@/lib/form-problems";
import { tx } from "@/lib/i18n/tx";
import { useT } from "@/lib/i18n/client";
import { screenMessage } from "@/lib/i18n/messages";

type Box = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Ctx = { shown: (name: string, given?: string) => string | undefined };
const ProblemsContext = createContext<Ctx | null>(null);

/** The message a field shows: what this page found, else the server's until the box is changed to a good value. */
export function useFieldProblem(name: string | undefined, given?: string): string | undefined {
  const c = useContext(ProblemsContext);
  return name && c ? c.shown(name, given) : given;
}

function isBox(t: EventTarget | null): t is Box {
  return t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
}

/** The name a box's message is kept under: its own, or the shared field it sits in (the date box's visible part has none). */
export function boxName(el: Element): string {
  return (el as Box).name || el.closest<HTMLElement>("[data-field]")?.dataset.field || el.id || "";
}

function groupLabel(el: Element): string | null {
  const g = el.closest("fieldset, [role=group], [role=radiogroup]");
  if (!g) return null;
  return g.getAttribute("aria-label") ?? g.querySelector("legend")?.textContent ?? null;
}

function labelOf(el: Box): string {
  const kind = el.type;
  const sameName = el.name && el.form ? el.form.querySelectorAll(`[name="${CSS.escape(el.name)}"]`).length : 1;
  if (kind === "radio" || (kind === "checkbox" && sameName > 1)) { const g = groupLabel(el); if (g) return g; }
  return el.getAttribute("aria-label")
    ?? el.closest<HTMLElement>("[data-field]")?.querySelector("label")?.textContent
    ?? el.labels?.[0]?.textContent
    ?? groupLabel(el)
    ?? el.name;
}

function messageFor(el: Box): string {
  const input = el instanceof HTMLInputElement ? el : null;
  return problemMessage(el.validity, {
    label: labelOf(el), kind: el instanceof HTMLSelectElement ? "select" : el.type,
    min: input?.min || undefined, max: input?.max || undefined, step: input?.step || undefined,
    minLength: input || el instanceof HTMLTextAreaElement ? (el as HTMLInputElement).minLength : undefined,
    maxLength: input || el instanceof HTMLTextAreaElement ? (el as HTMLInputElement).maxLength : undefined,
    title: el.title || undefined, validationMessage: el.validationMessage,
  });
}

/** The button that opens a closed "More details" section made of a button and a hidden part (admissions MoreDetails). */
function openerOf(hidden: Element): HTMLButtonElement | null {
  return hidden.parentElement?.querySelector<HTMLButtonElement>(':scope > button[aria-expanded="false"]') ?? null;
}

/** A box the page can bring into view: shown, or in a closed section that can be opened (not another step of a form). */
function canFocus(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement && el.type === "hidden") return false;
  if ((el as HTMLInputElement).disabled) return false;
  for (let h = el.closest("[hidden]"); h; h = h.parentElement?.closest("[hidden]") ?? null) if (!openerOf(h)) return false;
  return true;
}

/** Opens any closed section the box is in, scrolls it to the middle of the screen and puts the cursor there. */
export function bringToBox(el: HTMLElement) {
  for (let p = el.parentElement; p; p = p.parentElement) if (p instanceof HTMLDetailsElement && !p.open) p.open = true;
  for (let h = el.closest("[hidden]"); h; h = h.parentElement?.closest("[hidden]") ?? null) openerOf(h)?.click();
  // Two frames: a section opened by its button is drawn by React first.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const target = el.closest<HTMLElement>("[data-field]") ?? el;
    target.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }));
}

/** Checks every box inside `root` (one step of a form): each bad one is marked by <FormProblems>. True when all are good. */
export function checkBoxes(root: ParentNode | null | undefined): boolean {
  if (!root) return true;
  let good = true;
  for (const el of Array.from(root.querySelectorAll<Box>("input, select, textarea"))) {
    if (el.willValidate && !el.checkValidity()) good = false;
  }
  return good;
}

/** The boxes kept under `name`, and whether any of them is still bad (null: none can be checked here). */
function stillBad(form: HTMLFormElement, name: string): boolean | null {
  const esc = CSS.escape(name);
  const boxes = Array.from(form.querySelectorAll<Box>(`[name="${esc}"], [data-field="${esc}"] input, [data-field="${esc}"] select, [data-field="${esc}"] textarea`)).filter((b) => b.willValidate);
  if (!boxes.length) return null;
  return boxes.some((b) => !b.validity.valid);
}

/** Brings the first box of `names` (in the page's order) into view. */
function bringFirst(form: HTMLFormElement, names: string[]) {
  const all = Array.from(form.querySelectorAll<HTMLElement>("input, select, textarea, [data-field], [data-problem-for]"));
  const keyOf = (el: HTMLElement) => el.dataset.problemFor ?? (isBox(el) ? boxName(el) : el.dataset.field ?? "");
  const usable = all.filter((el) => (isBox(el) ? canFocus(el) : !el.closest("[hidden]")));
  // A message line (<ProblemText>) stands for its group of boxes.
  const first = firstInOrder(usable.map(keyOf), names);
  if (!first) return;
  const el = usable.find((x) => keyOf(x) === first)!;
  const focusable = isBox(el) ? el : el.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, button, [tabindex]") ?? el;
  if (!focusable.hasAttribute("tabindex") && !isBox(focusable) && !(focusable instanceof HTMLButtonElement)) focusable.setAttribute("tabindex", "-1");
  bringToBox(focusable);
}

export function FormProblems({ errors, children }: { errors?: Record<string, string> | null; children: React.ReactNode }) {
  const marker = useRef<HTMLSpanElement>(null);
  const [found, setFound] = useState<Record<string, string>>({});
  const [changed, setChanged] = useState<ReadonlyMap<string, string>>(() => new Map());
  const given = useRef(errors);
  const armed = useRef(false);
  useEffect(() => { given.current = errors; });

  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    let batch: Box[] = [];
    let timer = 0;
    const onInvalid = (e: Event) => {
      const el = e.target;
      if (!isBox(el)) return;
      // A box with no place for its message (plain markup) keeps the browser's own bubble.
      const name = boxName(el);
      if (!el.closest("[data-field]") && !(name && form.querySelector(`[data-problem-slot="${CSS.escape(name)}"]`))) return;
      e.preventDefault(); // no browser bubble: the box shows its own message
      batch.push(el);
      if (timer) return;
      timer = window.setTimeout(() => {
        const next: Record<string, string> = {};
        for (const b of batch) { const n = boxName(b); if (n && !next[n]) next[n] = messageFor(b); }
        const first = batch.find(canFocus);
        batch = []; timer = 0;
        setFound(next);
        if (first) bringToBox(first);
      }, 0);
    };
    const recheck = (e: Event) => {
      const el = e.target;
      if (isBox(el) && e.type !== "click") {
        const n = boxName(el);
        const was = n ? given.current?.[n] : undefined;
        if (n && was && el.validity.valid) setChanged((c) => (c.get(n) === was ? c : new Map(c).set(n, was)));
      }
      // After React has applied the change (a picked date, a tick), drop the messages of boxes now good.
      window.setTimeout(() => setFound((f) => {
        let out = f;
        for (const n of Object.keys(f)) {
          if (stillBad(form, n) === false) { if (out === f) out = { ...f }; delete out[n]; }
        }
        return out;
      }), 0);
    };
    // Only an answer to Save or Next moves the page; a message set when a box is left does not.
    const arm = (e: Event) => {
      const b = e.type === "submit" ? form : (e.target as Element | null)?.closest?.("button:not([type=button]), [data-submit]");
      if (b) armed.current = true;
    };
    const kinds = ["input", "change", "focusout", "click"] as const;
    form.addEventListener("invalid", onInvalid, true);
    form.addEventListener("submit", arm, true);
    form.addEventListener("click", arm, true);
    for (const k of kinds) form.addEventListener(k, recheck, true);
    return () => {
      form.removeEventListener("invalid", onInvalid, true);
      form.removeEventListener("submit", arm, true);
      form.removeEventListener("click", arm, true);
      for (const k of kinds) form.removeEventListener(k, recheck, true);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  // A new answer to Save or Next: its messages all show again, and its first bad box comes into view.
  useEffect(() => {
    if (!armed.current) return;
    armed.current = false;
    const names = Object.keys(errors ?? {});
    const form = marker.current?.closest("form");
    const frame = requestAnimationFrame(() => {
      setChanged(new Map());
      if (form && names.length) bringFirst(form, names);
    });
    return () => cancelAnimationFrame(frame);
  }, [errors]);

  const value = useMemo<Ctx>(() => ({ shown: (name, g) => shownProblem(name, g, found, changed) }), [found, changed]);
  return (
    <ProblemsContext.Provider value={value}>
      <span ref={marker} hidden />
      {children}
    </ProblemsContext.Provider>
  );
}

/** The message for a group of boxes that is not a shared field (ticks, chips). */
export function ProblemText({ name, given, className }: { name: string; given?: string; className?: string }) {
  const msg = useFieldProblem(name, given);
  // The empty slot tells <FormProblems> this group shows its own message.
  if (!msg) return <span hidden data-problem-slot={name} />;
  return (
    <p data-problem-for={name} data-problem-slot={name} role="alert" className={className ?? "mt-1 text-[12.5px] text-bad flex items-center gap-1.5"}>
      <CircleAlert size={14} aria-hidden="true" className="shrink-0" />{tx(msg)}
    </p>
  );
}

/**
 * A group of ticks where at least one is needed (the students on a correction
 * request): while none is ticked, Save marks the group with `message` and brings
 * it into view like any other bad box. Put it inside the group.
 */
export function NeedOne({ name, message: english }: { name: string; message: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  const message = screenMessage(useT(), english);
  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    const sync = () => {
      const boxes = Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`));
      const none = !boxes.some((b) => b.checked);
      boxes.forEach((b, i) => b.setCustomValidity(none && i === 0 ? message : ""));
    };
    sync();
    form.addEventListener("change", sync, true);
    // Boxes shown or hidden by a filter: check again after each change of the list.
    const watch = new MutationObserver(sync);
    watch.observe(form, { childList: true, subtree: true });
    return () => { form.removeEventListener("change", sync, true); watch.disconnect(); };
  }, [name, message]);
  return <span ref={marker} hidden />;
}
