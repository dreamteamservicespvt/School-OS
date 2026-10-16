// Form helpers shared by the campus scripts.
import { sleep } from "./util.mjs";

/** The open sheet (dialog), or the page main area. */
export function sheet(page) {
  return page.locator("dialog[open]").last();
}

/** Clicks the submit button with that name in the sheet and returns what the screen says after. */
export async function submit(page, name, { scope, wait = 2500 } = {}) {
  const root = scope ?? ((await page.locator("dialog[open]").count()) ? sheet(page) : page.locator("main"));
  await root.getByRole("button", typeof name === "string" ? { name, exact: true } : { name }).last().click();
  await sleep(wait);
  return said(page);
}

/** Error texts next to fields, error summaries, toasts. */
export async function said(page) {
  return page.evaluate(() => {
    const bits = [];
    document.querySelectorAll("[role=alert], [role=status], [aria-live], [id$='-error'], .text-danger, [data-error]").forEach((e) => { const t = e.innerText?.trim(); if (t) bits.push(t); });
    return [...new Set(bits)].join(" | ").replace(/\s+/g, " ").slice(0, 600);
  });
}

/** Fill by label inside the sheet. */
export async function fillL(page, label, value, exact = false) {
  const root = (await page.locator("dialog[open]").count()) ? sheet(page) : page.locator("main");
  const el = root.getByLabel(label, { exact }).first();
  const tag = await el.evaluate((e) => e.tagName);
  if (tag === "SELECT") {
    if (typeof value === "object") await el.selectOption(value);
    else {
      const opts = await el.evaluate((e) => [...e.options].map((o) => ({ v: o.value, t: o.text })));
      const m = opts.find((o) => o.t === value) ?? opts.find((o) => o.t.includes(value));
      if (!m) throw new Error(`No option "${value}" in ${label}: ${opts.map((o) => o.t).join(", ")}`);
      await el.selectOption(m.v);
    }
  } else await el.fill(String(value));
}

export async function clickB(page, name, exact = true) {
  const root = (await page.locator("dialog[open]").count()) ? sheet(page) : page.locator("main");
  const b = root.getByRole("button", { name, exact }).or(root.getByRole("radio", { name, exact })).or(root.locator("button", { hasText: new RegExp(`^\\s*${name}\\s*$`) }));
  await b.first().click();
  await sleep(300);
}

/** Goes to a URL that opens a sheet and waits until it is open. */
export async function openSheet(page, go, url) {
  await go(page, url);
  await page.waitForSelector("dialog[open]", { timeout: 15000 });
  await sleep(300);
}
