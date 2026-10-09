import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { autoMatch, previewImport } from "@/lib/importer";
import { STUDENT_IMPORT, UDISE_IMPORT, studentImport } from "@/lib/students/import";
import { StudentProblem } from "@/lib/students/students";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/students/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { BASE, studentPage } from "../../_lib/page";
import { runImportAction } from "../../_actions/import";
import { loadSheet, matchFrom } from "../load";

export const metadata: Metadata = { title: "Check the import" };

const isId = (v?: string) => Boolean(v && /^[0-9a-f-]{36}$/i.test(v));

/** Import (P10), steps 3 and 4: match the file's columns, see each row's problems, then import the good rows. */
export default async function ImportMatchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { current, can } = await studentPage();
  if (!can.manage) redirect(BASE);
  const sp = await searchParams;
  if (!isId(sp.file)) redirect(`${BASE}/import`);
  const kindKey = sp.kind === UDISE_IMPORT ? UDISE_IMPORT : STUDENT_IMPORT;
  const sectionId = isId(sp.section) ? sp.section! : null;
  const kind = studentImport(kindKey, { sectionId, applyFeePlan: sp.fee === "1" });

  const result = await withSchool(current.ctx, async (tx) => {
    try {
      const sheet = await loadSheet(tx, sp.file!);
      const match = matchFrom(sp, autoMatch(kind.columns, sheet.headers), kind.columns.map((c) => c.key), sheet.headers.length);
      const preview = await previewImport(tx, current.ctx, kind, sheet.rows, match);
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
        <PageHeader title="Check the import" href={`${BASE}/import/match`} userId={current.user.id} />
        <Alert tone="danger" action={<Link className="font-medium underline" href={`${BASE}/import`}>Upload again</Link>}>{result.message}</Alert>
      </>
    );
  }
  const { sheet, match, preview } = result;
  const missingRequired = kind.columns.filter((c) => c.required && match[c.key] === undefined);
  const keep = ["file", "kind", "section", "fee"].filter((k) => sp[k]);

  return (
    <>
      <PageHeader title="Check the import" href={`${BASE}/import/match`} userId={current.user.id} />
      <ol className="mb-5 flex flex-wrap gap-2 text-sm" aria-label="Steps">
        {["Template", "Upload", "Match columns", "Check", "Import"].map((s, i) => (
          <li key={s} className={`rounded-full px-3 py-1 ${i >= 2 && i < 4 ? "bg-brand-soft font-semibold text-brand-text" : "bg-surface-2 text-ink-2"}`}>{i + 1}. {s}</li>
        ))}
      </ol>
      <div className="grid gap-4 xl:grid-cols-[26rem_1fr]">
        <Card className="self-start">
          <CardHeader title="3. Match columns" description={`${sheet.file.fileName} · ${sheet.rows.length} rows. We matched the headings we recognised.`} />
          <CardBody>
            <form method="get" className="space-y-3">
              {keep.map((k) => <input key={k} type="hidden" name={k} value={sp[k]} />)}
              {kind.columns.map((c) => (
                <label key={c.key} className="grid grid-cols-[1fr_12rem] items-center gap-2 text-[15px]">
                  <span>{c.label}{c.required && <span className="text-danger" aria-hidden="true"> *</span>}</span>
                  <select name={`m_${c.key}`} defaultValue={match[c.key] ?? ""} className={`h-11 rounded-lg border bg-surface px-2 ${c.required && match[c.key] === undefined ? "border-danger" : "border-line-strong"}`}>
                    <option value="">Not in the file</option>
                    {sheet.headers.map((h, i) => <option key={`${h}-${i}`} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
              <Button type="submit" variant="secondary">Check again</Button>
            </form>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="4. Check" description={`${preview.good.length} ${preview.good.length === 1 ? "row is" : "rows are"} ready · ${preview.bad.length} ${preview.bad.length === 1 ? "row has" : "rows have"} problems${result.section ? ` · rows with no class go to ${result.section.schoolClass.name} ${result.section.name}` : ""}`} />
            <CardBody className="space-y-4">
              {missingRequired.length > 0 && <Alert tone="warning">Match these required columns first: {missingRequired.map((c) => c.label).join(", ")}.</Alert>}
              {preview.good.length > 0 && (
                <div>
                  <h3 className="mb-1 font-medium">Ready to import</h3>
                  <p className="text-[15px] text-ink-2">{preview.good.slice(0, 8).map((g) => g.row.fullName).join(", ")}{preview.good.length > 8 ? ` and ${preview.good.length - 8} more` : ""}.</p>
                </div>
              )}
              {preview.bad.length > 0 && (
                <div>
                  <h3 className="mb-1 font-medium">Rows with problems (not imported)</h3>
                  <ul className="max-h-96 divide-y divide-line overflow-y-auto rounded-lg border border-line text-[15px]">
                    {preview.bad.slice(0, 200).map((b) => (
                      <li key={b.line} className="px-3 py-2"><strong>Row {b.line}</strong>{b.row.fullName ? ` · ${b.row.fullName}` : ""}: <span className="text-danger">{b.problems.join(" ")}</span></li>
                    ))}
                  </ul>
                  <p className="mt-1 text-sm text-ink-2">After the import you can download these rows with their problems, fix them and import again.</p>
                </div>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              {preview.good.length === 0 ? (
                <p className="text-ink-2">No row is ready yet. Fix the column match, or fix the file and <Link className="text-brand-text underline" href={`${BASE}/import`}>upload it again</Link>.</p>
              ) : (
                <ActionForm action={runImportAction} footer={<>
                  <SubmitButton pendingText="Importing…">{`Import ${preview.good.length} ${preview.good.length === 1 ? "student" : "students"}`}</SubmitButton>
                  <Link href={`${BASE}/import`} className="inline-flex min-h-11 items-center rounded-lg px-4 font-medium text-brand-text hover:bg-surface-2">Start again</Link>
                </>}>
                  <input type="hidden" name="file" value={sp.file} />
                  <input type="hidden" name="kind" value={kindKey} />
                  <input type="hidden" name="section" value={sectionId ?? ""} />
                  <input type="hidden" name="fee" value={sp.fee === "1" ? "1" : ""} />
                  <input type="hidden" name="match" value={JSON.stringify(match)} />
                  <p className="text-[15px]">Only the ready rows are imported{preview.bad.length ? `; the ${preview.bad.length} with problems are skipped` : ""}. You can undo the whole import later from Import history.</p>
                </ActionForm>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
