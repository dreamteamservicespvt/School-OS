import { randomUUID } from "node:crypto";
import { vi } from "vitest";
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

/**
 * One-time codes are never kept in Message History (QA SEC-01). In development the server
 * writes each code it sends to its log (src/lib/dev-codes.ts): call watchLoggedCodes() once
 * in a test file, then takeLoggedCode() gives the newest code sent since the last one taken.
 */
const loggedCodes: string[] = [];
let watching = false;
export function watchLoggedCodes() {
  if (watching && vi.isMockFunction(console.info)) return;
  watching = true;
  const original = console.info.bind(console);
  vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    const m = String(args[0]).match(/^\[dev\] one-time code .*: (\d{4,8})$/);
    if (m) loggedCodes.push(m[1]);
    else original(...args);
  });
}
export function takeLoggedCode(): string {
  const code = loggedCodes.at(-1);
  if (!code) throw new Error("No one-time code was written to the log. Call watchLoggedCodes() first.");
  loggedCodes.length = 0;
  return code;
}
