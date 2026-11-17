// Collect Fee after the server refuses a payment (testing issues 5 and 30,
// docs/qa/testing-issues.md). React 19 resets a <form action> once its action
// ends: a text box held by React (value=...) comes back, one that is not goes
// empty. Seen in the browser on 17 Nov 2026 (qa/full/ti-money-check.mjs):
// - a refused Collect still emptied the Note (and the waiver's reason);
// - after "Ask for approval" worked, the red "Ask for approval, then collect..."
//   sentence stayed under the Discount box, below the green "Sent to the principal".
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { limitLine, refusalShown } from "@/app/(school)/fee-management/collect/[studentId]/refusal";

const file = path.resolve(import.meta.dirname, "../../src/app/(school)/fee-management/collect/[studentId]/collect-form.tsx");

describe("Collect Fee form after a refused payment", () => {
  it("holds every typed box in React, so the form reset cannot empty it", () => {
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const boxes: string[] = [];
    const loose: string[] = [];
    const visit = (node: ts.Node) => {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(source) === "input") {
        const attr = (name: string) => node.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(source) === name);
        const type = attr("type")?.initializer;
        const hidden = Boolean(type && ts.isStringLiteral(type) && type.text === "hidden");
        const name = attr("name")?.initializer?.getText(source).replace(/"/g, "") ?? "(no name)";
        if (!hidden) boxes.push(name);
        if (!hidden && !attr("value")) loose.push(name);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    // The boxes a cashier types in are all found (so the check below is not empty-handed).
    expect(boxes).toEqual(expect.arrayContaining(["amount", "reference", "discount", "discountReason", "waiveReason", "note"]));
    expect(loose).toEqual([]);
  });

  it("stops showing a refusal once its discount changed, or went to the principal", () => {
    const refused = { ok: false, message: "Discounts above ₹1,000 need the principal's approval." };
    expect(refusalShown(refused, null, false)).toBe(refused);
    // Issue 30: the discount was changed after this refusal.
    expect(refusalShown(refused, refused, false)).toBeNull();
    // An older refusal was hidden; this is a new one.
    expect(refusalShown(refused, { ok: false }, false)).toBe(refused);
    // Issue 5: "Ask for approval" worked, so "ask for approval" is not said again.
    expect(refusalShown(refused, null, true)).toBeNull();
    expect(refusalShown({ ok: true, message: "₹500 received." }, null, false)).toBeNull();
    expect(refusalShown(null, null, false)).toBeNull();
  });

  it("says \"needs approval\" under a discount above the limit, but not for the one just sent", () => {
    const limit = { limitPaise: 100000, limit: "₹1,000" };
    expect(limitLine({ discountPaise: 150000, waivePaise: 0, sent: false, ...limit })).toBe("More than ₹1,000 needs the principal’s approval");
    expect(limitLine({ discountPaise: 150000, waivePaise: 0, sent: true, ...limit })).toBe("");
    // A discount and a waiver together above the limit.
    expect(limitLine({ discountPaise: 60000, waivePaise: 50000, sent: false, ...limit })).toBe("More than ₹1,000 needs the principal’s approval");
    // At the limit, and with no discount typed, nothing is said.
    expect(limitLine({ discountPaise: 100000, waivePaise: 0, sent: false, ...limit })).toBe("");
    expect(limitLine({ discountPaise: 0, waivePaise: 200000, sent: false, ...limit })).toBe("");
  });
});
