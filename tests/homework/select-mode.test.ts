// Bulk "Mark Complete" on a phone or tablet (browser finding TEACHING-11):
// the list shows cards there, not the computer's table with its tick boxes.
// In select mode each card is a tick box for the same bulk form, with
// "select all" above the cards, and a tap ticks the student instead of
// opening them. Out of select mode the cards still open the student.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataList } from "@/components/ui/data-list";

type Row = { id: string; name: string };
const rows: Row[] = [{ id: "a1", name: "Akshara Pillai" }, { id: "b2", name: "Bhavya Bhat" }];
const list = (pickMode: boolean) => renderToStaticMarkup(createElement(DataList<Row>, {
  rows, rowKey: (r) => r.id, rowHref: (r) => `/homework-learning/submissions?open=${r.id}`, caption: "Submissions",
  columns: [{ key: "n", label: "Student", render: (r) => r.name }],
  mobile: (r) => ({ title: r.name }),
  select: { form: "subs-bulk", label: (r) => `Select ${r.name}`, allLabel: "Select every student shown" },
  pickMode,
}));
/** The phone and tablet part: the card list and what comes just before it. */
const phonePart = (html: string) => html.slice(html.indexOf("</table>"));

describe("select mode on phones and tablets", () => {
  it("makes every card a tick box of the bulk form, with select all, and no card opens the student", () => {
    const phone = phonePart(list(true));
    for (const r of rows) {
      expect(phone).toContain(`aria-label="Select ${r.name}"`);
      expect(phone).toMatch(new RegExp(`<label[^>]*><input type="checkbox" form="subs-bulk"[^>]*name="id" value="${r.id}"`));
      expect(phone).not.toContain(`open=${r.id}`);
    }
    expect(phone).toContain("data-bulk-all");
    expect(phone).toContain("Select every student shown");
  });

  it("out of select mode, the cards open the student and show no tick boxes", () => {
    const phone = phonePart(list(false));
    for (const r of rows) {
      expect(phone).toContain(`open=${r.id}`);
      expect(phone).not.toContain(`value="${r.id}"`);
    }
    expect(phone).not.toContain("data-bulk-all");
  });
});
