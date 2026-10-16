// node qa/campus/add.mjs rows.json — appends hand-checked result rows (database checks, notes) to the results file.
import { readFileSync } from "node:fs";
import { result } from "./util.mjs";
for (const r of JSON.parse(readFileSync(process.argv[2], "utf8"))) result(r);
