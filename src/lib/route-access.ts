// What a file route (export, print, letter, PDF) starts with: the action
// checked on the server, and a plain 403 in words when the role may not do it.
// requireAction() throws PermissionDeniedError; in a route that became a blank
// 500 (layman test LD13: a Driver typing the Staff List export address).
// Pages show the "not part of your role" screen instead (requirePage).
import "server-only";

import { requireAction } from "@/lib/current";
import { PermissionDeniedError, type Action } from "@/lib/permissions";
import type { ModuleKey } from "@/lib/modules";

/** The plain refusal a route answers with. */
export function refusal(words: string): Response {
  return new Response(words, { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/** The person and their reach, or a 403 answer in plain words (`words` when given, else the refusal's own message). */
export async function routeAction(module: ModuleKey, action: Action, words?: string): Promise<Awaited<ReturnType<typeof requireAction>> | Response> {
  try {
    return await requireAction(module, action);
  } catch (e) {
    if (e instanceof PermissionDeniedError) return refusal(words ?? e.message);
    throw e;
  }
}
