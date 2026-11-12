// Layman E: open library + inventory reports and a sample of others; download Excel, CSV and PDF and look inside.
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-e";
const { asRole, go, snap, note, close, sleep, mainText, pageState, BASE } = await import("../full/selftest-A-h.mjs");
const fs = await import("node:fs"); const path = await import("node:path");
const p = await asRole(process.argv[2] ?? "admin");
await go(p, "/reports-analytics"); await sleep(1000);
const links = await p.evaluate(() => [...document.querySelectorAll('main a[href*="/reports-analytics/r/"]')].map((a) => ({ href: a.getAttribute("href"), text: a.innerText.split("\n")[0].trim() })));
const uniq = [...new Map(links.map((l) => [l.href.split("?")[0], l])).values()];
console.log("reports found:", uniq.length);
const pick = uniq.filter((l) => /library|inventory|stock|book|fine|purchase|asset/i.test(l.href + l.text)).concat(uniq.filter((_, i) => i % 9 === 0));
const DL = path.join(process.env.QA_OUT, "downloads"); fs.mkdirSync(DL, { recursive: true });
const seen = new Set();
for (const l of pick) {
  if (seen.has(l.href)) continue; seen.add(l.href);
  p.problems.length = 0;
  const t0 = Date.now(); await go(p, l.href); const ms = Date.now() - t0; await sleep(800);
  const s = await pageState(p);
  const t = await mainText(p, 6000);
  const odd = [];
  if (/\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/.test(t)) odd.push("code word");
  if (/\b20\d\d-\d\d-\d\d\b/.test(t)) odd.push("ISO date " + t.match(/.{0,20}\b20\d\d-\d\d-\d\d\b/)[0]);
  const rows = (t.match(/Showing[^\n]*/) ?? [""])[0];
  let files = [];
  for (const kind of ["Excel", "CSV", "PDF"]) {
    const b = p.getByRole("button", { name: new RegExp(`^${kind}$`) }).or(p.getByRole("link", { name: new RegExp(`^${kind}$`) })).first();
    if (!(await b.count())) { files.push(`${kind}: no button`); continue; }
    try {
      const [d] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), b.click()]);
      const f = path.join(DL, `${l.href.split("/").pop().split("?")[0]}-${d.suggestedFilename()}`);
      await d.saveAs(f); files.push(`${kind}: ${path.basename(f)} ${fs.statSync(f).size}B`);
    } catch (e) { files.push(`${kind}: FAILED ${e.message.split("\n")[0].slice(0, 80)}`); await snap(p, `rep-fail-${kind}-${l.href.split("/").pop()}`, false); }
  }
  const line = `${l.text} | ${l.href} | ${ms}ms | ${s.broken ? "BROKEN " : ""}${s.refused ? "REFUSED " : ""}${odd.join(", ")} | ${rows} | ${files.join(" ; ")} | ${p.problems.join(" ; ")}`;
  console.log(line); note("rep", line + "\n" + t.slice(0, 1500) + "\n");
}
await close();
