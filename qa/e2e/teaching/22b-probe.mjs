import { as, visit, VIEWPORTS } from "./h.mjs";
import { close } from "../../lib.mjs";
const p = await as(process.env.WHO ?? "admin", VIEWPORTS.laptop1280);
await visit(p, "/settings/modules", 1500);
const names = await p.getByRole("button").evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") || e.innerText || "").replace(/\s+/g, " ").trim()).filter((t) => /Off|On/.test(t)));
console.log(names);
await close();
