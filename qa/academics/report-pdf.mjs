// Report card PDF for Sahithi Gorle (class teacher) and the same PDF link opened by a teacher
// who does not teach the section, plus Report Cards at 375px.
import { close, layoutIssues, shot, VIEWPORTS } from "../lib.mjs";
import { res, login, open } from "./r.mjs";
import { BASE } from "../lib.mjs";

const M = "Examination & Results", P = "Report Cards";
const ct = await login("cems.classteacher");
await open(ct, "/examination-results/report-cards");
const href = await ct.locator("tr", { hasText: "Sahithi Gorle" }).locator("a", { hasText: "View PDF" }).getAttribute("href");
console.log(href);
const r = await ct.request.get(`${BASE}${href}`, { timeout: 180000 });
const body = await r.body();
res(M, P, "View PDF of Sahithi Gorle's report card", "Class Teacher", "A PDF opens", `HTTP ${r.status()} ${r.headers()["content-type"]} ${body.length} bytes`, r.status() === 200 && /pdf/.test(r.headers()["content-type"] ?? "") && body.subarray(0, 4).toString() === "%PDF" ? "PASS" : "FAIL");
const fs = await import("node:fs");
fs.writeFileSync("/home/claude/qa-out/academics/sahithi-report-card.pdf", body);
const te = await login("cems.transport");
const r2 = await te.request.get(`${BASE}${href}`, { timeout: 180000, maxRedirects: 0 }).catch((e) => ({ status: () => 0, headers: () => ({}), text: async () => String(e) }));
res(M, P, "Transport manager opens Sahithi's report card PDF link", "Transport Manager", "Refused", `HTTP ${r2.status()} ${r2.headers()["content-type"] ?? ""} ${r2.headers().location ?? ""}`, r2.status() !== 200 || !/pdf/.test(r2.headers()["content-type"] ?? "") ? "PASS" : "FAIL");
await ct.setViewportSize(VIEWPORTS.phone375);
await open(ct, "/examination-results/report-cards");
const li = await layoutIssues(ct);
await shot(ct, "report-cards-375");
res(M, P, "Report Cards at 375px", "Class Teacher", "No sideways scroll", li.join("; ") || "no issues", li.length ? "FAIL" : "PASS");
await close();
