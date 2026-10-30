// Self-test 2026-10-30: the Accountant (Inventory: Purchases & Vendors and the reports)
// was shown links to Items & Stock (on a purchase order and the stock report) that
// ended on "no access". Links now go only to pages the person can open.
import { describe, expect, it } from "vitest";
import { hrefOpen, pageOfHref, type InvPage } from "@/lib/inventory/access";

const accountant = { pages: { items: "hidden", issue: "hidden", purchases: "view", assets: "hidden", rooms: "hidden", reports: "view", settings: "hidden" } as Record<InvPage, "full" | "view" | "hidden"> };

describe("Inventory links", () => {
  it.each([
    ["/inventory-management/items/0708968a-7fc9-48a6-90f1-476261ccaca8", "items"],
    ["/inventory-management/items?state=low", "items"],
    ["/inventory-management", "issue"],
    ["/inventory-management/purchases/orders/x", "purchases"],
    ["/inventory-management/reports?r=inv-stock#report", "reports"],
    ["/fee-management", null],
  ])("knows the page of %s", (href, page) => {
    expect(pageOfHref(href)).toBe(page);
  });

  it("leaves out Items & Stock for the Accountant, keeps Purchases and the reports", () => {
    expect(hrefOpen(accountant, "/inventory-management/items")).toBe(false);
    expect(hrefOpen(accountant, "/inventory-management/items/abc")).toBe(false);
    expect(hrefOpen(accountant, "/inventory-management/purchases/orders/abc")).toBe(true);
    expect(hrefOpen(accountant, "/inventory-management/reports?r=inv-stock")).toBe(true);
  });
});
