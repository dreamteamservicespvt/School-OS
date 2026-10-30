// Every role against docs/blueprint/05-roles.md (through src/lib/roles.ts, which a
// test proves matches it): the menu shows only the modules the role may use, and
// every other module address, opened directly, is refused by the server.
//   npx tsx qa/full/roles.mts [username ...]
import { MODULES, SELF_SERVICE_MODULES } from "../../src/lib/modules";
import { ALL_ROLE_TEMPLATES } from "../../src/lib/roles";
// @ts-expect-error plain JS helper
import { asUser, menu, go, pageState, saveJson, close } from "./h.mjs";

const PEOPLE: Record<string, string> = {
  principal: "principal", admin: "school-admin", accountant: "accountant", teacher: "class-teacher",
  subjectteacher: "teacher", librarian: "librarian", reception: "receptionist", transport: "transport-in-charge",
  warden: "hostel-warden", store: "store-keeper", viceprincipal: "vice-principal",
};
// Deep addresses that change data or belong to one module, tried by roles without it.
const DEEP: Record<string, string[]> = {
  "student-management": ["/student-management/new", "/student-management/import"],
  "fee-management": ["/fee-management/collect", "/fee-management/structure"],
  "settings": ["/settings/users", "/settings/school-profile"],
  "salary-management": ["/salary-management/generate"],
  "finance-management": ["/finance-management/expenses"],
  "admission-management": ["/admission-management/enquiries"],
};

const who = process.argv.slice(2);
const out: unknown[] = [];
for (const [login, roleKey] of Object.entries(PEOPLE)) {
  if (who.length && !who.includes(login)) continue;
  const role = ALL_ROLE_TEMPLATES.find((r) => r.key === roleKey)!;
  const page = await asUser(login);
  const items: { text: string; href: string }[] = await menu(page);
  const shown = new Set(items.map((i) => i.text));
  const expected = MODULES.filter((m) => role.permissions[m.key] !== "none" && !(role.permissions[m.key] === "own" && SELF_SERVICE_MODULES.has(m.key))).map((m) => m.name);
  const missing = expected.filter((n) => !shown.has(n));
  const extra = [...shown].filter((n) => MODULES.some((m) => m.name === n) && !expected.includes(n));
  const blocked: { url: string; refused: boolean; landed: string; h1: string; status?: number }[] = [];
  for (const m of MODULES) {
    const level = role.permissions[m.key];
    const urls = level === "none" ? [`/${m.key}`, ...(DEEP[m.key] ?? [])] : level === "view" || level === "own" ? (DEEP[m.key] ?? []).filter((u) => /new|import|collect|generate|users|school-profile|structure|expenses/.test(u)) : [];
    for (const url of urls) {
      if (SELF_SERVICE_MODULES.has(m.key) && level !== "none") continue;
      const res = await go(page, url);
      const st = await pageState(page);
      const ok = st.refused || st.path !== url || (res?.status() ?? 200) >= 400;
      blocked.push({ url, refused: ok, landed: st.path, h1: st.h1, status: res?.status() });
    }
  }
  const leaks = blocked.filter((b) => !b.refused);
  const row = { login, role: role.name, menu: [...shown], missing, extra, blockedTried: blocked.length, leaks };
  out.push({ ...row, blocked });
  console.log(JSON.stringify(row));
  await page.context().close();
}
saveJson(`roles-${who.join("_") || "all"}.json`, out);
await close();
