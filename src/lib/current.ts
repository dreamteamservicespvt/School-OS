// Who is signed in, for pages and server actions. Every school page and
// action starts here, so permissions are always checked on the server.
import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { findSession } from "./auth/sessions";
import { accessIn, schoolsFor } from "./auth/access";
import { menuModules, requirePermission, type Action } from "./permissions";
import type { ModuleKey } from "./modules";

export const SESSION_COOKIE = "sos_session";

export async function deviceInfo() {
  const h = await headers();
  return {
    userAgent: h.get("user-agent"),
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
  };
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** The person's appearance follows them to a new device at sign-in. */
export async function setAppearanceCookies(theme: string, accent: string) {
  const jar = await cookies();
  const opts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
  jar.set("sos_theme", theme, opts);
  jar.set("sos_accent", accent, opts);
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in person in their current school, or null. Cached for one request. */
export const getCurrent = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await findSession(token);
  if (!session) return null;

  const schools = await schoolsFor(session.userLoginId);
  const schoolId = schools.some((s) => s.id === session.schoolId) ? session.schoolId! : schools[0]?.id;
  if (!schoolId) return null;
  const access = await accessIn(session.userLoginId, schoolId);
  if (!access) return null;

  return {
    session,
    user: session.userLogin,
    schools,
    ...access,
    ctx: { schoolId, userId: session.userLoginId },
    menu: menuModules(access.permissions, access.modulesOn),
  };
});

export type Current = NonNullable<Awaited<ReturnType<typeof getCurrent>>>;

/** For pages: the signed-in person, or a trip to the sign-in page. */
export async function requireCurrent(): Promise<Current> {
  const current = await getCurrent();
  if (!current) redirect("/sign-in");
  return current;
}

/** For server actions that change something: checks the role on the server first. */
export async function requireAction(module: ModuleKey, action: Action) {
  const current = await requireCurrent();
  const reach = requirePermission(current.permissions, module, action);
  return { current, reach };
}
