// What every Staff & HR file route (exports, ID cards, letters) starts with:
// the action checked on the server, and a plain 403 when the role has no
// Staff & HR at all (src/lib/route-access.ts, layman test LD13).
import "server-only";

import type { requireAction } from "@/lib/current";
import type { Action } from "@/lib/permissions";
import { routeAction } from "@/lib/route-access";

const WORDS: Partial<Record<Action, string>> = {
  export: "Your role cannot export from Staff & HR Management.",
  print: "Your role cannot print from Staff & HR Management.",
};

/** The person and their reach, or a 403 answer in plain words. */
export async function staffRouteAccess(action: Action): Promise<Awaited<ReturnType<typeof requireAction>> | Response> {
  return routeAction("staff-hr-management", action, WORDS[action] ?? "Your role does not allow this in Staff & HR Management.");
}
