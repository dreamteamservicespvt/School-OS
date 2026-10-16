// node qa/platform/try-action.mjs <login> <file> <export> '<json args>' [times]
import { close } from "../lib.mjs";
import { as } from "./util.mjs";
import { callAction, words } from "./action-call.mjs";
const [login, file, name, json = "[]", times = "1"] = process.argv.slice(2);
const page = await as(login);
for (let i = 0; i < Number(times); i++) {
  const r = await callAction(page.context(), file, name, JSON.parse(json));
  console.log(r.status, r.redirect, (words(r.text) || r.text).slice(0, 300));
}
await close();
