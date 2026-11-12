// Prints a screen's text, form fields and buttons (to plan a layman test).
//   node qa/layman/a-look.mjs <role> <path> [chars]
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-a";
import { asRole, go, mainText, sleep, close } from "../full/selftest-A-h.mjs";
const [role, url, n] = process.argv.slice(2);
const p = await asRole(role);
await go(p, url); await sleep(1200);
console.log("URL:", p.url());
console.log((await mainText(p, Number(n ?? 2500))));
console.log("--- FIELDS");
console.log((await p.evaluate(() => [...document.querySelectorAll("main input, main select, main textarea")].filter((e) => e.type !== "hidden").map((e) => {
  const lab = (e.id && document.querySelector(`label[for="${e.id}"]`)?.innerText) || e.closest("label")?.innerText || e.getAttribute("aria-label") || e.placeholder || "";
  return `${e.tagName.toLowerCase()} name=${e.name} id=${e.id} type=${e.type} req=${e.required} label="${lab.trim().slice(0, 50).replace(/\n/g, " ")}"${e.tagName === "SELECT" ? " opts=" + [...e.options].slice(0, 6).map((o) => o.text).join("/") : ""}`;
}))).join("\n"));
console.log("--- BUTTONS/LINKS");
console.log((await p.evaluate(() => [...document.querySelectorAll("main button, main a[href]")].map((e) => `${e.tagName === "A" ? "a " + e.getAttribute("href") : "btn"} "${(e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 40).replace(/\n/g, " ")}"`))).slice(0, 80).join("\n"));
console.log("PROBLEMS", p.problems);
await close();
