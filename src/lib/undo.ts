// Undo for simple changes, for 10 seconds after they are made (00-global.md P5).
// Each module registers how to undo its own changes. The server checks the
// person may still make that change; undo never bypasses permissions.
import "server-only";

import type { Current } from "./current";

export const UNDO_WINDOW_MS = 10_000;
/** How long the server still accepts an Undo the toast offered, allowing for a slow phone or network. */
export const UNDO_GRACE_MS = UNDO_WINDOW_MS + 20_000;

type UndoHandler = (current: Current, id: string) => Promise<void>;
const handlers = new Map<string, UndoHandler>();

export function registerUndo(kind: string, handler: UndoHandler) {
  handlers.set(kind, handler);
}

export async function runUndo(current: Current, kind: string, id: string) {
  const handler = handlers.get(kind);
  if (!handler) throw new Error("This change cannot be undone.");
  await handler(current, id);
}
