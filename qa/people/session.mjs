// Signed-in pages that reuse a saved session per login (fewer sign-ins, so no rate limits).
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { launch, signIn, BASE, VIEWPORTS, OUT } from "../lib.mjs";

const DIR = path.join(OUT, "state");
mkdirSync(DIR, { recursive: true });

export async function as(login, viewport = VIEWPORTS.laptop1280) {
  const b = await launch();
  const file = path.join(DIR, `${login}-${new URL(BASE).port}.json`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const context = await b.newContext({ viewport, ...(existsSync(file) && attempt === 0 ? { storageState: file } : {}) });
    const page = await context.newPage();
    page.problems = [];
    page.on("pageerror", (e) => page.problems.push(`pageerror: ${e.message.split("\n")[0]}`));
    page.on("response", (r) => { if (r.status() >= 500) page.problems.push(`HTTP ${r.status()} ${r.url().replace(BASE, "")}`); });
    if (attempt > 0 || !existsSync(file)) await signIn(page, login).catch(() => {});
    await page.goto(`${BASE}/dashboard`).catch(() => {});
    if (!page.url().includes("sign-in")) {
      await context.storageState({ path: file });
      return page;
    }
    await context.close();
  }
  throw new Error(`Could not sign in as ${login}`);
}
