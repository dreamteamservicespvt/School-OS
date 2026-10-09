import type { SchoolContext } from "../../src/lib/db";

/** What the core seed made, handed to every module's seed. */
export type SeedSchool = {
  ctx: SchoolContext;
  schoolId: string;
  campusId: string;
  code: string;
  name: string;
  /** Demo usernames to their User Login ids (principal, admin, accountant...). */
  users: Record<string, string>;
  /** The full demo (Sunrise) or a light one (Green Valley). */
  full: boolean;
  yearId: string;
  pastYearId: string;
  financialYearId: string;
  termIds: string[];
};

export type ModuleSeed = (school: SeedSchool) => Promise<void>;
