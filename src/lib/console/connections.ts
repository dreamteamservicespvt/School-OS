// A school's technical connections, set up by DREAM TEAM from the console
// (07-super-admin.md §3.8): SMS, WhatsApp and email providers, the DLT IDs,
// message credits, payment gateways and other connections. Schools never type
// provider keys or IDs; their own screens only show what is connected.
import "server-only";

import { withConsoleSchool, type SchoolContext, type Tx, type WorkOptions } from "../db";
import { logActivity } from "./activity";
import type { ConsoleCurrent } from "./current";

/** The school context for a console person: no school login, their name on every Audit Log line. */
export const connectionsCtx = (c: ConsoleCurrent, schoolId: string): SchoolContext => ({ schoolId, userId: null, console: { name: c.actor.name } });

/**
 * Runs connection work on one school's own records, and writes one line in the
 * console's Activity log in the same transaction. `text` gets the school's name.
 */
export async function withConnections<T>(
  c: ConsoleCurrent,
  schoolId: string,
  work: (tx: Tx, ctx: SchoolContext) => Promise<T>,
  activity: ((r: T) => string | null) | null,
  opts: WorkOptions = {},
): Promise<T> {
  const ctx = connectionsCtx(c, schoolId);
  return withConsoleSchool(schoolId, async (tx) => {
    const r = await work(tx, ctx);
    const text = activity?.(r);
    if (text) {
      const school = await tx.school.findUniqueOrThrow({ where: { id: schoolId }, select: { id: true, name: true } });
      await logActivity(tx, c.actor, { type: "connect", text: `${text} for ${school.name}.`, school });
    }
    return r;
  }, opts);
}
