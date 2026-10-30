// The phone cards of a list (Students, Parents & Guardians …) draw pills made by
// small helpers that carry no React key. React warned "Each child in a list
// should have a unique key" on /student-management and
// /student-management/guardians. DataList now gives each pill its own place.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataList } from "@/components/ui/data-list";
import { DataList as MoneyList } from "@/components/money/kit";

type Row = { id: string; name: string };
const rows: Row[] = [{ id: "a1", name: "Akshara Pillai" }, { id: "b2", name: "Bhavya Bhat" }];

afterEach(() => vi.restoreAllMocks());

describe("pills on the phone cards", () => {
  it("draws pills without keys, and empty ones, with no key warning", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(createElement(DataList<Row>, {
      rows, rowKey: (r) => r.id, caption: "Students",
      columns: [{ key: "n", label: "Student", render: (r) => r.name }],
      mobile: (r) => ({ title: r.name, pills: [createElement("span", null, "Fees paid"), null, createElement("span", null, `Pill of ${r.name}`)] }),
    }));
    expect(html).toContain("Fees paid");
    expect(html).toContain("Pill of Bhavya Bhat");
    expect(errors.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("unique \"key\""))).toEqual([]);
  });
});

// Self-test 2026-10-30: Fees, Concessions & Refunds broke on every load for the Principal
// (React #418): the phone card was one link, and its pills held the Approve form and the
// Decline link, a link inside a link. The card's link now lies over the card instead.
describe("buttons and links on a phone card that opens", () => {
  it("never puts a link inside the card's link", () => {
    const html = renderToStaticMarkup(createElement(DataList<Row>, {
      rows, rowKey: (r) => r.id, caption: "Concessions", rowHref: (r) => `/x/${r.id}`,
      columns: [{ key: "n", label: "Student", render: (r) => r.name }],
      mobile: (r) => ({ title: r.name, pills: [createElement("a", { key: "d", href: `/x/${r.id}?decline=1` }, "Decline")] }),
    }));
    const phone = html.slice(html.indexOf("<ul"));
    // Every <a> closes before the next one opens.
    const tags = [...phone.matchAll(/<a[\s>]|<\/a>/g)].map((m) => (m[0] === "</a>" ? "</a>" : "<a"));
    for (let i = 0; i < tags.length; i += 2) expect([tags[i], tags[i + 1]]).toEqual(["<a", "</a>"]);
    expect(phone).toContain('aria-label="Akshara Pillai"');
    expect(phone).toContain("Decline");
  });
});

describe("the same on the money pages' list (Fees, Finance, Salary)", () => {
  it("never puts a link inside the card's link", () => {
    const html = renderToStaticMarkup(createElement(MoneyList<Row>, {
      rows, rowKey: (r) => r.id, caption: "Concessions", rowHref: (r) => `/x/${r.id}`,
      columns: [{ key: "n", label: "Student", render: (r) => r.name }],
      phone: (r) => ({ title: r.name, pills: createElement("a", { href: `/x/${r.id}?decline=1` }, "Decline") }),
    }));
    const phone = html.slice(html.indexOf("<ul"));
    const tags = [...phone.matchAll(/<a[\s>]|<\/a>/g)].map((m) => (m[0] === "</a>" ? "</a>" : "<a"));
    for (let i = 0; i < tags.length; i += 2) expect([tags[i], tags[i + 1]]).toEqual(["<a", "</a>"]);
    expect(phone).toContain('aria-label="Bhavya Bhat"');
  });
});

