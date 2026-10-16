// node qa/campus/probe.mjs <login> <url> [button text to click] — prints the form that opens.
import { asUser, go, mainText, close, fields, dialogText, sleep } from "./util.mjs";
const [login, url, button] = process.argv.slice(2);
const page = await asUser(login);
await go(page, url);
if (button) {
  await page.getByRole("button", { name: button }).or(page.getByRole("link", { name: button })).first().click();
  await sleep(1200);
  console.log("DIALOG:\n" + (await dialogText(page)).slice(0, 3000));
  console.log("FIELDS:\n" + (await fields(page, "dialog[open]")).join("\n"));
} else if (await page.locator("dialog[open]").count()) {
  await sleep(500);
  console.log("DIALOG:\n" + (await dialogText(page)).slice(0, 3000));
  console.log("FIELDS:\n" + (await fields(page, "dialog[open]")).join("\n"));
} else {
  console.log(await mainText(page, 5000));
  console.log("FIELDS:\n" + (await fields(page, "main")).join("\n"));
}
console.log("URL", page.url(), "PROBLEMS", page.problems);
await close();
