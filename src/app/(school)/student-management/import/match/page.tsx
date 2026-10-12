import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, Columns3, ListChecks, Sparkles, TriangleAlert } from "lucide-react";
import { withSchool } from "@/lib/db";
import { autoMatch, previewImport } from "@/lib/importer";
import { STUDENT_IMPORT, UDISE_IMPORT, studentImport } from "@/lib/students/import";
import { StudentProblem } from "@/lib/students/students";
import { acceptedFixes, applyFixes, suggestFixes, suggestMatch } from "@/lib/students/smart-import";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Suggestion } from "@/components/ui/blocks";
import { cx } from "@/components/ui/cx";
import { inputCls } from "@/components/ui/field";
import { ActionForm } from "@/components/students/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { BASE, studentPage } from "../../_lib/page";
import { runImportAction } from "../../_actions/import";
import { loadSheet, matchFrom } from "../load";
import { ImportSteps } from "../steps";

export const metadata: Metadata = { title: "Check the import" };

const isId = (v?: string) => Boolean(v && /^[0-9a-f-]{36}$/i.test(v));
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(",") : v);

/** Import (P10), steps 3 and 4: match the file's columns, see each row's problems, then import the good rows. */
export default async function ImportMatchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, can, settings } = await studentPage();
  if (!can.manage) redirect(BASE);
  const raw = await searchParams;
  const sp: Record<string, string | undefined> = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, one(v)]));
  if (!isId(sp.file)) redirect(`${BASE}/import`);
  const kindKey = sp.kind === UDISE_IMPORT ? UDISE_IMPORT : STUDENT_IMPORT;
  const sectionId = isId(sp.section) ? sp.section! : null;
  const kind = studentImport(kindKey, { sectionId, applyFeePlan: sp.fee === "1" });
  const smart = settings.smartImportOn;
  const accepted = smart ? acceptedFixes(sp.fix) : new Set<string>();

  const result = await withSchool(current.ctx, async (tx) => {
    try {
      const sheet = await loadSheet(tx, sp.file!);
      const match = matchFrom(sp, autoMatch(kind.columns, sheet.headers), kind.columns.map((c) => c.key), sheet.headers.length);
      const rows = smart ? applyFixes(sheet.rows, match, accepted) : sheet.rows;
      const preview = await previewImport(tx, current.ctx, kind, rows, match);
      const section = sectionId ? await tx.section.findUnique({ where: { id: sectionId }, include: { schoolClass: true } }) : null;
      return { ok: true as const, sheet, match, preview, section };
    } catch (e) {
      if (e instanceof StudentProblem) return { ok: false as const, message: e.message };
      throw e;
    }
  }, { timeout: 120_000 });

  if (!result.ok) {
    return (
      <>
        <BackLink href={`${BASE}/import`} label="Import students" />
        <PageHeader title="Check the import" href={`${BASE}/import/match`} userId={current.user.id} />
        <Alert tone="danger" action={<Link className="font-medium underline" href={`${BASE}/import`}>Upload again</Link>}>{result.message}</Alert>
      </>
    );
  }
  const { sheet, match, preview } = result;
  const missingRequired = kind.columns.filter((c) => c.required && match[c.key] === undefined);
  const keep = ["file", "kind", "section", "fee"].filter((k) => sp[k]);
  const matchSuggestions = smart ? suggestMatch(kind.columns, sheet.headers, sheet.rows, match) : [];
  const fixSuggestions = smart ? suggestFixes(kind.columns, sheet.rows, match) : [];
  const fixValue = [...accepted].join(",");
  const withMatch = (m: Record<string, number>) => {
    const q = new URLSearchParams();
    for (const k of keep) q.set(k, sp[k]!);
    for (const c of kind.columns) q.set(`m_${c.key}`, m[c.key] !== undefined ? String(m[c.key]) : "");
    if (fixValue) q.set("fix", fixValue);
    return `${BASE}/import/match?${q}`;
  };

  return (
    <>
      <BackLink href={`${BASE}/import`} label="Import students" />
      <PageHeader title="Check the import" href={`${BASE}/import/match`} userId={current.user.id} sub={`${sheet.file.fileName} · ${sheet.rows.length} rows`} />
      <ImportSteps at={missingRequired.length ? 3 : 4} />
      <div className="grid gap-4 xl:grid-cols-[26rem_1fr]">
        <div className="flex flex-col gap-4 self-start">
          {matchSuggestions.length > 0 && (
            <Suggestion title="Columns we think are these" source="the headings and the values in your file"
              actions={<ButtonLink href={withMatch({ ...match, ...Object.fromEntries(matchSuggestions.map((m) => [m.key, m.index])) })} variant="soft" size="sm">Use these matches</ButtonLink>}>
              <ul className="flex flex-col gap-1.5">
                {matchSuggestions.map((m) => <li key={m.key}><b className="font-semibold text-ink">{m.label}</b> ← “{m.header}” <span className="text-ink3">· {m.why}</span></li>)}
              </ul>
              <p className="mt-2 text-[12.5px] text-ink3">Nothing changes until you press “Use these matches”. You can still change any column below.</p>
            </Suggestion>
          )}
          <Card>
            <CardHeader title="Match columns" description="We matched the headings we recognised. Check each one." icon={Columns3} />
            <form method="get" className="px-5 pb-5 flex flex-col gap-2.5">
              {keep.map((k) => <input key={k} type="hidden" name={k} value={sp[k]} />)}
              {fixValue && <input type="hidden" name="fix" value={fixValue} />}
              {kind.columns.map((c) => (
                <label key={c.key} className="grid grid-cols-[1fr_12.5rem] items-center gap-2 text-[14px]">
                  <span className="font-medium">{c.label}{c.required && <span className="text-bad" aria-hidden="true"> *</span>}</span>
                  <select name={`m_${c.key}`} defaultValue={match[c.key] ?? ""} className={cx(inputCls(), "h-10", c.required && match[c.key] === undefined && "border-bad")}>
                    <option value="">Not in the file</option>
                    {sheet.headers.map((h, i) => <option key={`${h}-${i}`} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
              <Button type="submit" variant="secondary" className="self-start mt-1">Check again</Button>
            </form>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          {fixSuggestions.length > 0 && (
            <form method="get">
              {keep.map((k) => <input key={k} type="hidden" name={k} value={sp[k]} />)}
              {kind.columns.map((c) => <input key={c.key} type="hidden" name={`m_${c.key}`} value={match[c.key] ?? ""} />)}
              <Suggestion title="Likely fixes in your file" source="the values in each matched column; empty cells stay empty"
                actions={<button type="submit" className={buttonClass("soft", "sm")}>Use the ticked fixes</button>}>
                <ul className="flex flex-col gap-3">
                  {fixSuggestions.map((f) => (
                    <li key={f.id}>
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input type="checkbox" name="fix" value={f.id} defaultChecked={accepted.has(f.id)} className="mt-1 size-[18px] accent-[rgb(var(--brand))]" />
                        <span>
                          <b className="font-semibold text-ink">{f.label}</b>: {f.what} <Pill className="!h-5 !text-[11px] ml-1">{f.count} {f.count === 1 ? "cell" : "cells"}</Pill>
                          <span className="block text-[12.5px] text-ink3">{f.examples.map((e) => `Row ${e.line}: “${e.from}” → “${e.to}”`).join(" · ")}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {accepted.size > 0 && <p className="mt-2 text-[12.5px] text-ink3">{accepted.size} {accepted.size === 1 ? "fix is" : "fixes are"} used in the check below. Untick and press the button to undo.</p>}
              </Suggestion>
            </form>
          )}
          <Card>
            <CardHeader title="Check" icon={ListChecks}
              description={`${preview.good.length} ${preview.good.length === 1 ? "row is" : "rows are"} ready · ${preview.bad.length} ${preview.bad.length === 1 ? "row has" : "rows have"} problems${result.section ? ` · rows with no class go to ${result.section.schoolClass.name} ${result.section.name}` : ""}`} />
            <div className="px-5 pb-5 flex flex-col gap-4">
              {missingRequired.length > 0 && <Alert tone="warning">Match these required columns first: {missingRequired.map((c) => c.label).join(", ")}.</Alert>}
              {preview.good.length > 0 && (
                <div className="flex items-start gap-3">
                  <CircleCheck size={18} className="text-ok shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-[14px] text-ink2"><b className="font-semibold text-ink">Ready to import:</b> {preview.good.slice(0, 8).map((g) => g.row.fullName).join(", ")}{preview.good.length > 8 ? ` and ${preview.good.length - 8} more` : ""}.</p>
                </div>
              )}
              {preview.bad.length > 0 && (
                <div>
                  <p className="mb-1.5 font-semibold text-[14px] flex items-center gap-2"><TriangleAlert size={17} className="text-warn" aria-hidden="true" />Rows with problems (not imported)</p>
                  <ul className="max-h-96 divide-y divide-line/70 overflow-y-auto scroll-thin rounded-xl border border-line text-[13.5px]">
                    {preview.bad.slice(0, 200).map((b) => (
                      <li key={b.line} className="px-3 py-2"><b className="font-semibold">Row {b.line}</b>{b.row.fullName ? ` · ${b.row.fullName}` : ""}: <span className="text-bad">{b.problems.join(" ")}</span></li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[12.5px] text-ink3">After the import you can download these rows with their problems, fix them and import again.</p>
                </div>
              )}
            </div>
          </Card>
          <Card className="p-5">
            {preview.good.length === 0 ? (
              <p className="text-[14px] text-ink2">No row is ready yet. Fix the column match, or fix the file and <Link className="font-semibold text-brand underline" href={`${BASE}/import`}>upload it again</Link>.</p>
            ) : (
              <ActionForm action={runImportAction} footer={<>
                <SubmitButton pendingText="Importing…">{`Import ${preview.good.length} ${preview.good.length === 1 ? "student" : "students"}`}</SubmitButton>
                <ButtonLink href={`${BASE}/import`} variant="ghost">Start again</ButtonLink>
              </>}>
                <input type="hidden" name="file" value={sp.file} />
                <input type="hidden" name="kind" value={kindKey} />
                <input type="hidden" name="section" value={sectionId ?? ""} />
                <input type="hidden" name="fee" value={sp.fee === "1" ? "1" : ""} />
                <input type="hidden" name="match" value={JSON.stringify(match)} />
                <input type="hidden" name="fix" value={fixValue} />
                <p className="text-[14px] text-ink2">Only the ready rows are imported{preview.bad.length ? `; the ${preview.bad.length} with problems are skipped` : ""}.{accepted.size ? ` The ${accepted.size} fixes you ticked are used.` : ""} You can undo the whole import later from Import history.</p>
              </ActionForm>
            )}
          </Card>
          {!smart && can.manage && (
            <p className="text-[12.5px] text-ink3 flex items-center gap-1.5"><Sparkles size={14} aria-hidden="true" />A messy sheet from an old system? Smart Import suggests column matches and fixes. Switch it on in <Link className="font-semibold text-brand underline" href={`${BASE}/settings`}>Student Settings</Link>.</p>
          )}
        </div>
      </div>
    </>
  );
}
