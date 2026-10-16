// Appends one result row to qa/results/people.jsonl and prints it.
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const FILE = path.resolve("qa/results/people.jsonl");
mkdirSync(path.dirname(FILE), { recursive: true });
export function res(row) {
  const line = { module: row.module, page: row.page, action: row.action, role: row.role, expected: row.expected, actual: String(row.actual ?? "").replace(/\s+/g, " ").slice(0, 500), status: row.status, ...(row.defect ? { defect: row.defect } : {}) };
  if (!process.env.DRY) appendFileSync(FILE, JSON.stringify(line) + "\n");
  console.log(`[${line.status}] ${line.module} / ${line.action} :: ${line.actual.slice(0, 200)}`);
}
