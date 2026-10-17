// Who is signed in, for pages and server actions. Every school page and
// action starts here, so permissions are always checked on the server.
import "server-only";

import { cache } from "react";
import { clientIp } from "@/lib/client-ip";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { findSession } from "./auth/sessions";
import { newToken } from "./auth/tokens";
import { accessIn, schoolsFor } from "./auth/access";
import { menuModules, reachFor, requirePermission, type Action } from "./permissions";
import { MODULES, type ModuleKey } from "./modules";

export const SESSION_COOKIE = "sos_session";

export async function deviceInfo() {
  const h = await headers();
  return {
    userAgent: h.get("user-agent"),
    ipAddress: clientIp((n) => h.get(n)),
  };
}

/** The browser's own random id, kept for 2 years, so a sign-in from a new device is told apart. */
export const DEVICE_COOKIE = "sos_device";

/** The device, with this browser's id (made now on its first sign-in). For sign-in actions only: it may set a cookie. */
export async function signInDevice() {
  const jar = await cookies();
  let deviceId = jar.get(DEVICE_COOKIE)?.value ?? null;
  if (!deviceId || !/^[A-Za-z0-9_-]{20,100}$/.test(deviceId)) {
    deviceId = newToken();
    jar.set(DEVICE_COOKIE, deviceId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 2 * 365 * 86_400 });
  }
  return { ...(await deviceInfo()), deviceId };
}

/** Keeps the person signed in for 30 days, or (on a shared device) only until the browser closes. */
export async function setSessionCookie(token: string, remember = true) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: 60 * 60 * 24 * 30 } : {}),
  });
}

/** The person's appearance follows them to a new device at sign-in. */
export async function setAppearanceCookies(theme: string, accent: string, textSize = "normal") {
  const jar = await cookies();
  const opts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
  jar.set("sos_theme", theme, opts);
  jar.set("sos_accent", accent, opts);
  jar.set("sos_size", textSize, opts);
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

/** A school DREAM TEAM suspended or closed is paused: nobody works in it. */
export const isPaused = (c: Pick<Current, "schoolStatus">) => c.schoolStatus === "SUSPENDED" || c.schoolStatus === "CLOSED";
/** While paused, only a School Admin or Principal may still sign in, to pay or to download the school's data. */
export const pausedAdmin = (c: Pick<Current, "roles">) => c.roles.some((r) => r.key === "school-admin" || r.key === "principal");

/**
 * For pages: the signed-in person, or a trip to the sign-in page. In a paused
 * school everyone goes to /paused, except where `paused` lets them through:
 * "admin" (Settings, for the data download) or "any" (signing out).
 */
export async function requireCurrent(opts: { paused?: "admin" | "any" } = {}): Promise<Current> {
  const current = await getCurrent();
  if (!current) redirect("/sign-in");
  if (isPaused(current) && opts.paused !== "any" && !(opts.paused === "admin" && pausedAdmin(current))) redirect("/paused");
  return current;
}

/** For server actions that change something: checks the role on the server first. */
export async function requireAction(module: ModuleKey, action: Action) {
  const current = await requireCurrent({ paused: module === "settings" ? "admin" : undefined });
  const reach = requirePermission(current.permissions, module, action);
  return { current, reach };
}

/** For pages: the signed-in person, if their roles let them open this module; otherwise a plain-words "no access" page. */
export async function requirePage(module: ModuleKey, action: Action = "view"): Promise<Current> {
  const current = await requireCurrent({ paused: module === "settings" ? "admin" : undefined });
  if (reachFor(current.permissions, module, action) === "none") redirect(`/no-access?m=${module}`);
  const info = MODULES.find((m) => m.key === module);
  if (info?.optional && !current.modulesOn.has(module)) redirect(`/no-access?m=${module}&off=1`);
  return current;
}
