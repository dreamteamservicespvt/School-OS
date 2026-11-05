// "Signed in" on the console's Schools list, school page and dashboard comes
// from the school's console card (Console School). The card is re-counted only
// now and then (measure.ts, from the background ticks), so a School Admin who
// had signed in many times could still show "Not signed in" (owner test
// 2026-11-05). A School Admin's or Principal's sign-in now marks the card at
// once. Only yes/no and the time go to the console, never anything else
// (07-super-admin.md §1).
import "server-only";

import { withConsole, withSchool } from "../db";
import { ADMIN_ROLE_KEYS } from "./measure";

/** Marks "School Admin signed in" on the console card of each school where this login is an admin. Never fails a sign-in. */
export async function noteAdminSignIn(userLoginId: string, schoolIds: string[], now = new Date()) {
  for (const schoolId of schoolIds) {
    try {
      const admin = await withSchool({ schoolId, userId: userLoginId }, (tx) =>
        tx.schoolAccess.count({ where: { schoolId, userLoginId, archivedAt: null, roles: { some: { role: { key: { in: [...ADMIN_ROLE_KEYS] } } } } } }),
      );
      if (!admin) continue;
      await withConsole(async (tx) => {
        const card = await tx.consoleSchool.findUnique({ where: { id: schoolId }, select: { firstAdminSignInAt: true } });
        if (!card) return;
        await tx.consoleSchool.update({ where: { id: schoolId }, data: { adminSignedIn: true, firstAdminSignInAt: card.firstAdminSignInAt ?? now, lastActivityAt: now } });
      });
    } catch (e) {
      console.error(JSON.stringify({ level: "error", event: "console-admin-sign-in-note-failed", school: schoolId, error: e instanceof Error ? e.message : String(e) }));
    }
  }
}
