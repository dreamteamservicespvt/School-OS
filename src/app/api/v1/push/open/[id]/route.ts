// Tapping a push alert (00-global.md §4 rule 8): marks the notification read
// and opens the same screen as the in-app notification. Signed out: sign in
// first. A notification from another school (or someone else's) is never
// opened or changed; the person lands on their notifications instead.
import { redirect } from "next/navigation";
import { getCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { safeLink } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = await getCurrent();
  if (!current) redirect("/sign-in");
  const note = /^[0-9a-f-]{36}$/i.test(id)
    ? await withSchool(current.ctx, async (tx) => {
        const n = await tx.notification.findFirst({ where: { id, userLoginId: current.user.id } });
        if (n && !n.readAt) await tx.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
        return n;
      })
    : null;
  redirect(note ? safeLink(note.link) : "/notifications");
}
