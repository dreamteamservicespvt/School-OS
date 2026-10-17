// The body of a module's own import page: the five steps and the earlier
// imports of these kinds, each with its rows with problems and, while it can
// still be taken back, Undo. The page itself checks who may open it; every
// action checks again on the server.
import type { Current } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { importKind } from "@/lib/importer";
import { MODULE_IMPORTS, moduleImportHistory, moduleImportRefusal, type ModuleImportKey } from "@/lib/imports/module-import";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { checkModuleImport, runModuleImport, undoModuleImportAction, uploadModuleImport } from "@/app/(school)/_imports/actions";
import { ModuleImportSteps, UndoEarlierImport } from "./module-import-steps";

const shown = (stored: string) => stored.replace(/#[0-9a-f-]{36}$/i, "");

export async function ModuleImportPage({ current, keys, initial, base, about, doneHref, doneLabel }: {
  current: Current;
  keys: ModuleImportKey[];
  initial?: string;
  /** The page's own address; the template and error downloads sit under it. */
  base: string;
  about: Record<string, string>;
  doneHref: string;
  doneLabel: string;
}) {
  const tz = current.school.timeZone;
  const history = await withSchool(current.ctx, (tx) => moduleImportHistory(tx, keys));
  const kinds = keys.map((k) => {
    const kind = importKind(k)!;
    return {
      key: k, label: kind.label, about: about[k] ?? "", one: MODULE_IMPORTS[k].one, many: MODULE_IMPORTS[k].many, templateHref: `${base}/template?kind=${k}`,
      columns: kind.columns.map((c) => ({ key: c.key, label: c.label, required: c.required, help: c.help })),
    };
  });
  const mayUndo = (k: string) => !moduleImportRefusal(current, k, "archive");
  return (
    <>
      <ModuleImportSteps kinds={kinds} initial={initial ?? keys[0]} doneHref={doneHref} doneLabel={doneLabel} errorsBase={`${base}/errors`}
        actions={{ upload: uploadModuleImport, check: checkModuleImport, run: runModuleImport, undo: undoModuleImportAction }} />
      {history.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Earlier imports" divided />
          <ul className="divide-y divide-line/70">
            {history.map((b) => {
              const k = kinds.find((x) => x.key === b.kind);
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[14px]">
                  <span className="min-w-0 break-all">
                    <span className="font-medium">{k?.label ?? b.kind}</span> · {shown(b.fileName)}
                    <span className="block text-[13px] text-ink3">{formatDateTime(b.createdAt, tz)} · {b.added} added{b.skipped ? `, ${b.skipped} with problems` : ""}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {b.undoneAt && <Pill>Undone</Pill>}
                    {b.skipped > 0 && <a href={`${base}/errors/${b.id}?kind=${b.kind}`} className="font-semibold text-brand hover:underline" download>Rows with problems</a>}
                    {!b.undoneAt && b.added > 0 && k && mayUndo(b.kind) && <UndoEarlierImport kind={b.kind} batchId={b.id} label={k.label} added={b.added} one={k.one} many={k.many} undo={undoModuleImportAction} />}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
