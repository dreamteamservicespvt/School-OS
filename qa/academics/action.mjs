// Calls a server action directly, the way a person with a crafted request could,
// to prove the server refuses what the screen hides. Uses the build's
// server-reference manifest to find the action id by file and export name.
//
//   const r = await callAction(page, "src/app/(school)/x/actions.ts", "doThing", [arg1, arg2]);
//   const r = await callFormAction(page, "...", "saveThing", { field: "value" });
import { readFileSync } from "node:fs";
import { BASE } from "../lib.mjs";

const MANIFEST = process.env.QA_MANIFEST ?? "/home/claude/school-os/.next/server/server-reference-manifest.json";
let ids;
function actionId(file, name) {
  if (!ids) {
    const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
    ids = Object.entries(m.node).map(([id, e]) => ({ id, file: e.filename, name: e.exportedName }));
    // A dev (webpack) manifest has no filename: the action list is in each worker's module id.
    {

      for (const e of Object.values(m.node)) {
        for (const w of Object.values(e.workers ?? {})) {
          const q = decodeURIComponent(String(w.moduleId ?? "")).match(/actions=(\[.*?\]\])(&|$)/);
          if (!q) continue;
          try {
            for (const [file, list] of JSON.parse(q[1])) for (const a of list) ids.push({ id: a.id, file, name: a.exportedName ?? a.name });
          } catch { /* not this one */ }
        }
      }
    }
  }
  const hit = ids.find((a) => a.file.endsWith(file) && a.name === name);
  if (!hit) throw new Error(`action not found: ${file} ${name}`);
  return hit.id;
}

async function post(page, id, body, contentType, path = "/dashboard") {
  const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const headers = { "Next-Action": id, Accept: "text/x-component", Cookie: cookies, Origin: BASE };
  if (contentType) headers["Content-Type"] = contentType;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers, body, redirect: "manual" });
  const text = await r.text();
  return { status: r.status, text: text.slice(0, 2000), redirect: r.headers.get("x-action-redirect") };
}

/** Plain arguments (strings, arrays, objects). */
export async function callAction(page, file, name, args, path) {
  return post(page, actionId(file, name), JSON.stringify(args), "text/plain;charset=UTF-8", path);
}

/** (prevState, formData) actions used with useActionState. */
export async function callFormAction(page, file, name, fields, path) {
  const fd = new FormData();
  // React reads the form fields in order before the root, so the root goes last.
  for (const [k, v] of Object.entries(fields)) {
    for (const one of Array.isArray(v) ? v : [v]) fd.append(`_1_${k}`, String(one));
  }
  fd.append("0", JSON.stringify([{ ok: false }, "$K1"]));
  return post(page, actionId(file, name), fd, undefined, path);
}
