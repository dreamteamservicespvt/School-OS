// Calls a Next.js server action directly over HTTP, the way the browser does,
// with a signed-in person's cookies. Used to prove the server refuses actions
// a role must not take, whatever the screen shows.
//
// Action ids come from the build's server-reference-manifest (QA_NEXT_DIR, default
// the running app's .next). Arguments: plain JSON values, or { __form: {k: v|[v]} }
// for a FormData argument (React's encodeReply multipart format: "_<ref>_<key>"
// fields, then the root "0").
import { readFileSync } from "node:fs";
import { BASE } from "../lib.mjs";

const NEXT_DIR = process.env.QA_NEXT_DIR ?? "/home/claude/school-os/.next";
let manifest;
export function actionId(file, name) {
  manifest ??= JSON.parse(readFileSync(`${NEXT_DIR}/server/server-reference-manifest.json`, "utf8")).node;
  const hit = Object.entries(manifest).find(([, v]) => v.filename === file && v.exportedName === name);
  if (!hit) throw new Error(`No server action ${file} :: ${name}`);
  const page = Object.keys(hit[1].workers)[0].replace(/^app/, "").replace(/\/page$/, "").replace(/\/\([^)]+\)/g, "") || "/";
  return { id: hit[0], page: page.includes("[") ? "/dashboard" : page };
}

/**
 * Returns { status, text, redirect } of the RSC reply. `ctx` is a Playwright
 * BrowserContext or APIRequestContext of a signed-in page (its cookies are used).
 */
export async function callAction(ctx, file, name, args = []) {
  const { id, page } = actionId(file, name);
  const context = ctx.cookies ? ctx : ctx._qaContext ?? null;
  const cookies = context ? (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") : "";
  const headers = { "Next-Action": id, Accept: "text/x-component", Origin: BASE, Cookie: cookies, "x-forwarded-for": "10.77.0.1" };
  let body;
  if (args.some((a) => a && typeof a === "object" && a.__form)) {
    body = new FormData();
    let part = 1;
    const root = args.map((a) => {
      if (!(a && typeof a === "object" && a.__form)) return a === undefined ? "$undefined" : a;
      const ref = (part++).toString(16);
      for (const [k, v] of Object.entries(a.__form)) for (const one of Array.isArray(v) ? v : [v]) body.append(`_${ref}_${k}`, String(one));
      return `$K${ref}`;
    });
    body.append("0", JSON.stringify(root));
  } else {
    headers["Content-Type"] = "text/plain;charset=UTF-8";
    body = JSON.stringify(args.map((a) => (a === undefined ? "$undefined" : a)));
  }
  const res = await fetch(BASE + page, { method: "POST", headers, body, redirect: "manual" });
  const text = await res.text();
  return { status: res.status, text, redirect: res.headers.get("x-action-redirect") ?? res.headers.get("location") ?? "" };
}

/** The readable words of an RSC reply (drops the framework lines). */
export function words(text) {
  return text.split("\n").filter((l) => /^\d+:/.test(l)).map((l) => l.replace(/^\d+:/, "")).join(" ").slice(0, 400);
}
