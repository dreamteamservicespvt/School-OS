// One campus in Events & Calendar (00-global.md §5): a person limited to one
// campus changes only that campus's events, calendar entries, PTMs and albums.
// A record for every campus reaches the other campus's families too, so it is
// changed only by someone who works for the whole school. New records they
// make are for their own campus. A school with one campus has nothing to keep
// apart: its records have no campus and nothing here applies.
import "server-only";

import type { Tx } from "../db";
import type { CampusLimit } from "../campus";
import { EventsProblem } from "./problem";

export type EvRecord = "event" | "entry" | "ptm" | "slot" | "volunteer" | "album" | "media";

const WORD: Record<EvRecord, string> = { event: "event", entry: "calendar entry", ptm: "PTM", slot: "PTM slot", volunteer: "volunteer", album: "album", media: "photo" };

/** The campus the person is kept to here: their limit, only when the school has more than one campus. */
export async function evCampus(tx: Tx, limit: CampusLimit | null | undefined): Promise<string | null> {
  if (!limit?.campusId) return null;
  return (await tx.campus.count({ where: { archivedAt: null } })) > 1 ? limit.campusId : null;
}

/** The one campus of these classes, or null when there are none or they span campuses. */
async function classesCampus(tx: Tx, classIds: string[]): Promise<string | null> {
  if (!classIds.length) return null;
  const campuses = new Set((await tx.schoolClass.findMany({ where: { id: { in: classIds } }, select: { campusId: true } })).map((c) => c.campusId));
  return campuses.size === 1 ? [...campuses][0] : null;
}

/** A record's campus: an id, null for every campus, or undefined when there is no such record. */
async function campusOf(tx: Tx, kind: EvRecord, id: string): Promise<string | null | undefined> {
  switch (kind) {
    case "event":
      return (await tx.event.findFirst({ where: { id }, select: { campusId: true } }))?.campusId;
    case "entry":
      return (await tx.calendarEntry.findFirst({ where: { id }, select: { campusId: true } }))?.campusId;
    case "ptm": {
      const p = await tx.ptm.findFirst({ where: { id }, select: { classIds: true } });
      return p ? classesCampus(tx, p.classIds) : undefined;
    }
    case "slot": {
      const s = await tx.ptmSlot.findFirst({ where: { id }, select: { ptmId: true } });
      return s ? campusOf(tx, "ptm", s.ptmId) : undefined;
    }
    case "volunteer": {
      const v = await tx.eventVolunteer.findFirst({ where: { id }, select: { eventId: true } });
      return v ? campusOf(tx, "event", v.eventId) : undefined;
    }
    case "album": {
      const a = await tx.album.findFirst({ where: { id }, select: { eventId: true, classIds: true } });
      if (!a) return undefined;
      return a.eventId ? campusOf(tx, "event", a.eventId) : classesCampus(tx, a.classIds);
    }
    case "media": {
      const m = await tx.mediaItem.findFirst({ where: { id }, select: { albumId: true } });
      return m ? campusOf(tx, "album", m.albumId) : undefined;
    }
  }
}

/**
 * Refuses a change to another campus's record (or one for every campus) by a
 * person kept to one campus, in the same words as "not found". A record that
 * does not exist is left to the change itself to say so.
 */
export async function assertEvCampus(tx: Tx, limit: CampusLimit | null | undefined, kind: EvRecord, id: string) {
  const mine = await evCampus(tx, limit);
  if (!mine) return;
  const c = await campusOf(tx, kind, id);
  if (c !== undefined && c !== mine) throw new EventsProblem(`This ${WORD[kind]} was not found, or is on another campus.`);
}

/** Refuses classes of another campus for a person kept to one campus. */
export async function assertEvClasses(tx: Tx, limit: CampusLimit | null | undefined, classIds: string[]) {
  const mine = await evCampus(tx, limit);
  if (!mine || !classIds.length) return;
  const other = await tx.schoolClass.count({ where: { id: { in: classIds }, campusId: { not: mine } } });
  if (other) throw new EventsProblem("Choose classes of your own campus.", "classIds");
}

/** Records a person kept to one campus sees: every campus's and their own. */
export async function evCampusWhere(tx: Tx, limit: CampusLimit | null | undefined): Promise<{ OR?: { campusId: string | null }[] }> {
  const mine = await evCampus(tx, limit);
  return mine ? { OR: [{ campusId: null }, { campusId: mine }] } : {};
}

/** For pages: may this person see the record? Every campus's records and their own campus's. */
export async function evSees(tx: Tx, limit: CampusLimit | null | undefined, kind: EvRecord, id: string) {
  const mine = await evCampus(tx, limit);
  if (!mine) return true;
  const c = await campusOf(tx, kind, id);
  return c === undefined || c === null || c === mine;
}

/** PTMs a person kept to one campus sees: those with classes of that campus. */
export async function evPtmWhere(tx: Tx, limit: CampusLimit | null | undefined): Promise<{ classIds?: { hasSome: string[] } }> {
  const mine = await evCampus(tx, limit);
  if (!mine) return {};
  const classes = await tx.schoolClass.findMany({ where: { campusId: mine }, select: { id: true } });
  return { classIds: { hasSome: classes.map((c) => c.id) } };
}

/** Albums a person kept to one campus sees: of an event they see, of their campus's classes, or of no event and no classes. */
export async function evAlbumWhere(tx: Tx, limit: CampusLimit | null | undefined) {
  const mine = await evCampus(tx, limit);
  if (!mine) return {};
  const [events, classes] = await Promise.all([
    tx.event.findMany({ where: { OR: [{ campusId: null }, { campusId: mine }] }, select: { id: true } }),
    tx.schoolClass.findMany({ where: { campusId: mine }, select: { id: true } }),
  ]);
  return { OR: [{ eventId: { in: events.map((e) => e.id) } }, { eventId: null, classIds: { hasSome: classes.map((c) => c.id) } }, { eventId: null, classIds: { isEmpty: true } }] };
}
