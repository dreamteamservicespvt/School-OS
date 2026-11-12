// Layman E tour: opens screens as a role at 1440 and 390, records problems a layman would notice.
//   node qa/layman/e-tour.mjs <role> <group>
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-e";
const { asRole, go, pageState, snap, ok, finish, note, close, sleep, newPage } = await import("../full/selftest-A-h.mjs");
const { layoutIssues } = await import("../lib.mjs");
const [role, ...groups] = process.argv.slice(2);
const G = {
  lib: ["/library-management", "/library-management/books", "/library-management/books/import", "/library-management/members", "/library-management/fines", "/library-management/reports", "/library-management/settings"],
  inv: ["/inventory-management", "/inventory-management/items", "/inventory-management/items/import", "/inventory-management/assets", "/inventory-management/assets/import", "/inventory-management/purchases", "/inventory-management/rooms", "/inventory-management/report-problem", "/inventory-management/reports", "/inventory-management/settings"],
  rep: ["/reports-analytics", "/reports-analytics/analytics", "/reports-analytics/custom", "/reports-analytics/early-warnings", "/reports-analytics/government"],
  set: ["/settings", "/settings/school-profile", "/settings/modules", "/settings/users", "/settings/users/new", "/settings/users/roles", "/settings/users/roles/new", "/settings/users/sign-in-rules", "/settings/data-security", "/settings/data-security/audit-log", "/settings/data-security/login-history", "/settings/data-security/export-log", "/settings/data-security/privacy", "/settings/data-security/consent", "/settings/data-security/imports", "/settings/data-security/switching", "/settings/document-designs", "/settings/forms-approvals", "/settings/messaging", "/settings/payment-gateways"],
  shell: ["/dashboard", "/profile", "/profile/appearance", "/notifications", "/this-page-does-not-exist", "/library-management/books/zzz-not-a-book", "/approvals", "/messages"],
};
const urls = groups.flatMap((g) => G[g] ?? [g]);
const p = await asRole(role);
const phone = await newPage({ width: 390, height: 844 }, { storageState: `${process.env.QA_OUT}/state-${role}.json` });
const tag = groups.join("-").replace(/\//g, "_");
const bad = (t) => {
  const out = [];
  if (/\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/.test(t)) out.push("code word: " + (t.match(/.{0,40}(\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b).{0,30}/)?.[0] ?? ""));
  const iso = t.match(/.{0,30}\b20\d\d-\d\d-\d\d\b.{0,20}/); if (iso) out.push("ISO date: " + iso[0]);
  const us = t.match(/.{0,20}\b\d{1,2}\/\d{1,2}\/20\d\d\b.{0,20}/); if (us) out.push("slash date: " + us[0]);
  if (/Loading…|Loading\.\.\./.test(t)) out.push("still Loading");
  return out;
};
for (const url of urls) {
  p.problems.length = 0;
  const t0 = Date.now();
  const res = await go(p, url);
  const ms = Date.now() - t0;
  await sleep(1200);
  const s = await pageState(p);
  const name = `${role}${url.replace(/\//g, "-")}`;
  await snap(p, name);
  const lay = await layoutIssues(p).catch(() => []);
  phone.problems.length = 0;
  await go(phone, url); await sleep(800);
  const play = await layoutIssues(phone).catch(() => []);
  await snap(phone, `${name}-390`);
  const words = bad(s.text);
  note(`tour-${role}-${tag}`, `\n===== ${url} -> ${s.path} [${res?.status()}] ${ms}ms h1="${s.h1}" ${s.refused ? "REFUSED" : ""}\n${s.text.slice(0, 2500)}\nPROBLEMS: ${p.problems.join(" ; ")}\nLAYOUT1440: ${lay.join(" ; ")}\nLAYOUT390: ${play.join(" ; ")} ${phone.problems.join(" ; ")}\nWORDS: ${words.join(" ; ")}`);
  const fine = !s.broken && (res?.status() ?? 0) < 400 && !p.problems.length && !play.some((x) => /sideways/.test(x)) && !words.length;
  ok(url, `${role} ${url}`, fine, `${s.path} [${res?.status()}] ${ms}ms h1="${s.h1}" ${s.refused ? "REFUSED " : ""}${s.broken ? "BROKEN " : ""}${p.problems.join(" ; ")} ${play.join(" ; ")} ${words.join(" ; ")}`);
}
finish(`tour-${role}-${tag}`);
await close();
