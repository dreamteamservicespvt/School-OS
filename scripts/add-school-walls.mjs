// Appends row-level security to every table a migration creates with a
// school_id column, so a new table can never be left without school walls.
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
const sql = readFileSync(file, "utf8");
const tables = [];
for (const match of sql.matchAll(/CREATE TABLE "([a-z0-9_]+)" \(([\s\S]*?)\n\);/g)) {
  if (/"school_id" UUID NOT NULL/.test(match[2])) tables.push(match[1]);
}
if (tables.length === 0) process.exit(0);

let out = "\n-- Each school's data stays its own (08-platform-security.md §1).\n";
for (const t of tables) {
  out += `ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;\n`;
  out += `ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY;\n`;
  out += `CREATE POLICY "${t}_same_school" ON "${t}" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());\n`;
}
writeFileSync(file, sql + out);
console.log(`School walls added to: ${tables.join(", ")}`);
