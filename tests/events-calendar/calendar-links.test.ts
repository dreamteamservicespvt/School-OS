// Self-test 2026-10-30: the School Calendar linked every event to its page, but the
// Accountant may open only events with a fee ("Event Payments"), so a free event's
// link ended on "no access". An entry now links only to a page the person can open.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { createEvent, type EventInput } from "@/lib/events/events";
import { calendarItems } from "@/lib/events/calendar";
import { makeCommSchool } from "../communication/fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
const DAY = 86_400_000;
const soon = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const input = (name: string, extra: Partial<EventInput> = {}): EventInput => ({
  name, type: "Celebration", date: soon(10), startMin: 600, endMin: 720, venue: null, audienceKind: "school", classIds: [],
  registrationOn: false, seats: null, feePaise: null, reminder: "none", description: null, ...extra,
});
const links = (opts: Parameters<typeof calendarItems>[4]) => withSchool(s.ctx, async (tx) =>
  Object.fromEntries((await calendarItems(tx, s.ctx, soon(0), soon(30), opts)).filter((i) => i.source === "event").map((i) => [i.title, i.href])));

beforeAll(async () => {
  s = await makeCommSchool();
  await withSchool(s.ctx, async (tx) => {
    await createEvent(tx, s.ctx, input("Fire drill"));
    await createEvent(tx, s.ctx, input("Science fair", { registrationOn: true, feePaise: BigInt(20000) }));
  });
});

describe("calendar entries link only to pages the person can open", () => {
  it("links every event for a person with Events", async () => {
    const l = await links({});
    expect(l["Fire drill"]).toMatch(/^\/events-calendar\/events\//);
    expect(l["Science fair"]).toMatch(/^\/events-calendar\/events\//);
  });

  it("links only events with a fee for the Accountant", async () => {
    const l = await links({ eventLinks: "paid" });
    expect(l["Fire drill"]).toBeNull();
    expect(l["Science fair"]).toMatch(/^\/events-calendar\/events\//);
  });

  it("links no event for a person without the Events page", async () => {
    const l = await links({ eventLinks: "none" });
    expect(Object.values(l).every((h) => h === null)).toBe(true);
  });
});
