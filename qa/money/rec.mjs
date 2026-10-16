// node qa/money/rec.mjs '<json row>' ['<json row>' ...] — records results checked by hand or by SQL.
import { result } from "./m.mjs";
for (const a of process.argv.slice(2)) result(JSON.parse(a));
