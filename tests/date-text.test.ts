// Typed dates and times in the date and time boxes (src/components/ui/date-input.tsx):
// DD-MM-YYYY and 12-hour times on screen (00-global.md P17), YYYY-MM-DD and HH:MM to the form.
import { describe, expect, it } from "vitest";
import { addDays, addMonths, maskDate, monthCells, parseDateText, parseTimeText, showDate, showTime, timeChoices } from "@/lib/date-text";

const today = "2026-10-26";

describe("parseDateText", () => {
  it.each([
    ["14-05-2012", "2012-05-14"],
    ["14/5/2012", "2012-05-14"],
    ["14.05.2012", "2012-05-14"],
    ["14 05 2012", "2012-05-14"],
    ["14052012", "2012-05-14"],
    ["140512", "2012-05-14"],
    ["14/5/12", "2012-05-14"],
    ["1-1-99", "1999-01-01"],
    ["14 May 2012", "2012-05-14"],
    ["14 may, 2012", "2012-05-14"],
    ["May 14 2012", "2012-05-14"],
    ["14 sept 2012", "2012-09-14"],
    ["2012-05-14", "2012-05-14"],
    ["14-5", "2026-05-14"],
    ["14 may", "2026-05-14"],
    ["today", "2026-10-26"],
    ["Tomorrow", "2026-10-27"],
    ["yesterday", "2026-10-25"],
    ["29-02-2024", "2024-02-29"],
  ])("reads %s", (text, iso) => {
    expect(parseDateText(text, today)).toBe(iso);
  });

  it("reads an empty box as no date", () => {
    expect(parseDateText("  ", today)).toBe("");
  });

  it.each(["31-02-2026", "29-02-2026", "00-05-2012", "14-13-2012", "hello", "14-05-201", "12345"])("refuses %s", (text) => {
    expect(parseDateText(text, today)).toBeNull();
  });

  it("puts a two-digit year in this century unless that is more than 10 years ahead", () => {
    expect(parseDateText("1-1-36", today)).toBe("2036-01-01");
    expect(parseDateText("1-1-37", today)).toBe("1937-01-01");
  });
});

describe("maskDate", () => {
  it.each([
    ["1", "1"],
    ["14", "14"],
    ["140", "14-0"],
    ["1405", "14-05"],
    ["14052", "14-05-2"],
    ["14052012", "14-05-2012"],
    ["14-052", "14-05-2"],
    ["1-5-2012", "1-5-2012"],
    ["14/05/2012", "14-05-2012"],
    ["14-", "14-"],
    ["14052012999", "14-05-2012"],
    ["14 may", "14 may"],
  ])("turns %s into %s", (typed, shown) => {
    expect(maskDate(typed)).toBe(shown);
  });
});

describe("showDate and showTime", () => {
  it("shows DD-MM-YYYY and 12-hour times", () => {
    expect(showDate("2012-05-14")).toBe("14-05-2012");
    expect(showDate("")).toBe("");
    expect(showTime("09:05")).toBe("9:05 AM");
    expect(showTime("12:00")).toBe("12:00 PM");
    expect(showTime("00:30")).toBe("12:30 AM");
    expect(showTime("21:45")).toBe("9:45 PM");
    expect(showTime("")).toBe("");
  });
});

describe("parseTimeText", () => {
  it.each([
    ["9:30", "09:30"],
    ["9.30", "09:30"],
    ["930", "09:30"],
    ["0930", "09:30"],
    ["9", "09:00"],
    ["9 pm", "21:00"],
    ["9:30pm", "21:30"],
    ["9:30 P.M.", "21:30"],
    ["12 am", "00:00"],
    ["12:15 pm", "12:15"],
    ["21:30", "21:30"],
    ["2130", "21:30"],
    ["9:05 AM", "09:05"],
  ])("reads %s", (text, hhmm) => {
    expect(parseTimeText(text)).toBe(hhmm);
  });

  it.each(["25:00", "9:60", "13 pm", "abc", "0 am"])("refuses %s", (text) => {
    expect(parseTimeText(text)).toBeNull();
  });
});

describe("calendar helpers", () => {
  it("steps days and months, keeping the day inside short months", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-02-29", -12)).toBe("2023-02-28");
  });

  it("lays a month out in 6 weeks starting on Monday", () => {
    const cells = monthCells(2026, 9); // October 2026 starts on a Thursday
    expect(cells).toHaveLength(42);
    expect(cells[0]).toBe("2026-09-28");
    expect(cells[3]).toBe("2026-10-01");
    expect(cells[41]).toBe("2026-11-08");
  });

  it("lists times in steps, inside the limits", () => {
    expect(timeChoices(30, "08:00", "09:30")).toEqual(["08:00", "08:30", "09:00", "09:30"]);
    expect(timeChoices(15).length).toBe(96);
  });
});
