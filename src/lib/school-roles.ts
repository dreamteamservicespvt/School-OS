// The roles of the school being worked in, and nothing else (QA PLATFORM-ROLES-01).
//
// Every role list, role picker and role check inside withSchool() reads roles
// through these, so a person who works in two schools never sees, picks or
// passes a role of their other school. The database wall hides the other
// school's roles too (migration *_own_access_only_before_school); this is the
// second lock. tests/roles-cross-school.test.ts fails when a role query in
// src/ leaves out the school.

import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";

type InSchool = { schoolId: string };

/** The school's roles matching `args` (where, select, orderBy …), always limited to this school. */
export function schoolRoles<T extends Prisma.RoleFindManyArgs>(tx: Tx, school: InSchool, args?: Prisma.SelectSubset<T, Prisma.RoleFindManyArgs>) {
  const a = (args ?? {}) as Prisma.RoleFindManyArgs;
  return tx.role.findMany<T>({ ...a, where: { ...a.where, schoolId: school.schoolId } } as Prisma.SelectSubset<T, Prisma.RoleFindManyArgs>);
}

/** One of the school's roles, or null when none of this school's roles matches. */
export function schoolRole<T extends Prisma.RoleFindFirstArgs>(tx: Tx, school: InSchool, args?: Prisma.SelectSubset<T, Prisma.RoleFindFirstArgs>) {
  const a = (args ?? {}) as Prisma.RoleFindFirstArgs;
  return tx.role.findFirst<T>({ ...a, where: { ...a.where, schoolId: school.schoolId } } as Prisma.SelectSubset<T, Prisma.RoleFindFirstArgs>);
}
