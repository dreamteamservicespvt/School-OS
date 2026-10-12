"use client";

// When the phone typed belongs to a parent already on record, offers to link
// that parent instead of adding them twice (03 §2 form note on Phone).

import Link from "next/link";
import { useFormResult, FormCheck } from "@/components/students/action-form";
import type { GuardianFormData } from "../_actions/guardians";

export function PhoneMatches({ studentId }: { studentId: string | null }) {
  const state = useFormResult();
  const matches = (state?.data as GuardianFormData | undefined)?.matches;
  if (!matches?.length) return null;
  return (
    <div className="rounded-xl border border-brand/40 bg-brand/8 p-4" role="status">
      <p className="font-semibold">A parent with this phone is already on record</p>
      <ul className="mt-2 space-y-2">
        {matches.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
            <span><strong>{m.name}</strong>{m.children.length ? `, parent of ${m.children.join(", ")}` : ""}</span>
            {studentId
              ? <Link href={`/student-management/guardians/link?student=${studentId}&guardian=${m.id}`} className="inline-flex min-h-11 items-center rounded-xl bg-brand px-3 font-medium text-brand-ink">Link this parent</Link>
              : <Link href={`/student-management/guardians/${m.id}`} className="inline-flex min-h-11 items-center rounded-xl px-3 font-medium text-brand hover:bg-surface">Open</Link>}
          </li>
        ))}
      </ul>
      <FormCheck name="addAnyway" label="This is a different person: add anyway" className="mt-3" />
    </div>
  );
}
