// Loads the sections a guardian's page shows, in order. Shared by the
// guardian's page and the staff preview ("What guardians see").
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { messageSettings } from "../messaging/settings";
import { shownSections } from "./section-list";
import type { GuardianView, SectionDef } from "./sections";

export type LoadedSection = { def: SectionDef; data: unknown };

export async function loadSections(tx: Tx, ctx: SchoolContext, view: GuardianView): Promise<LoadedSection[]> {
  const settings = await messageSettings(tx, ctx);
  const out: LoadedSection[] = [];
  for (const def of shownSections(settings.parentLink.shows)) {
    const data = await def.load(tx, ctx, view);
    // Nothing to show: the section is left out (no empty boxes).
    if (data === null || data === undefined) continue;
    out.push({ def, data });
  }
  return out;
}
