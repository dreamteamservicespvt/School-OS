// Self-test 14 Nov: the Structures list shows a saved later version under today's gross.
import { asRole, close, snap, sleep, mainText } from "./nc-h.mjs";
const a = await asRole("accountant");
await a.goto(new URL("/salary-management/structures?q=ravi", a.url()).href);
await a.waitForLoadState("networkidle").catch(() => {});
await sleep(1500);
const t = await mainText(a, 6000);
console.log((t.match(/Ravi Teja[^]*?v\d/) ?? ["(row not found)"])[0].replace(/\s+/g, " "));
await snap(a, "e2e-structures-next", false);
await a.context().close(); await close();
