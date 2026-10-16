// Server actions replayed as another role: the form is submitted (empty or filled) by a role that may
// use it, the request is caught before it reaches the server, and then sent as a role that may not.
import { asUser, go, close, sleep } from "./util.mjs";

/** Submits a form on `url` as the page's user and returns the server-action request without sending it. */
export async function capture(page, url, { submit = null, fill = null } = {}) {
  let caught = null;
  await page.route("**/*", async (route) => {
    const r = route.request();
    if (!caught && r.method() === "POST" && r.headers()["next-action"]) {
      caught = { url: r.url(), headers: { "next-action": r.headers()["next-action"], "next-router-state-tree": r.headers()["next-router-state-tree"] ?? "", "content-type": r.headers()["content-type"], accept: "text/x-component" }, body: r.postDataBuffer() };
      return route.abort();
    }
    return route.continue();
  });
  await go(page, url);
  if (await page.locator("dialog[open]").count() === 0) await sleep(1500);
  if (fill) await fill(page);
  if (!(await page.locator("dialog[open]").count()) && !submit) throw new Error(`no sheet opened at ${url}`);
  const root = (await page.locator("dialog[open]").count()) ? page.locator("dialog[open]").last() : page.locator("main");
  const btn = submit ? root.getByRole("button", { name: submit }) : root.locator("button[type=submit]");
  await btn.last().click({ force: true });
  for (let i = 0; i < 20 && !caught; i++) await sleep(250);
  await page.unroute("**/*");
  return caught;
}

/** Sends a caught server action as the user signed in on `page`; returns the plain words in the answer. */
export async function replay(page, cap) {
  const res = await page.request.post(cap.url, { headers: cap.headers, data: cap.body, maxRedirects: 0, timeout: 30_000 });
  const text = await res.text();
  const msg = [...text.matchAll(/"message":"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join(" | ");
  return { status: res.status(), msg: msg || text.slice(0, 300).replace(/\s+/g, " "), raw: text };
}

export { asUser, close };
