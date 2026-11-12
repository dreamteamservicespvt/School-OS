// Self-test A4 (2026-11-12): an event's end time typed as text the box could not read
// ("10:00 AM:00 PM") was sent empty, and the event saved with no end time. The box now sends
// the text as typed (sendUnreadable in src/components/ui/date-input.tsx); the server must refuse it.
import { describe, expect, it } from "vitest";
import { parseTimeText } from "@/lib/date-text";
import { minutesFrom } from "@/lib/events/words";

describe("an end time that cannot be read is refused, never dropped", () => {
  it("the box cannot read it", () => expect(parseTimeText("10:00 AM:00 PM")).toBeNull());
  it("the server cannot read it either, so Create event says 'Enter the end time like 10:30.'", () => {
    expect(minutesFrom("10:00 AM:00 PM")).toBeNull();
    expect(minutesFrom("10:00 AM")).toBeNull();
  });
  it("a good time typed after an error is read", () => {
    expect(parseTimeText("1:00 PM")).toBe("13:00");
    expect(parseTimeText("13:00")).toBe("13:00");
    expect(minutesFrom("13:00")).toBe(780);
  });
});
