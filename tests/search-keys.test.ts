// Search keeps the first keys pressed while it opens (QA SEARCH-01): only a
// letter, digit or sign typed with no Ctrl, Alt or Cmd is put into the box.
import { describe, expect, it } from "vitest";
import { typedKey } from "@/components/shell/typed-key";

describe("Search: keys pressed while it opens", () => {
  it("keeps letters, digits, signs and spaces", () => {
    expect(typedKey({ key: "r" })).toBe("r");
    expect(typedKey({ key: "R" })).toBe("R");
    expect(typedKey({ key: "7" })).toBe("7");
    expect(typedKey({ key: " " })).toBe(" ");
    expect(typedKey({ key: "अ" })).toBe("अ");
  });
  it("leaves shortcuts, Enter, arrows and Escape alone", () => {
    expect(typedKey({ key: "k", ctrlKey: true })).toBeNull();
    expect(typedKey({ key: "k", metaKey: true })).toBeNull();
    expect(typedKey({ key: "a", altKey: true })).toBeNull();
    for (const key of ["Enter", "Escape", "ArrowDown", "Backspace", "Tab", "Shift"]) expect(typedKey({ key })).toBeNull();
    expect(typedKey({ key: "a", isComposing: true })).toBeNull();
  });
});
