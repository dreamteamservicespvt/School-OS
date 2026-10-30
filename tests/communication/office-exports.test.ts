// Delivery audit 2026-10-31: Message Settings' automation log is an office page (Principal and
// School Admin, commOfficePage), but its download only asked for the Communication "export"
// action, so a teacher or the Transport In-charge downloaded the whole school's automation log
// (every parent messaged, every fee receipt number) by opening the address. Message Templates
// stays readable (and downloadable) by everyone who may open Communication, as its page is.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    getCurrent: requireCurrent,
    requireCurrent,
    requirePage: requireCurrent,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});

import { accessIn } from "@/lib/auth/access";
import { GET as logExport } from "@/app/(school)/communication/settings/log/export/route";
import { GET as templatesExport } from "@/app/(school)/communication/templates/export/route";
import { makeCommSchool } from "./fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
beforeAll(async () => { s = await makeCommSchool(); }, 120_000);

async function as(userId: string, name: string) {
  const access = await accessIn(userId, s.school.id);
  who.current = { ...access!, ctx: { schoolId: s.school.id, userId }, user: { id: userId, displayName: name }, menu: [], schools: [], session: null, support: null } as unknown as Current;
}

describe("office-only Communication downloads", () => {
  it("refuse the automation log to a teacher; templates stay readable, as on their page", async () => {
    await as(s.teacher.id, "Teacher Person");
    expect((await logExport(new Request("http://localhost/communication/settings/log/export?format=csv"))).status).toBe(403);
    expect((await templatesExport(new Request("http://localhost/communication/templates/export?format=csv"))).status).toBe(200);
  });

  it("still work for the Principal", async () => {
    await as(s.principal.id, "Principal Person");
    expect((await logExport(new Request("http://localhost/communication/settings/log/export?format=csv"))).status).toBe(200);
    expect((await templatesExport(new Request("http://localhost/communication/templates/export?format=csv"))).status).toBe(200);
  });
});
