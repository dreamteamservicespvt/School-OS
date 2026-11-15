// Downloads for every import page, checked on the server like the import
// itself: the ready Excel sheet made for this school (its classes, fee heads,
// designations... in drop-downs), the rows of a file that still have
// problems, and the rows an import left out, each to fix and bring in again.
import "server-only";

import { getCurrent, isPaused, pausedAdmin } from "../current";
import { withSchool } from "../db";
import { can } from "../permissions";
import { errorCsv, importKind } from "../importer";
import { batchCampusWhere, fileCampusWhere, kindInfo, MoveInProblem, schoolLookups, workOn } from "../move-in/service";
import { templateWorkbook } from "../move-in/template";
import { safeCell } from "../move-in/prepare";
import { ensureHrDefaults } from "../staff/settings";
import { placeRefusal } from "./place-access";
import { placeHolds, type ImportPlace } from "./places";
import "../import-registry";

/** The signed-in person, as for every other file route: in a paused school only the School Admin and the Principal (security review 2026-11-15). */
async function routeCurrent(): Promise<NonNullable<Awaited<ReturnType<typeof getCurrent>>> | Response> {
  const current = await getCurrent();
  if (!current) return new Response("Sign in first.", { status: 401 });
  if (isPaused(current) && !pausedAdmin(current)) return new Response("This school is paused. Ask your School Admin.", { status: 403 });
  return current;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

/** The ready Excel sheet for one kind brought in at this place. */
export async function placeTemplateResponse(place: ImportPlace, key: string) {
  const current = await routeCurrent();
  if (current instanceof Response) return current;
  // A kind listed for Switching to School OS, or one this module's page names (changes to students already here).
  const kind = kindInfo(key) || (place.kinds?.includes(key) ?? false) ? importKind(key) : null;
  if (!kind || !placeHolds(place, key)) return new Response("This import is not known.", { status: 404 });
  // The sheet for a kind of record is for people who may bring that kind in here, as on the Bring in buttons.
  const why = await placeRefusal(current, place, key, "create");
  if (why) return new Response(why, { status: 403 });
  const lookups = await withSchool(current.ctx, async (tx) => {
    if (key === "staff") await ensureHrDefaults(tx, current.ctx);
    return schoolLookups(tx, current.ctx);
  });
  const body = await templateWorkbook(kind, lookups, current.school.name);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${kind.key}-for-school-os.xlsx"`,
      ...NO_STORE,
    },
  });
}

/** The rows of a file being checked that still have problems, with the problem beside each (P10, step 5). */
export async function placeProblemsResponse(place: ImportPlace, id: string) {
  const current = await routeCurrent();
  if (current instanceof Response) return current;
  if (place.key === "settings" && !can(current.permissions, "settings", "view")) return new Response("Your role does not allow this. Ask your School Admin.", { status: 403 });
  try {
    const csv = await withSchool(current.ctx, async (tx) => {
      // One campus: another campus's file is not found (security review 2026-11-15).
      const f = UUID.test(id) ? await tx.moveInFile.findFirst({ where: { id, archivedAt: null, ...(await fileCampusWhere(tx, current.ctx)) }, select: { kind: true } }) : null;
      if (!f || !placeHolds(place, f.kind)) throw new MoveInProblem("This file was not found.");
      if (await placeRefusal(current, place, f.kind, "create")) throw new MoveInProblem("Your role cannot see these rows.");
      const w = await workOn(tx, current.ctx, id, { check: true });
      const header = ["Row", ...w.kind.columns.map((c) => c.label), "Problems"].map(safeCell).join(",");
      const lines = w.checked!.problems.map((p) => [String(p.line), ...w.kind.columns.map((c) => p.values[c.key] ?? ""), p.problems.join(" ")].map(safeCell).join(","));
      return { text: "﻿" + [header, ...lines].join("\r\n") + "\r\n", name: w.file.fileName.replace(/\.[^.]+$/, "") };
    }, { timeout: 120_000 });
    return new Response(csv.text, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${csv.name.replace(/[^A-Za-z0-9 _-]/g, "").slice(0, 60) || "file"}-rows-with-problems.csv"`, ...NO_STORE },
    });
  } catch (e) {
    if (e instanceof MoveInProblem) return new Response(e.message, { status: 404 });
    throw e;
  }
}

/** The rows an earlier import of a kind brought in here left out, with their problems. */
export async function placeErrorsResponse(place: ImportPlace, batchId: string) {
  const current = await routeCurrent();
  if (current instanceof Response) return current;
  if (!UUID.test(batchId)) return new Response("This import was not found.", { status: 404 });
  const batch = await withSchool(current.ctx, async (tx) => tx.importBatch.findFirst({ where: { id: batchId, ...(await batchCampusWhere(tx, current.ctx)) } }));
  if (!batch || !placeHolds(place, batch.kind)) return new Response("This import was not found.", { status: 404 });
  const why = await placeRefusal(current, place, batch.kind, "create");
  if (why) return new Response(why, { status: 403 });
  const kind = importKind(batch.kind);
  const bad = (batch.errorReport ?? []) as { line: number; row: Record<string, string>; problems: string[] }[];
  const columns = kind?.columns ?? [...new Set(bad.flatMap((b) => Object.keys(b.row)))].map((k) => ({ key: k, label: k }));
  return new Response(errorCsv({ columns }, bad), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${batch.kind}-rows-with-problems.csv"`, ...NO_STORE },
  });
}

/** The kind asked for in a download address (?kind=), or the place's first. */
export const kindParam = (req: Request, place: ImportPlace) => new URL(req.url).searchParams.get("kind") || place.kinds?.[0] || "";
