"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

type NoPhoto = { id: string; name: string; rollNo: number | null };

/** Print the class in batches of up to 50. Students without a photo are listed first, with "Print anyway". */
export function PrintBatches({ total, batch, batches, base, noPhoto }: { total: number; batch: number; batches: number; base: string; noPhoto: NoPhoto[] }) {
  const [anyway, setAnyway] = useState(noPhoto.length === 0);
  return (
    <Card>
      <CardHeader title="Print admit cards" description={`${total} students${batches > 1 ? `, in ${batches} batches of up to ${batch}` : ", in one batch"}`} />
      <CardBody className="space-y-3">
        {noPhoto.length > 0 && !anyway && (
          <Alert tone="warning" title={`${noPhoto.length} ${noPhoto.length === 1 ? "student has" : "students have"} no photo`}
            action={<Button variant="secondary" onClick={() => setAnyway(true)}>Print anyway</Button>}>
            <ul className="mt-1 list-disc pl-5">
              {noPhoto.slice(0, 10).map((s) => <li key={s.id}>{s.rollNo ? `${s.rollNo}. ` : ""}{s.name}</li>)}
              {noPhoto.length > 10 && <li>and {noPhoto.length - 10} more</li>}
            </ul>
            <p className="mt-1">Add photos on each Student Profile, or print now and the card shows an empty photo box.</p>
          </Alert>
        )}
        {anyway && (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: batches }, (_, i) => {
              const from = i * batch + 1;
              const to = Math.min(total, (i + 1) * batch);
              return (
                <a key={i} href={`${base}batch=${i}`} target="_blank" rel="noopener" className={buttonClass(i === 0 ? "primary" : "secondary")}>
                  {batches > 1 ? `Students ${from} to ${to} (PDF)` : "Preview and download (PDF)"}
                </a>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** One student's admit card: search the student by name, roll or admission number. */
export function StudentCard({ students, base }: { students: { id: string; name: string; rollNo: number | null; admissionNo: string }[]; base: string }) {
  const [q, setQ] = useState("");
  const found = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return students.filter((s) => s.name.toLowerCase().includes(t) || s.admissionNo.toLowerCase().includes(t) || String(s.rollNo ?? "") === t).slice(0, 8);
  }, [q, students]);
  return (
    <Card>
      <CardHeader title="One student's admit card" />
      <CardBody>
        <label className="block text-sm font-medium" htmlFor="admit-student">Search the student</label>
        <input id="admit-student" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, roll number or admission number"
          className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base" />
        {q.trim() && (
          found.length === 0 ? <p className="mt-2 text-sm text-ink-2">No student in this class matches.</p> : (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line" aria-live="polite">
              {found.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span>{s.rollNo ? `${s.rollNo}. ` : ""}{s.name} <span className="text-sm text-ink-2">{s.admissionNo}</span></span>
                  <a className={buttonClass("secondary", "sm")} href={`${base}student=${s.id}`} target="_blank" rel="noopener">Admit card</a>
                </li>
              ))}
            </ul>
          )
        )}
      </CardBody>
    </Card>
  );
}
