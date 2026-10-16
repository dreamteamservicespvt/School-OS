// node qa/people/rec.mjs '<json row>' ... — records results checked by hand in the browser or database.
import { res } from "./res.mjs";
for (const a of process.argv.slice(2)) res(JSON.parse(a));
