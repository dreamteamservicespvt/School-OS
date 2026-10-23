// node add-finding.mjs '<json>'  — adds or replaces one finding in findings.json
import { finding } from "./h.mjs";
finding(JSON.parse(process.argv[2]));
