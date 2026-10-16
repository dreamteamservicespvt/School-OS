"use client";

// A <select> that keeps its choice when React resets the form after a server
// action (React 19 resets every <form action> once the action ends). Text boxes
// come back from their value or defaultValue; a select did not, so after a refused
// save the item, staff member or bed box showed "Choose…" again while the rest of
// the form kept what was typed (QA CAMPUS2-02, PEOPLE-12).
// - Controlled (value): after the reset, the box is set back to the value React holds.
// - Uncontrolled (defaultValue): the box remounts when the value sent back changes,
//   so the browser's reset lands on that value.
import { useEffect, useRef } from "react";

export function KeepSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const ref = useRef<HTMLSelectElement>(null);
  const controlled = props.value !== undefined;
  const value = useRef(props.value);
  useEffect(() => { value.current = props.value; }, [props.value]);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form || !controlled) return;
    const restore = () => setTimeout(() => { if (ref.current && value.current !== undefined) ref.current.value = String(value.current); }, 0);
    form.addEventListener("reset", restore);
    return () => form.removeEventListener("reset", restore);
  }, [controlled]);
  return <select ref={ref} key={controlled ? undefined : `keep-${String(props.defaultValue ?? "")}`} {...props} />;
}
