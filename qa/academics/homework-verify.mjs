// Checks the homework fixes on the dev build (QA_URL=http://localhost:3103): the student is sent to
// his own homework from the details link; giving homework says only what really happened.
import { close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";

const M = "Homework & Learning";
const hwId = "11905cb2-1364-485a-b471-19bf724a6cd8";
const st = await login("pranav");
await st.goto(`${process.env.QA_URL ?? "http://localhost:3000"}/homework-learning/homework/${hwId}`, { timeout: 300000 }).catch(() => null);
await st.waitForURL(/open=/, { timeout: 120000 }).catch(() => null);
await sleep(8000);
const body = await st.content();
res(M, "Homework details", "Student opens the homework details link (fix a82b2fe, port 3103)", "Student", "Sent to his own homework; no classmates or parents", `now at ${st.url().replace(/^https?:\/\/[^/]+/, "")}; classmates' parents shown: ${/Ravi Kumar/.test(body)}`, /open=/.test(st.url()) && !/Ravi Kumar/.test(body) ? "PASS" : "FAIL", "ACADEMICS-18");

const ct = await login("cems.classteacher");
await open(ct, "/homework-learning?do=give");
const sheet = ct.locator("dialog[open]").last();
await sheet.locator('[role="radio"]', { hasText: "5 B" }).first().click();
await sheet.locator('[name="title"]').fill("Demo: Maths Exercise 4.4 (message check)");
await sheet.locator("button", { hasText: /^Send to/ }).click();
await sleep(4000);
const m = await messages(ct);
res(M, "Homework", "Give homework: message (fix eb9a21d, port 3103)", "Class Teacher (Maths)", "No WhatsApp promise; says parents were not messaged and why", m.slice(0, 200), /Homework sent to Grade 5 B/.test(m) && !/get it on WhatsApp/.test(m) && /Parents were not messaged/.test(m) ? "PASS" : "FAIL", "ACADEMICS-16");
console.log(sql("select id, title from homework where title like 'Demo: Maths Exercise 4.4%';"));
await close();
