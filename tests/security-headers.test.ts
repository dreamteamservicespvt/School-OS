// Every page carries the security headers from next.config.ts (08-platform-security.md §3).
import { describe, expect, it } from "vitest";
import config from "../next.config";

describe("security headers", () => {
  it("are sent on every path, with a content security policy that blocks <base>, plugins and framing", async () => {
    const rules = await config.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all).toBeDefined();
    const h = Object.fromEntries(all!.headers.map((x) => [x.key, x.value]));
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    const csp = h["Content-Security-Policy"] ?? "";
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // No script or style rules: Next.js needs its inline scripts.
    expect(csp).not.toMatch(/script-src|default-src|style-src/);
  });
});
