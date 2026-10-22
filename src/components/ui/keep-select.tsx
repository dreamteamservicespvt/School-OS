"use client";

// Boxes that keep their choice when React resets the form after a server action
// (React 19 resets every <form action> once the action ends). Text boxes come
// back from their value or defaultValue; a select and a tick box did not, so
// after a refused save the item, class or staff member showed "Choose…" again
// (or a tick came off) while React still held the old choice, and the next save
// sent the wrong thing (QA CAMPUS2-02, PEOPLE-12, ADMIT-01).
// - Controlled (value / checked): after the reset, the box is set back to what React holds.
// - Uncontrolled select (defaultValue): the box remounts when the value sent back
//   changes, so the browser's reset lands on that value.
// tests/keep-on-reset.test.ts fails when a controlled <select> or tick box that
// can sit in an action form does not use these.
import { useEffect, useRef } from "react";

/** After the form around `ref` is reset, put back what React holds (the reset runs after the "reset" event). */
function useRestoreOnReset<T extends HTMLSelectElement | HTMLInputElement>(ref: React.RefObject<T | null>, active: boolean, restore: (el: T) => void) {
  const latest = useRef(restore);
  useEffect(() => { latest.current = restore; });
  useEffect(() => {
    const form = ref.current?.form;
    if (!form || !active) return;
    const onReset = () => setTimeout(() => { if (ref.current) latest.current(ref.current); }, 0);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [ref, active]);
}

export function KeepSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const own = useRef<HTMLSelectElement>(null);
  const controlled = props.value !== undefined;
  useRestoreOnReset(own, controlled, (el) => {
    const v = props.value;
    if (v === undefined) return;
    if (Array.isArray(v)) { for (const o of Array.from(el.options)) o.selected = v.map(String).includes(o.value); }
    else el.value = String(v);
  });
  return <select ref={own} key={controlled ? undefined : `keep-${String(props.defaultValue ?? "")}`} {...props} />;
}

/** A tick box or round choice (`<input type="checkbox|radio" checked>`) that keeps its tick after a form reset. */
export function KeepCheck(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const own = useRef<HTMLInputElement>(null);
  const controlled = props.checked !== undefined;
  useRestoreOnReset(own, controlled, (el) => { el.checked = Boolean(props.checked); });
  return <input ref={own} {...props} />;
}
