// Times each Dashboard widget for one login in one school (read only).
//   npx tsx --conditions=react-server --env-file=.env qa/platform/dash-profile.ts <username> [schoolId]
import { prisma } from "../../src/lib/db";
import { accessIn, schoolsFor } from "../../src/lib/auth/access";
import { menuModules } from "../../src/lib/permissions";
import { buildHome, widgetsFor } from "../../src/lib/dashboard/compose";
import { homesFor } from "../../src/lib/dashboard/homes";
import { WIDGETS } from "../../src/lib/dashboard/registry";

const [username, schoolArg] = process.argv.slice(2);
const user = await prisma.userLogin.findFirstOrThrow({ where: { username } });
const schools = await schoolsFor(user.id);
const schoolId = schoolArg ?? schools[0].id;
const access = await accessIn(user.id, schoolId);
if (!access) throw new Error("no access");
const viewer = { session: null, user, schools, ...access, ctx: { schoolId, userId: user.id }, menu: menuModules(access.permissions, access.modulesOn) } as never;
const list = widgetsFor(viewer, homesFor(viewer));
console.log(`${username} in ${schools.find((s) => s.id === schoolId)?.name}: ${list.length} widgets`);
let s = Date.now();
await buildHome(viewer);
console.log(`whole dashboard (first): ${Date.now() - s}ms`);
s = Date.now();
await buildHome(viewer);
console.log(`whole dashboard (again): ${Date.now() - s}ms`);
const times: [string, number][] = [];
for (const w of list) {
  const t = Date.now();
  await buildHome(viewer, { widgets: WIDGETS.filter((x) => x === w) });
  times.push([w.id, Date.now() - t]);
}
const t0 = Date.now();
await buildHome(viewer, { widgets: [] });
const base = Date.now() - t0;
console.log(`frame without widgets: ${base}ms`);
for (const [id, ms] of times.sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`${String(ms - base).padStart(6)}ms  ${id}`);
await prisma.$disconnect();
