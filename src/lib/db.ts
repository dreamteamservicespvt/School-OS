// Database access. The app connects as school_os_app, which row-level
// security keeps inside one school at a time (08-platform-security.md §1).
//
// - withSchool(): every read or write of a school's records goes through this.
//   It tells the database which school and person the work is for, inside one
//   transaction. Rows of any other school are invisible and cannot be written.
// - withUser(): before a school is chosen (at sign-in), to list the person's
//   own School Access rows and schools.
// - prisma: only for records that belong to no school (User Login, Session).
//   Querying school records with it returns nothing, by design.

import { PrismaClient, type Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;

export type SchoolContext = {
  schoolId: string;
  /** The User Login doing the work, or null for the software's own jobs. */
  userId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkId(id: string | null, what: string): string {
  if (id === null) return "";
  if (!UUID.test(id)) throw new Error(`${what} is not a valid id`);
  return id;
}

export type WorkOptions = {
  /** Milliseconds before the work is given up and rolled back (default 15 s). Long jobs pass more. */
  timeout?: number;
};

export async function withSchool<T>(ctx: SchoolContext, work: (tx: Tx) => Promise<T>, opts: WorkOptions = {}): Promise<T> {
  const schoolId = checkId(ctx.schoolId, "School");
  const userId = checkId(ctx.userId, "User");
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.school_id', ${schoolId}, true), set_config('app.user_id', ${userId}, true)`;
      return work(tx);
    },
    { timeout: opts.timeout ?? 15_000, maxWait: 10_000 },
  );
}

export async function withUser<T>(userId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  const id = checkId(userId, "User");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.school_id', '', true), set_config('app.user_id', ${id}, true)`;
    return work(tx);
  });
}

// ---------------------------------------------------------------------------
// Super Admin console (07-super-admin.md §8). The console's own records are
// visible only while app.console is on. No school is chosen, so every school
// record is invisible: the console never reads students, fees or staff.
// ---------------------------------------------------------------------------

/** The console's own records, with every school's records hidden. */
export async function withConsole<T>(work: (tx: Tx) => Promise<T>, opts: WorkOptions = {}): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.console', 'on', true), set_config('app.school_id', '', true), set_config('app.user_id', '', true)`;
      return work(tx);
    },
    { timeout: opts.timeout ?? 15_000, maxWait: 10_000 },
  );
}

/**
 * A console action on one school's own records: creating it, its School Admin
 * logins and School Access, its status and details. Only that school's rows are
 * visible. Callers touch only the records 07-super-admin.md lets the console
 * change, never students, fees or staff.
 */
export async function withConsoleSchool<T>(schoolId: string, work: (tx: Tx) => Promise<T>, opts: WorkOptions = {}): Promise<T> {
  const id = checkId(schoolId, "School");
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.console', 'on', true), set_config('app.school_id', ${id}, true), set_config('app.user_id', '', true)`;
      return work(tx);
    },
    { timeout: opts.timeout ?? 15_000, maxWait: 10_000 },
  );
}
