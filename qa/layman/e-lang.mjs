// Layman E: switch my screen language (Telugu / Hindi) and look for English left on my screens. Puts English back.
//   node qa/layman/e-lang.mjs <role> <te|hi> <url>...
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-e";
const { asRole, go, snap, note, close, sleep, mainText } = await import("../full/selftest-A-h.mjs");
const [role, lang, ...urls] = process.argv.slice(2);
const p = await asRole(role);
const label = { te: "Telugu", hi: "Hindi", en: "English" };
async function setLang(l) {
  await go(p, "/profile"); await sleep(800);
  const r = p.getByRole("radio", { name: new RegExp(label[l]) }).first();
  if (await r.count()) await r.click(); else await p.getByText(label[l], { exact: true }).first().click();
  await sleep(2500); await p.waitForLoadState("networkidle").catch(() => {});
}
await setLang(lang);
try {
  for (const u of urls) {
    p.problems.length = 0;
    await go(p, u); await sleep(1200);
    const t = await mainText(p, 20000);
    const lines = t.split("\n").map((s) => s.trim()).filter(Boolean);
    const eng = lines.filter((s) => /[A-Za-z]{4,}/.test(s) && !/[\u0900-\u097F\u0C00-\u0C7F]/.test(s));
    const name = `lang-${role}-${lang}${u.replace(/[/?=&]/g, "-")}`;
    await snap(p, name, false);
    note(`lang-${role}-${lang}`, `\n===== ${u} (${eng.length} of ${lines.length} lines all-English)\n${eng.slice(0, 80).join("\n")}\nPROBLEMS: ${p.problems.join(" ; ")}`);
    console.log(`${u}: ${eng.length}/${lines.length} English-only lines. e.g. ${eng.slice(0, 12).join(" | ")}`);
  }
} finally {
  await setLang("en");
  await go(p, "/dashboard"); console.log("restored:", (await mainText(p, 120)).replace(/\n/g, " "));
  await close();
}
