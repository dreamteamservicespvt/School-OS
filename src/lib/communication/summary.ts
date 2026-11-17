// "How did this message do" on one sent message (research 2026-11-15, Inkwelly section 3 row 9):
// delivered, read and failed out of everyone it went to, and the same by channel. Counted from the
// message's own recipient rows with the rules of countsFor() (history.ts): read counts as delivered,
// test mode (the sandbox provider) is never delivered, SMS backup copies are not extra people.
// A channel only "reports" when a delivery report came back (or it is the app, which sees it opened),
// so a WhatsApp copy at Sent is never shown as 0% delivered or read (decision 15 Nov 2026).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { CHANNELS } from "../messaging/channels";
import { inTestMode } from "./history";

export type Tally = {
  /** Everyone it went to, test mode and failed included. */
  total: number;
  /** Delivered or read (a report came back). */
  delivered: number;
  read: number;
  failed: number;
  /** Still in the queue or being handed over. */
  going: number;
  /** A provider took it and no report came back (yet). */
  sent: number;
  /** Recorded in test mode: nobody received it. */
  testMode: number;
};

export type ChannelSummary = Tally & {
  channel: string;
  /** A delivery report came back for this channel (always for the app). */
  reports: boolean;
  /** This channel tells us who read it: the app, and WhatsApp once its reports come back. */
  readReports: boolean;
};

export type MessageSummary = Tally & {
  /** SMS backup copies sent to people already counted. */
  backup: number;
  reports: boolean;
  readReports: boolean;
  /** Any still going: the numbers are not final. */
  stillGoing: boolean;
  /** One line per channel with at least one person, in the usual channel order. */
  channels: ChannelSummary[];
};

const empty = (): Tally => ({ total: 0, delivered: 0, read: 0, failed: 0, going: 0, sent: 0, testMode: 0 });

function add(t: Tally, r: { status: string; provider: string | null }, n: number) {
  t.total += n;
  if (inTestMode(r)) { t.testMode += n; return; }
  if (r.status === "DELIVERED" || r.status === "READ") t.delivered += n;
  if (r.status === "READ") t.read += n;
  if (r.status === "FAILED") t.failed += n;
  if (r.status === "QUEUED" || r.status === "SENDING") t.going += n;
  if (r.status === "SENT") t.sent += n;
}

/**
 * The summary of one message. `campusWhere` is the page's own recipient filter
 * (recipientCampusWhere): a person kept to one campus counts only their campus's people.
 */
export async function messageSummary(tx: Tx, ctx: SchoolContext, messageId: string, campusWhere: Prisma.MessageRecipientWhereInput): Promise<MessageSummary> {
  // campus: pinned to one message, with the page's campus filter in campusWhere.
  const rows = await tx.messageRecipient.groupBy({ by: ["channel", "status", "isBackup", "provider"], where: { schoolId: ctx.schoolId, messageId, AND: [campusWhere] }, _count: { _all: true } });
  const all = empty();
  let backup = 0;
  const by = new Map<string, Tally>();
  for (const r of rows) {
    const n = r._count._all;
    if (r.isBackup) { backup += n; continue; }
    add(all, r, n);
    if (!by.has(r.channel)) by.set(r.channel, empty());
    add(by.get(r.channel)!, r, n);
  }
  const order = (c: string) => { const i = (CHANNELS as readonly string[]).indexOf(c); return i < 0 ? CHANNELS.length : i; };
  const channels: ChannelSummary[] = [...by.entries()]
    .filter(([, t]) => t.total > 0)
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([channel, t]) => {
      const reports = channel === "app" || t.delivered > 0;
      return { channel, ...t, reports, readReports: channel === "app" || (channel === "whatsapp" && reports) };
    });
  return {
    ...all,
    backup,
    reports: channels.some((c) => c.reports),
    readReports: channels.some((c) => c.readReports),
    stillGoing: all.going > 0,
    channels,
  };
}

/** A whole-number share for the screen, or null when there is nobody to share among. */
export const share = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : null);
