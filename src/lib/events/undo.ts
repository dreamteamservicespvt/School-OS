// Undo for Events & Calendar (P5): a calendar entry added or removed, an
// album archived and a photo removed. Each checks the person's rights again;
// undo never goes around them.
import "server-only";

import { registerUndo } from "../undo";
import { withSchool } from "../db";
import { requirePermission } from "../permissions";
import { evCan, evViewer } from "./access";
import { EventsProblem } from "./problem";
import { restoreEntry, undoAdd } from "./calendar";
import { restoreMedia, unarchiveAlbum } from "./gallery";

registerUndo("ev-entry-add", async (current, id) => {
  requirePermission(current.permissions, "events-calendar", "create");
  if (!evCan(evViewer(current)).calendar) throw new EventsProblem("Your role cannot change the School Calendar.");
  await withSchool(current.ctx, (tx) => undoAdd(tx, current.ctx, id));
});

registerUndo("ev-entry-remove", async (current, id) => {
  requirePermission(current.permissions, "events-calendar", "archive");
  if (!evCan(evViewer(current)).calendar) throw new EventsProblem("Your role cannot change the School Calendar.");
  await withSchool(current.ctx, (tx) => restoreEntry(tx, current.ctx, id));
});

registerUndo("ev-album-archive", async (current, key) => {
  requirePermission(current.permissions, "events-calendar", "archive");
  if (!evCan(evViewer(current)).gallery) throw new EventsProblem("Your role cannot change the Gallery.");
  const [id, was] = key.split("~");
  await withSchool(current.ctx, (tx) => unarchiveAlbum(tx, current.ctx, id, was ?? "DRAFT"));
});

registerUndo("ev-media-remove", async (current, id) => {
  requirePermission(current.permissions, "events-calendar", "archive");
  if (!evCan(evViewer(current)).gallery) throw new EventsProblem("Your role cannot change the Gallery.");
  await withSchool(current.ctx, (tx) => restoreMedia(tx, current.ctx, id));
});
