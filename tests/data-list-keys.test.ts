// The phone cards of a list (Students, Parents & Guardians …) draw pills made by
// small helpers that carry no React key. React warned "Each child in a list
// should have a unique key" on /student-management and
// /student-management/guardians. DataList now gives each pill its own place.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataList } from "@/components/ui/data-list";

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
