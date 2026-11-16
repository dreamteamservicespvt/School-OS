// Night B (2026-11-13) helper: own output folder, then the shared helpers.
import path from "node:path";
process.env.QA_OUT = path.resolve("qa-output/2026-11-13-night-B");
const h = await import("../full/selftest-A-h.mjs");
export const { asRole, go, mainText, sleep, close, snap, newPage } = h;
export const OUT = process.env.QA_OUT;
import { appendFileSync } from "node:fs";
export const log = (file) => (...a) => { const s = a.map((x) => typeof x === "string" ? x : JSON.stringify(x)).join(" "); console.log(s); appendFileSync(path.join(OUT, file + ".log"), s + "\n"); };
export const num = (s) => Number(String(s ?? "").replace(/[^\d.-]/g, "") || NaN);
export const flat = (t) => String(t ?? "").replace(/\n+/g, " | ");
