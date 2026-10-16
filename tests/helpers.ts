import { randomUUID } from "node:crypto";
import { prisma, withSchool } from "@/lib/db";
import { createSchool } from "@/lib/schools";
import { hashPassword } from "@/lib/auth/password";

export const PASSWORD = "Correct-horse-42";

export async function makeSchool(name = "Test School") {
  const code = `T${randomUUID().slice(0, 8)}`;
  const { school, campus } = await createSchool({ code, name });
  return { ...school, campus };
}

export async function makeUser(opts: { schools: { id: string; roleKeys: string[] }[]; status?: "ACTIVE" | "INVITED" | "DISABLED"; name?: string }) {
  const username = `user-${randomUUID().slice(0, 8)}`;
  const user = await prisma.userLogin.create({
    data: {
      username,
      displayName: opts.name ?? "Test Person",
      status: opts.status ?? "ACTIVE",
      passwordHash: opts.status === "INVITED" ? null : await hashPassword(PASSWORD),
    },
  });
  for (const s of opts.schools) {
    await withSchool({ schoolId: s.id, userId: null }, async (tx) => {
      const roles = await tx.role.findMany({ where: { schoolId: s.id, key: { in: s.roleKeys } } });
      await tx.schoolAccess.create({
        data: {
          schoolId: s.id,
          userLoginId: user.id,
          roles: { create: roles.map((r) => ({ roleId: r.id, schoolId: s.id })) },
        },
      });
    });
  }
  return user;
}

export const noSleep = async () => {};
