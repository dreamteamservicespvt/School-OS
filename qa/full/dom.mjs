// Prints the outer HTML around the first element matching a text, to write selectors.
//   MSYS_NO_PATHCONV=1 node qa/full/dom.mjs <login> <path> "<text>" [levelsUp=2]
import { as } from "./look.mjs";
import { go, close } from "./h.mjs";
const [login, url, text, up] = process.argv.slice(2);
const p = await as(login);
await go(p, url);
console.log(await p.evaluate(([t, n]) => { const w = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT); let x; while ((x = w.nextNode())) if (x.textContent.includes(t)) { let e = x.parentElement; for (let i = 0; i < n; i++) e = e.parentElement; return e.outerHTML.replace(/ class="[^"]*"/g, "").slice(0, 2500); } return "not found"; }, [text, Number(up ?? 2)]));
await close();
