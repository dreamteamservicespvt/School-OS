// What every Staff & HR file route (exports, ID cards, letters) starts with:
// the action checked on the server, and a plain 403 when the role has no
// Staff & HR at all. requireAction() throws PermissionDeniedError, which a
// route turned into a blank 500 (layman test LD13: a Driver typing the export
// address); pages show the "not part of your role" screen instead.
import "server-only";

import { requireAction } from "@/lib/current";
import { PermissionDeniedError, type Action } from "@/lib/permissions";

const WORDS: Partial<Record<Action, string>> = {
  export: "Your role cannot export from Staff & HR Management.",
  print: "Your role cannot print from Staff & HR Management.",
};

/** The person and their reach, or a 403 answer in plain words. */
export async function staffRouteAccess(action: Action): Promise<Awaited<ReturnType<typeof requireAction>> | Response> {
  try {
    return await requireAction("staff-hr-management", action);
  } catch (e) {
    if (e instanceof PermissionDeniedError) {
      return new Response(WORDS[action] ?? "Your role does not allow this in Staff & HR Management.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    throw e;
  }
}
