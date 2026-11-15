"use client";

import { useEffect, useRef, useState } from "react";
import { Words } from "@/lib/i18n/client";
import { FormText } from "@/components/students/action-form";

/** Follows the form's "Certificate type" choice as the person changes it. */
function useCertificateType(first: string) {
  const ref = useRef<HTMLSpanElement>(null);
  const [type, setType] = useState(first);
  useEffect(() => {
    const form = ref.current?.closest("form");
    const select = form?.querySelector<HTMLSelectElement>("select[name=type]");
    if (!form || !select) return;
    const read = () => setType(select.value);
    read();
    form.addEventListener("change", read);
    return () => form.removeEventListener("change", read);
  }, []);
  return { ref, type };
}

/** Shows its fields only for the certificate types they apply to; hidden fields are not sent or checked. */
export function ForTypes({ types, first, children }: { types: string[]; first: string; children: React.ReactNode }) {
  const { ref, type } = useCertificateType(first);
  const on = types.includes(type);
  return (
    <>
      <span ref={ref} hidden />
      <fieldset disabled={!on} hidden={!on} className="space-y-4">{children}</fieldset>
    </>
  );
}

/** The main button says what pressing it does: issue now, or send for approval first. */
export function IssueLabel({ approval, first }: { approval: string[]; first: string }) {
  const { ref, type } = useCertificateType(first);
  return (
    <span ref={ref}>
      {type === "TC" ? <Words k="Send TC for approval" /> : approval.includes(type) ? <Words k="Send for approval" /> : <Words k="Issue certificate" />}
    </span>
  );
}

/** Purpose: required (with a star) for a bonafide certificate, optional for the others. */
export function PurposeField({ first }: { first: string }) {
  const { ref, type } = useCertificateType(first);
  const bonafide = type === "BONAFIDE";
  return (
    <>
      <span ref={ref} hidden />
      <FormText name="purpose" label="Purpose" required={bonafide} maxLength={200} help={bonafide ? "For example: bank account opening" : "Optional"} />
    </>
  );
}
