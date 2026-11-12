// Which theme the app puts on <html> for each login (dark system setting).
import { asB, go, close, sleep, PHONE } from "./selftest-B-h.mjs";
for (const login of process.argv.slice(2)) {
  const p = await asB(login, PHONE, "dark");
  await go(p, "/dashboard"); await sleep(800);
  console.log(login, await p.evaluate(() => ({ theme: document.documentElement.dataset.theme, dark: matchMedia("(prefers-color-scheme: dark)").matches, bg: getComputedStyle(document.body).backgroundColor })));
  await p.context().close();
}
await close();
