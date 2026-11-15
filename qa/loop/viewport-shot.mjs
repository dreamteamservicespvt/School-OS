// One screenshot of exactly what fits on screen (no full-page stitching), e.g. to see a side menu at 1440x900.
//   MSYS_NO_PATHCONV=1 node qa/loop/viewport-shot.mjs <role> <path> <width> <height> <out.png> [dark]
import path from "node:path";
import { newPage, sleep, close } from "../full/h.mjs";
import { OUTA } from "../layman/nc-h.mjs";
const [role, at, w, h, out, dark] = process.argv.slice(2);
const p = await newPage({ width: Number(w), height: Number(h) }, { storageState: path.join(OUTA, `state-${role}.json`) });
if (dark) await p.context().addCookies([{ name: "sos_theme", value: "dark", url: "http://localhost:3000" }]);
await p.goto(new URL(at, "http://localhost:3000").href, { timeout: 90000 });
await p.waitForLoadState("networkidle").catch(() => {}); await sleep(800);
await p.screenshot({ path: path.resolve(out) });
console.log("saved", out);
await close();
