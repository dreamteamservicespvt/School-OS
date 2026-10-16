// QA (Chaitanya EM School audit): the Dashboard card for expired bus papers
// said "... and 1 more and 1 more", and its title counted only the expired
// papers while the names listed the ones due soon as well.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { buildHome } from "@/lib/dashboard/compose";
import type { Current } from "@/lib/current";
import { makeTransportSchool, d, today } from "../transport/fixture";

let principal: Current;

beforeAll(async () => {
  const s = await makeTransportSchool("Papers Card School");
  const day = 86_400_000;
  await withSchool(s.sys, async (tx) => {
    // One expired paper, two due within the reminder days, and one expired licence.
    await tx.vehicleDocument.create({ data: { schoolId: s.school.id, vehicleId: s.van.id, kind: "POLLUTION", expiresOn: new Date(today().getTime() - 3 * day) } });
    await tx.vehicleDocument.create({ data: { schoolId: s.school.id, vehicleId: s.van.id, kind: "PERMIT", expiresOn: new Date(today().getTime() + 5 * day) } });
    await tx.vehicleDocument.create({ data: { schoolId: s.school.id, vehicleId: s.bus.id, kind: "FITNESS", expiresOn: new Date(today().getTime() + 6 * day) } });
    await tx.driver.update({ where: { id: s.srinu.id }, data: { licenceExpiry: d("2020-01-01") } });
  });
  const access = await accessIn(s.principal.id, s.school.id);
  principal = { ...access!, ctx: { schoolId: s.school.id, userId: s.principal.id }, user: { id: s.principal.id, displayName: "Principal" }, menu: [], schools: [], session: null } as unknown as Current;
}, 180_000);

describe("transport.papers", () => {
  it("says 'and N more' once and counts the papers due as well as the expired ones", async () => {
    const card = (await buildHome(principal)).attention.find((x) => x.id === "transport.papers");
    expect(card).toBeTruthy();
    expect(card!.title).toMatch(/^2 transport papers expired · 2 more due in \d+ days$/);
    expect(card!.detail).not.toMatch(/more and \d+ more/);
    expect(card!.detail).toMatch(/and 2 more\. Upload the renewed papers\.$/);
  });
});
