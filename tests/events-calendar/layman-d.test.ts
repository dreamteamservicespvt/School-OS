// Layman test D (docs/qa/2026-11-12-layman-D.md), Events and Front Office part:
// LD8 an event on a past date or a weekend asks first (one message, save
// anyway); LD7 dates in Events, Front Office and the date filter read
// DD-MM-YYYY like every other module (00-global.md P17).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { createEvent } from "@/lib/events/events";
import { EventsWarning } from "@/lib/events/problem";
import { longDay, niceDay, shortDay as evShortDay, spanWords } from "@/lib/events/words";
import { dayMonth, shortDay as foShortDay, whenWords } from "@/lib/front-office/time";
import { rangeWords } from "@/lib/periods";
import { as, eventInput, makeEventsSchool, type EvFixture } from "./fixture";

let f: EvFixture;
beforeAll(async () => { f = await makeEventsSchool("Layman D Events School"); }, 120_000);

const TODAY = "2026-11-12"; // a Thursday
const make = (date: string, opts: { confirmPast?: boolean; confirmWeekend?: boolean } = {}, name = `LD8 ${date}`) =>
  withSchool(as(f, f.principal.id), (tx) => createEvent(tx, as(f, f.principal.id), eventInput({ name, date, venue: null }), { ...opts, today: TODAY }));
const warning = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(EventsWarning);
  return e as EventsWarning;
};

describe("an event on a past date or a weekend (LD8)", () => {
  it("asks once about a past Sunday, naming both, and saves when both are accepted", async () => {
    const w = await warning(make("2026-11-01"));
    expect(w.message).toBe("01-11-2026 has passed, so the event is saved as Done. 01-11-2026 is a Sunday, a weekend. Check the date, or save anyway to record a past event.");
    expect(w.confirmKey.split(",").sort()).toEqual(["past-date", "weekend"]);
    await expect(make("2026-11-01", { confirmPast: true })).rejects.toThrow(/is a Sunday/);
    await expect(make("2026-11-01", { confirmPast: true, confirmWeekend: true })).resolves.toMatchObject({ name: "LD8 2026-11-01" });
  });

  it("asks about a coming Sunday as a weekend only", async () => {
    const w = await warning(make("2026-11-22"));
    expect(w.message).toBe("22-11-2026 is a Sunday, a weekend. Check the date, or save anyway.");
    expect(w.confirmKey).toBe("weekend");
    await expect(make("2026-11-22", { confirmWeekend: true })).resolves.toMatchObject({ name: "LD8 2026-11-22" });
  });

  it("asks about a past weekday, and saves a coming weekday without a word", async () => {
    expect((await warning(make("2026-11-10"))).confirmKey).toBe("past-date");
    await expect(make("2026-11-24")).resolves.toMatchObject({ name: "LD8 2026-11-24" });
  });
});

describe("dates read DD-MM-YYYY (LD7)", () => {
  it("in Events & Calendar", () => {
    expect(niceDay("2026-09-21")).toBe("Mon, 21-09-2026");
    expect(longDay("2026-11-03")).toBe("Tue 03-11-2026");
    expect(evShortDay("2026-10-28")).toBe("Wed 28-10-2026");
    expect(spanWords("2026-04-01", "2027-03-31")).toBe("01-04-2026 – 31-03-2027");
    expect(spanWords("2026-08-15", "2026-08-15")).toBe("15-08-2026");
  });

  it("in Front Office and the date filter", () => {
    const oct31 = new Date("2026-10-31T00:00:00Z");
    expect(dayMonth(oct31)).toBe("31-10-2026");
    expect(foShortDay(oct31)).toBe("Sat, 31-10-2026");
    expect(whenWords(new Date("2026-10-31T03:50:00Z"), "Asia/Kolkata", new Date("2026-11-12T06:00:00Z"))).toBe("31-10-2026, 9:20 AM");
    expect(rangeWords("2026-11-12", "2026-11-12")).toBe("12-11-2026");
  });
});
