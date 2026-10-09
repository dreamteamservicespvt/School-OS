// Turns a person's roles into what they may see and do in each module
// (00-global.md §5, 05-roles.md). Every server action checks these; hiding a
// button is never the only check.

import { MODULES, MODULE_KEYS, type ModuleKey } from "./modules";
import type { AccessLevel, RolePermissions } from "./roles";

/** "all" = every record the scope allows, "own" = only their own classes or records. */
export type Reach = "all" | "own" | "none";

export type ModuleAccess = {
  /** Which records they can see. */
  see: Reach;
  /** Which records they can add, change, archive, approve. */
  change: Reach;
};

export type Action = "view" | "create" | "edit" | "archive" | "approve" | "export" | "print";

const LEVEL_ACCESS: Record<AccessLevel, ModuleAccess> = {
  full: { see: "all", change: "all" },
  view: { see: "all", change: "none" },
  own: { see: "own", change: "own" },
  none: { see: "none", change: "none" },
};

const REACH_ORDER: Record<Reach, number> = { none: 0, own: 1, all: 2 };
const wider = (a: Reach, b: Reach): Reach => (REACH_ORDER[a] >= REACH_ORDER[b] ? a : b);

export type PermissionMap = Record<ModuleKey, ModuleAccess>;

/** A person can have more than one role; each module gets the widest reach any role gives. */
export function combineRoles(roles: readonly RolePermissions[]): PermissionMap {
  return Object.fromEntries(
    MODULE_KEYS.map((key) => {
      let access: ModuleAccess = LEVEL_ACCESS.none;
      for (const role of roles) {
        const level = LEVEL_ACCESS[role[key] ?? "none"] ?? LEVEL_ACCESS.none;
        access = { see: wider(access.see, level.see), change: wider(access.change, level.change) };
      }
      return [key, access];
    }),
  ) as PermissionMap;
}

/**
 * Exceptions for one person (Settings, Users & Permissions): a module set to
 * a level here replaces what their roles give, wider or narrower.
 */
export function applyExceptions(map: PermissionMap, exceptions: Record<string, AccessLevel>[]): PermissionMap {
  const out = { ...map };
  for (const ex of exceptions) {
    for (const [key, level] of Object.entries(ex ?? {})) {
      if (key in out && level in LEVEL_ACCESS) out[key as ModuleKey] = LEVEL_ACCESS[level as AccessLevel];
    }
  }
  return out;
}

/** Reading actions need "see"; everything else needs "change". */
const READ_ACTIONS: ReadonlySet<Action> = new Set(["view", "export", "print"]);

/**
 * May this person take this action in this module? Returns how far it reaches:
 * "all", "own" (only their own classes or records) or "none".
 * View lets a person export and print what they can see (inferred).
 */
export function reachFor(permissions: PermissionMap, module: ModuleKey, action: Action): Reach {
  const access = permissions[module];
  if (!access) return "none";
  return READ_ACTIONS.has(action) ? access.see : access.change;
}

export function can(permissions: PermissionMap, module: ModuleKey, action: Action): boolean {
  return reachFor(permissions, module, action) !== "none";
}

/** The menu shows only modules the person may open and the school has switched on (P19). */
export function menuModules(permissions: PermissionMap, modulesOn: ReadonlySet<ModuleKey>) {
  return MODULES.filter((m) => permissions[m.key].see !== "none" && (!m.optional || modulesOn.has(m.key)));
}

export class PermissionDeniedError extends Error {
  constructor(module: ModuleKey) {
    const name = MODULES.find((m) => m.key === module)?.name ?? module;
    super(`Your role does not allow this in ${name}. Ask your School Admin if you need it (Settings, Users & Permissions).`);
    this.name = "PermissionDeniedError";
  }
}

export function requirePermission(permissions: PermissionMap, module: ModuleKey, action: Action): Reach {
  const reach = reachFor(permissions, module, action);
  if (reach === "none") throw new PermissionDeniedError(module);
  return reach;
}

/**
 * Scope "own records only" (Settings, Users & Permissions): whatever the
 * roles give for the whole school is narrowed to the person's own classes
 * and records. Exceptions are applied after this, so they can still widen one module.
 */
export function narrowToOwn(map: PermissionMap): PermissionMap {
  const own = (r: Reach): Reach => (r === "all" ? "own" : r);
  return Object.fromEntries(Object.entries(map).map(([k, a]) => [k, { see: own(a.see), change: own(a.change) }])) as PermissionMap;
}
