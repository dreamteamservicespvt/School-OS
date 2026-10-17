import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, Columns3, ListChecks, Sparkles, TriangleAlert } from "lucide-react";
import { withSchool } from "@/lib/db";
import { autoMatch, previewImport } from "@/lib/importer";
import { decisionWords } from "@/lib/students/import";
import { STUDENT_IMPORT, STUDENT_IMPORT_KINDS, STUDENT_UPDATE_IMPORT, studentImportFor } from "@/lib/students/import-kinds";
import type { StudentUpdate } from "@/lib/students/update-import";
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
import { decisionsFrom, loadSheet, matchFrom } from "../load";
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
  const kindKey = sp.kind && STUDENT_IMPORT_KINDS.includes(sp.kind) ? sp.kind : STUDENT_IMPORT;
  const updating = kindKey === STUDENT_UPDATE_IMPORT;
  const sectionId = isId(sp.section) ? sp.section! : null;
  const kind = studentImportFor(kindKey, { sectionId, applyFeePlan: sp.fee === "1" });
  const smart = settings.smartImportOn;
  const accepted = smart ? acceptedFixes(sp.fix) : new Set<string>();
  // Choices made for rows that may already be on record (d_<row>=…): nothing is merged without one.
  const decisions = updating ? {} : decisionsFrom(sp);

  const result = await withSchool(current.ctx, async (tx) => {
    try {
      const sheet = await loadSheet(tx, sp.file!);
      const match = matchFrom(sp, autoMatch(kind.columns, sheet.headers), kind.columns.map((c) => c.key), sheet.headers.length);
      const rows = smart ? applyFixes(sheet.rows, match, accepted) : sheet.rows;
      const preview = await previewImport(tx, current.ctx, kind, rows, match, decisions);
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
    for (const [line, v] of Object.entries(decisions)) q.set(`d_${line}`, v);
    return `${BASE}/import/match?${q}`;
  };
  /** This page with one row's choice set (or taken back), keeping everything else. */
  const withChoice = (line: number, value: string | null) => {
    const q = new URLSearchParams();
    for (const k of keep) q.set(k, sp[k]!);
    for (const c of kind.columns) q.set(`m_${c.key}`, match[c.key] !== undefined ? String(match[c.key]) : "");
    if (fixValue) q.set("fix", fixValue);
    for (const [l, v] of Object.entries({ ...decisions, [line]: value ?? "" })) if (v) q.set(`d_${l}`, v);
    return `${BASE}/import/match?${q}`;
  };
  const decided = preview.good.filter((g) => decisions[g.line]);

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
              {Object.entries(decisions).map(([line, v]) => <input key={line} type="hidden" name={`d_${line}`} value={v} />)}
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
              {updating && preview.good.length > 0 && (
                <div>
                  <p className="mb-1.5 font-semibold text-[14px] flex items-center gap-2"><CircleCheck size={17} className="text-ok" aria-hidden="true" />What will change</p>
                  <ul className="max-h-96 divide-y divide-line/70 overflow-y-auto scroll-thin rounded-xl border border-line text-[13.5px]">
                    {preview.good.slice(0, 200).map((g) => {
                      const u = g.value as StudentUpdate;
                      return (
                        <li key={g.line} className="px-3 py-2"><b className="font-semibold">Row {g.line}</b> · {g.row.admissionNo}: {u.changes.map((c) => `${c.label} ${c.from} → ${c.to}`).join("; ")}</li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {!updating && preview.good.length > 0 && (
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
                      <li key={b.line} className="px-3 py-2"><b className="font-semibold">Row {b.line}</b>{b.row.fullName ? ` · ${b.row.fullName}` : b.row.admissionNo ? ` · ${b.row.admissionNo}` : ""}: <span className="text-bad">{b.problems.join(" ")}</span>
                        {decisions[b.line] && <span className="block text-ink2">Your choice: {decisionWords(decisions[b.line])} <Link className="font-semibold text-brand underline" href={withChoice(b.line, null)}>Change</Link></span>}
                        {b.choices && b.choices.length > 0 && (
                          <span className="mt-1.5 flex flex-wrap gap-1.5" aria-label={`Choose what row ${b.line} is`}>
                            {b.choices.filter((c) => c.value !== decisions[b.line]).map((c) => <Link key={c.value} href={withChoice(b.line, c.value)} className={buttonClass("secondary", "sm")}>{c.label}</Link>)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[12.5px] text-ink3">After the import you can download these rows with their problems, fix them and import again. A row that may already be on record waits for your choice: nothing is merged on a guess.</p>
                </div>
              )}
              {decided.length > 0 && (
                <div>
                  <p className="mb-1.5 font-semibold text-[14px]">Your choices</p>
                  <ul className="max-h-72 divide-y divide-line/70 overflow-y-auto scroll-thin rounded-xl border border-line text-[13.5px]">
                    {decided.slice(0, 200).map((g) => (
                      <li key={g.line} className="px-3 py-2"><b className="font-semibold">Row {g.line}</b>{g.row.fullName ? ` · ${g.row.fullName}` : ""}: {decisionWords(decisions[g.line])} <Link className="font-semibold text-brand underline" href={withChoice(g.line, null)}>Change</Link></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
          <Card className="p-5">
            {preview.good.length === 0 ? (
              <p className="text-[14px] text-ink2">No row is ready yet. Fix the column match, or fix the file and <Link className="font-semibold text-brand underline" href={`${BASE}/import`}>upload it again</Link>.</p>
            ) : (
              <ActionForm action={runImportAction} footer={<>
                <SubmitButton pendingText={updating ? "Updating…" : "Importing…"}>{`${updating ? "Update" : "Import"} ${preview.good.length} ${preview.good.length === 1 ? "student" : "students"}`}</SubmitButton>
                <ButtonLink href={`${BASE}/import`} variant="ghost">Start again</ButtonLink>
              </>}>
                <input type="hidden" name="file" value={sp.file} />
                <input type="hidden" name="kind" value={kindKey} />
                <input type="hidden" name="section" value={sectionId ?? ""} />
                <input type="hidden" name="fee" value={sp.fee === "1" ? "1" : ""} />
                <input type="hidden" name="match" value={JSON.stringify(match)} />
                <input type="hidden" name="fix" value={fixValue} />
                <input type="hidden" name="decisions" value={JSON.stringify(decisions)} />
                <p className="text-[14px] text-ink2">Only the ready rows are imported{preview.bad.length ? `; the ${preview.bad.length} with problems are skipped` : ""}.{accepted.size ? ` The ${accepted.size} fixes you ticked are used.` : ""} {updating ? "Undo in Import history puts the old values back, except any changed again since." : "You can undo the whole import later from Import history."}</p>
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
