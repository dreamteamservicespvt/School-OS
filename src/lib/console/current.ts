// Who is signed in to the console, for its pages and actions. Every console
// page and action starts here, so the role is always checked on the server.
import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CONSOLE_COOKIE, CONSOLE_IDLE_MS, actorOf, findConsoleSession } from "./auth";
import { consoleCan, type ConsoleAction } from "./roles";

/** The console's own web address, when set (CONSOLE_HOST): it then answers nowhere else. */
export async function consoleHostAllowed() {
  const want = process.env.CONSOLE_HOST?.trim().toLowerCase();
  if (!want) return true;
  const host = (await headers()).get("host")?.toLowerCase() ?? "";
  return host === want;
}

export async function consoleDevice() {
  const h = await headers();
  return {
    userAgent: h.get("user-agent"),
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
  };
}

export async function setConsoleCookie(token: string) {
  (await cookies()).set(CONSOLE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/console",
    maxAge: Math.floor(CONSOLE_IDLE_MS / 1000) * 48,
  });
}

export async function clearConsoleCookie() {
  (await cookies()).set(CONSOLE_COOKIE, "", { path: "/console", maxAge: 0 });
}

export const getConsole = cache(async () => {
  if (!(await consoleHostAllowed())) return null;
  const token = (await cookies()).get(CONSOLE_COOKIE)?.value;
  const session = await findConsoleSession(token);
  if (!session) return null;
  const device = await consoleDevice();
  const user = session.user;
  return {
    session,
    user,
    actor: actorOf(user, device.ipAddress),
    can: (action: ConsoleAction) => consoleCan(user.role, action),
  };
});

export type ConsoleCurrent = NonNullable<Awaited<ReturnType<typeof getConsole>>>;

/** For console pages: the signed-in DREAM TEAM person, or the console sign-in page. */
export async function requireConsole(): Promise<ConsoleCurrent> {
  if (!(await consoleHostAllowed())) notFound();
  const c = await getConsole();
  if (!c) {
    const had = (await cookies()).get(CONSOLE_COOKIE)?.value;
    redirect(had ? "/console/sign-in?timedOut=1" : "/console/sign-in");
  }
  return c;
}

/** A console page only some roles can open: others go to the Dashboard with a note. */
export async function requireConsolePage(action: ConsoleAction): Promise<ConsoleCurrent> {
  const c = await requireConsole();
  if (!c.can(action)) redirect("/console?denied=1");
  return c;
}

export class ConsoleDenied extends Error {
  constructor(message = "Your console role cannot do this. Ask the Owner.") {
    super(message);
    this.name = "ConsoleDenied";
  }
}

/** For console actions: the person, after checking their role may do this. */
export async function requireConsoleAction(action: ConsoleAction): Promise<ConsoleCurrent> {
  const c = await requireConsole();
  if (!c.can(action)) throw new ConsoleDenied();
  return c;
}
