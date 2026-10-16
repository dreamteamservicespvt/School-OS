// npx tsx qa/platform/report-keys.ts > qa/platform/report-keys.json — every report in the catalogue.
import { CATALOGUE } from "../../src/lib/reports/catalogue";
console.log(JSON.stringify(CATALOGUE.map((e) => ({ key: e.key, name: e.name, category: e.category, own: Boolean(e.own) }))));
