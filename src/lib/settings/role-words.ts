// Plain words about roles and permission levels. No database: used by the
// server and by the permission grid in the browser.
import { MODULES, MODULE_KEYS } from "../modules";
import type { AccessLevel, RolePermissions } from "../roles";

export const LEVELS: { value: AccessLevel; label: string; words: string }[] = [
  { value: "full", label: "Full", words: "can see and change everything" },
  { value: "view", label: "View", words: "can see but not change" },
  { value: "own", label: "Own", words: "only their own classes or records" },
  { value: "none", label: "None", words: "no access" },
];

/** Cleans a submitted permission grid: every module gets a known level. */
export function cleanPermissions(input: Record<string, unknown>): RolePermissions {
  return Object.fromEntries(
    MODULE_KEYS.map((k) => {
      const v = input[k];
      return [k, v === "full" || v === "view" || v === "own" ? v : "none"];
    }),
  ) as RolePermissions;
}

const moduleName = (k: string) => MODULES.find((m) => m.key === k)?.name ?? k;

/**
 * The changes in plain words, for the confirmation and the alert:
 * "Teacher role can now see Salary Management".
 */
export function permissionChanges(roleName: string, before: Partial<RolePermissions>, after: Partial<RolePermissions>): string[] {
  const out: string[] = [];
  for (const k of MODULE_KEYS) {
    const a = before[k] ?? "none";
    const b = after[k] ?? "none";
    if (a === b) continue;
    const name = moduleName(k);
    if (b === "none") out.push(`${roleName} role can no longer open ${name}`);
    else if (a === "none") out.push(`${roleName} role can now ${b === "full" ? "see and change everything in" : b === "view" ? "see" : "see their own records in"} ${name}`);
    else if (b === "full") out.push(`${roleName} role can now change everything in ${name}`);
    else if (b === "view") out.push(`${roleName} role can now only see ${name}, not change it`);
    else out.push(`${roleName} role now sees only their own records in ${name}`);
  }
  return out;
}
