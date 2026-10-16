import { getCurrent } from "@/lib/current";

export const dynamic = "force-dynamic";

/** The signed-in person, their school, roles and what each module allows them. */
export async function GET() {
  const current = await getCurrent();
  if (!current) return Response.json({ problem: "Sign in first." }, { status: 401 });
  return Response.json({
    api: 1,
    user: { id: current.user.id, name: current.user.displayName, username: current.user.username },
    school: current.school,
    schools: current.schools,
    roles: current.roles,
    permissions: current.permissions,
    menu: current.menu.map((m) => m.key),
  });
}
