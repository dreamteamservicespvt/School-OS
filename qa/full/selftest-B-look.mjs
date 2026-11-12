// Prints one screen (text, fields, buttons) for a login, phone size, using self-test B sessions.
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-B-look.mjs <login> <path> [maxChars] [phone|desk]
import { asB, go, mainText, close, sleep, PHONE, DESK, snap } from "./selftest-B-h.mjs";
import { controls } from "./look.mjs";
const [login, url, max, size] = process.argv.slice(2);
const p = await asB(login, size === "desk" ? DESK : PHONE);
await go(p, url); await sleep(1500);
console.log("URL", new URL(p.url()).pathname + new URL(p.url()).search);
console.log((await mainText(p, Number(max ?? 1500))).trim());
const c = await controls(p);
console.log("FIELDS\n  " + c.fields.join("\n  "));
console.log("BUTTONS", c.buttons.join(" "));
if (p.problems.length) console.log("PROBLEMS", p.problems);
await close();
