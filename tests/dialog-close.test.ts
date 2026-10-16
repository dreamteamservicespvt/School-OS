// The shared Dialog tells its parent "closed" only when the person closed it
// (Escape), not when the parent itself set open to false. Before this, the
// results "Publish now" step closed its own confirm sheet straight away, so
// results could not be published from the screen (ACADEMICS-13).
import { describe, expect, it } from "vitest";
import { closedByPerson } from "@/components/ui/dialog";

describe("Dialog close event", () => {
  it("passes on a close the person made while the dialog should be open", () => {
    expect(closedByPerson(true)).toBe(true);
  });

  it("ignores the close that follows the parent setting open to false", () => {
    // The parent moved on (for example to the confirm step); the effect called
    // dialog.close() and the browser's "close" event arrives afterwards.
    expect(closedByPerson(false)).toBe(false);
  });
});
