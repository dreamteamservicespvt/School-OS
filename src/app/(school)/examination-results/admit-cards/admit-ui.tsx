"use client";

// Admit Cards workspace (approved design AdmitCardsPage and AdmitCard): the
// class's students with their photo state, a search for one student, a
// preview of the card, and printing in batches of up to 50 (P9).

import { useMemo, useState } from "react";
import { Download, Eye, IdCard, Printer, School, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Banner, DataList, Toolbar } from "@/components/ui/kit";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { Words } from "@/lib/i18n/client";

export type AdmitStudent = { id: string; name: string; rollNo: number | null; admissionNo: string; photo: string | null; father: string; mother: string; skip: string[] };
export type AdmitPaper = { subjectId: string; subject: string; split: string; day: string; time: string; max: string; invigilator: string };
export type AdmitHead = { school: string; place: string; logo: string | null; title: string; examLine: string; classLabel: string; instructions: string[]; signLines: string[] };

const PRIMARY = buttonClass("primary");
const SECONDARY = buttonClass("secondary");

export function AdmitWorkspace({ students, papers, head, base, batch, printedNote }: {
  students: AdmitStudent[]; papers: AdmitPaper[]; head: AdmitHead; base: string; batch: number; printedNote: string;
}) {
  const [q, setQ] = useState("");
  const [one, setOne] = useState<AdmitStudent | null>(null);
  const [print, setPrint] = useState(false);
  const noPhoto = students.filter((s) => !s.photo);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return students;
    return students.filter((s) => s.name.toLowerCase().includes(t) || s.admissionNo.toLowerCase().includes(t) || String(s.rollNo ?? "") === t);
  }, [q, students]);
  const batches = Math.ceil(students.length / batch);
  const view = (s: AdmitStudent) => <Button size="sm" variant="ghost" icon={Eye} onClick={() => setOne(s)} aria-label={`View admit card of ${s.name}`}><Words k="View" /></Button>;

  return (
    <>
      {noPhoto.length > 0 && (
        <div className="p-3 border-b border-line">
          <Banner tone="warn" title={`${noPhoto.length} ${noPhoto.length === 1 ? "student has" : "students have"} no photo:`}>
            {noPhoto.slice(0, 6).map((s) => `${s.name}${s.rollNo ? ` (roll ${s.rollNo})` : ""}`).join(", ")}{noPhoto.length > 6 ? ` and ${noPhoto.length - 6} more` : ""}<Words k=". You can still print; the photo box stays empty. Add photos on each Student Profile." />
          </Banner>
        </div>
      )}
      <Toolbar>
        <label className="relative flex-1 min-w-0">
          <span className="sr-only"><Words k="Find one student" /></span>
          <Search size={17} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find one student: name, roll or admission no." className={cx(inputCls(), "h-11 pl-10")} />
        </label>
        <Button variant="primary" icon={Printer} onClick={() => setPrint(true)} disabled={students.length === 0}><Words k="Print" /> {students.length} {students.length === 1 ? "card" : "cards"}</Button>
      </Toolbar>
      <DataList bp="md" minWidth={560} rowKey={(s) => s.id} rows={rows}
        empty={<p className="px-4 py-8 text-center text-[14px] text-ink3"><Words k="No student in this class matches." /></p>}
        footer={`Showing ${rows.length} of ${students.length} · ${printedNote}`}
        columns={[
          { key: "roll", label: "Roll", render: (s) => <span className="tnum text-ink3">{s.rollNo ?? "—"}</span> },
          { key: "name", label: "Student", render: (s) => <div className="flex items-center gap-2.5"><Avatar name={s.name} src={s.photo} size={32} /><span className="font-semibold">{s.name}</span></div> },
          { key: "adm", label: "Admission no.", render: (s) => <span className="font-mono text-[12.5px]">{s.admissionNo}</span> },
          { key: "photo", label: "Photo", render: (s) => (s.photo ? <Pill tone="ok" dot><Words k="Ready" /></Pill> : <Pill tone="warn"><Words k="No photo" /></Pill>) },
          { key: "act", label: <span className="sr-only"><Words k="Card" /></span>, align: "right", render: view },
        ]}
        mobile={(s) => ({
          lead: <Avatar name={s.name} src={s.photo} size={36} />,
          title: `${s.rollNo ? `${s.rollNo}. ` : ""}${s.name}`, sub: s.admissionNo, right: view(s),
          pills: s.photo ? undefined : <Pill tone="warn" className="!h-[22px] !text-[11.5px]"><Words k="No photo" /></Pill>,
        })} />

      <Dialog open={Boolean(one)} onClose={() => setOne(null)} wide title={one ? `Admit card · ${one.name}` : ""} sub={one ? `${head.classLabel}${one.rollNo ? ` · roll ${one.rollNo}` : ""}` : undefined}
        footer={one && (
          <>
            <Button variant="ghost" onClick={() => setOne(null)}><Words k="Close" /></Button>
            <a href={`${base}student=${one.id}`} target="_blank" rel="noopener" className={SECONDARY}><Download size={17} aria-hidden="true" /><Words k="PDF" /></a>
            <a href={`${base}student=${one.id}`} target="_blank" rel="noopener" className={PRIMARY}><Printer size={17} aria-hidden="true" /><Words k="Print" /></a>
          </>
        )}>
        {one && <AdmitCard s={one} papers={papers} head={head} />}
      </Dialog>

      <Dialog open={print} onClose={() => setPrint(false)} title={`Print ${students.length} admit ${students.length === 1 ? "card" : "cards"}?`}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setPrint(false)}><Words k="Cancel" /></Button>
            {batches === 1 && <a href={`${base}batch=0`} target="_blank" rel="noopener" className={PRIMARY} onClick={() => setPrint(false)}><Printer size={17} aria-hidden="true" /><Words k="Print" /> {students.length} {students.length === 1 ? "card" : "cards"}</a>}
          </>
        )}>
        <div className="flex flex-col gap-3 text-[14px] text-ink2">
          <p>{head.examLine} · {head.classLabel}<Words k=". They print in" /> <b className="text-ink">{batches} {batches === 1 ? "batch" : "batches"} <Words k="of up to" /> {batch}</b><Words k=", in roll order. Each batch opens as a PDF to print or save." /></p>
          {noPhoto.length > 0 && <Banner tone="warn">{noPhoto.length} {noPhoto.length === 1 ? "student has" : "students have"} <Words k="no photo. Their cards print with an empty photo box." /></Banner>}
          {batches > 1 && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: batches }, (_, i) => (
                <a key={i} href={`${base}batch=${i}`} target="_blank" rel="noopener" className={i === 0 ? PRIMARY : SECONDARY}>
                  <Printer size={17} aria-hidden="true" /><Words k="Students" /> {i * batch + 1} <Words k="to" /> {Math.min(students.length, (i + 1) * batch)}
                </a>
              ))}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

/** The preview card on the side (design: Preview card with a PDF link). */
export function AdmitPreview({ s, papers, head, base }: { s: AdmitStudent; papers: AdmitPaper[]; head: AdmitHead; base: string }) {
  return (
    <Card>
      <CardHeader title="Preview" description={`${s.name}${s.rollNo ? ` · roll ${s.rollNo}` : ""}`} icon={IdCard}
        action={<a href={`${base}student=${s.id}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-ink2 hover:bg-sunken hover:text-ink"><Download size={15} aria-hidden="true" /><Words k="PDF" /></a>} />
      <div className="px-3 pb-3"><AdmitCard s={s} papers={papers} head={head} compact /></div>
    </Card>
  );
}

export function AdmitCard({ s, papers, head, compact }: { s: AdmitStudent; papers: AdmitPaper[]; head: AdmitHead; compact?: boolean }) {
  const mine = papers.filter((p) => !s.skip.includes(p.subjectId));
  const facts: [string, React.ReactNode][] = [
    ["Student", s.name], ["Roll no.", s.rollNo ?? "—"], ["Class", head.classLabel],
    ["Admission no.", <span key="a" className="font-mono text-[12px]">{s.admissionNo}</span>], ["Father's name", s.father || "—"], ["Mother's name", s.mother || "—"],
  ];
  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden text-[13px]">
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-line bg-sunken/40">
        {head.logo
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived file link
          ? <img src={head.logo} alt="" className={cx("rounded-xl object-contain shrink-0", compact ? "size-[34px]" : "size-10")} />
          : <span aria-hidden="true" className={cx("grid place-items-center rounded-xl bg-brand text-brandink shrink-0", compact ? "size-[34px]" : "size-10")}><School size={compact ? 18 : 20} /></span>}
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-[15px] leading-tight">{head.school}</p>
          {head.place && <p className="text-[11.5px] text-ink3 truncate">{head.place}</p>}
        </div>
      </div>
      <div className="px-4 pt-3 text-center">
        <p className="eyebrow text-brand">{head.title}</p>
        <p className="font-semibold text-[14.5px]">{head.examLine}</p>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 min-w-0">
          {facts.map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-[11px] text-ink3 font-semibold">{k}</dt><dd className="font-semibold truncate">{v}</dd></div>
          ))}
        </dl>
        <div className={cx("rounded-xl border border-line grid place-items-center shrink-0 overflow-hidden", compact ? "w-[72px] h-[88px]" : "w-[88px] h-[108px]")}>
          {s.photo
            // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived file link
            ? <img src={s.photo} alt={`Photo of ${s.name}`} className="h-full w-full object-cover" />
            : <span className="text-[11px] text-ink3 text-center px-1"><Words k="No photo" /></span>}
        </div>
      </div>
      <div className="overflow-x-auto scroll-thin border-t border-line">
        <table className="w-full text-[12.5px] min-w-[460px]">
          <thead><tr className="text-[11px] text-ink3 text-left border-b border-line">{["No.", "Subject", "Date", "Time", "Max", "Invigilator"].map((h) => <th key={h} scope="col" className="font-semibold px-3 py-2 first:pl-4">{h}</th>)}</tr></thead>
          <tbody>
            {mine.map((p, i) => (
              <tr key={p.subjectId} className="border-b border-line/60 last:border-0">
                <td className="px-3 pl-4 py-1.5 tnum text-ink3">{i + 1}</td>
                <td className="px-3 py-1.5"><b className="font-semibold">{p.subject}</b>{p.split && <span className="block text-[11px] text-ink3">{p.split}</span>}</td>
                <td className="px-3 py-1.5 whitespace-nowrap tnum">{p.day}</td>
                <td className="px-3 py-1.5 whitespace-nowrap tnum">{p.time}</td>
                <td className="px-3 py-1.5 tnum font-semibold">{p.max}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{p.invigilator || "—"}</td>
              </tr>
            ))}
            {mine.length === 0 && <tr><td colSpan={6} className="px-4 py-3 text-ink3"><Words k="No papers for this class." /></td></tr>}
          </tbody>
        </table>
      </div>
      {head.instructions.length > 0 && (
        <div className="px-4 py-3 border-t border-line">
          <p className="text-[11px] text-ink3 font-semibold mb-1"><Words k="Instructions for candidates" /></p>
          <ul className="text-[12px] text-ink2 list-disc pl-4 flex flex-col gap-0.5">
            {head.instructions.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      )}
      <div className={cx("grid gap-3 px-4 pt-6 pb-3 text-center text-[11px] text-ink3", head.signLines.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {head.signLines.map((x) => <div key={x}><span className="block border-t border-line pt-1">{x}</span></div>)}
      </div>
    </div>
  );
}
