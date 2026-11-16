import { asRole, go, sleep, close, snap, one, timed, watch } from "./nc-h.mjs";
const p = watch(await asRole("teacher"));
const r = await timed(p, "/homework-learning?check=1"); await sleep(1000);
console.log(r.ms, "CHECK", one(await p.locator("main").innerText(), 3000));
await snap(p, "hw-checkwork2");
const r2 = await timed(p, "/homework-learning/submissions"); 
console.log(r2.ms, "SUBS", one(await p.locator("main").innerText(), 2000));
await close();
