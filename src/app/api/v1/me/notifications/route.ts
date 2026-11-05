// The bell's check for something new (src/components/shell/bell-watch.tsx):
// how many notifications wait, a stamp that changes when one arrives or is
// merged into another, and whether the person wants the sound. Never the
// notifications themselves; the page shows those after a refresh.
// It does not count as the person being here: the session's last-used time is
// not moved, so the school's "signed out when away" rule still works while a
// tab sits open (src/lib/auth/sessions.ts).
import { cookies } from "next/headers";
import { findSession } from "@/lib/auth/sessions";
import { accessIn } from "@/lib/auth/access";
import { SESSION_COOKIE } from "@/lib/current";
import { SUPPORT_COOKIE } from "@/lib/support-paths";
import { withSchool } from "@/lib/db";
import { UNREAD } from "@/lib/notifications";
import { soundOn } from "@/lib/notification-kinds";
import { hitLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  const jar = await cookies();
  // A DREAM TEAM support person has no notifications of their own here.
  if (jar.get(SUPPORT_COOKIE)?.value) return reply({ unread: 0, stamp: "", sound: false });
  const session = await findSession(jar.get(SESSION_COOKIE)?.value, new Date(), { touch: false });
  if (!session?.schoolId) return reply({ problem: "Sign in first." }, 401);
  if (!(await hitLimit(`bell:${session.userLoginId}`, 30, 60)).ok) return reply({ problem: "Too many checks. Wait a moment." }, 429);
  const access = await accessIn(session.userLoginId, session.schoolId);
  if (!access) return reply({ problem: "Sign in first." }, 401);
  const ctx = { schoolId: session.schoolId, userId: session.userLoginId };
  const { unread, total, newest } = await withSchool(ctx, async (tx) => {
    const where = { userLoginId: session.userLoginId, ...UNREAD };
    const [unread, sum, newest] = await Promise.all([
      tx.notification.count({ where }),
      tx.notification.aggregate({ where, _sum: { count: true } }),
      tx.notification.findFirst({ where, orderBy: { createdAt: "desc" }, select: { id: true } }),
    ]);
    return { unread, total: sum._sum.count ?? 0, newest: newest?.id ?? "" };
  });
  return reply({ unread, stamp: `${total}:${newest}`, sound: soundOn(session.userLogin.notificationPrefs) });
}
