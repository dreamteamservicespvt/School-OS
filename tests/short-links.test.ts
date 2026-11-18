import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

// Testing issue 28: short words people type by hand (/exams, /attendance) said "This page is not here".
// Each one goes to its module, and each module it names is a real page.
describe("short links typed by hand", () => {
  it("send /exams and /attendance to their modules", async () => {
    const list = (await nextConfig.redirects?.()) ?? [];
    const to = (source: string) => list.find((r) => r.source === source)?.destination;
    expect(to("/exams")).toBe("/examination-results");
    expect(to("/exams/:path*")).toBe("/examination-results");
    expect(to("/attendance")).toBe("/attendance-management");
    expect(to("/attendance/:path*")).toBe("/attendance-management");
    for (const r of list) {
      expect(existsSync(path.join(process.cwd(), "src/app/(school)", r.destination.replace(/^\//, ""), "page.tsx")), r.destination).toBe(true);
    }
  });
});
