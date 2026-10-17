// Platform QA fixes (Chaitanya QA audit, PLATFORM-01 and PLATFORM-02):
// - the Search box's people search answered "Too many searches" to every
//   request, because the rate-limit result (an object) was read as a boolean;
// - the Dashboard's Recent payments card linked to /fee-management/collect,
//   which is not a page, and offered "Collect fee" to the Principal and School
//   Admin, who never sit at the counter (src/lib/duty.ts).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { accessIn } from "@/lib/auth/access";
import { buildHome } from "@/lib/dashboard/compose";
import type { Current } from "@/lib/current";
import type { Panel } from "@/lib/dashboard/types";
import { withSchool } from "@/lib/db";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "../fees/fixture";
import { makeUser } from "../helpers";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", () => ({ getCurrent: async () => who.current }));

const search = await import("@/app/api/v1/search/route");

let f: FeeSchool;
let other: FeeSchool;
const currentFor = async (schoolId: string, userId: string): Promise<Current> => {
  const access = await accessIn(userId, schoolId);
  return { ...access!, ctx: { schoolId, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
};

beforeAll(async () => {
  [f, other] = await Promise.all([makeFeeSchool(), makeFeeSchool()]);
}, 120_000);

describe("Search box people search", () => {
  it("answers with the school's students, again and again, not 'Too many searches'", async () => {
    who.current = await currentFor(f.school.id, f.principal.id);
    for (let i = 0; i < 3; i++) {
      const res = await search.GET(new Request("http://localhost/api/v1/search?q=Ravi"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.students.map((s: { id: string }) => s.id)).toEqual([f.ravi.id]);
    }
  });

  it("never returns another school's student of the same name", async () => {
    who.current = await currentFor(other.school.id, other.principal.id);
    const body = await (await search.GET(new Request("http://localhost/api/v1/search?q=Ravi%20Kumar"))).json();
    expect(body.students.map((s: { id: string }) => s.id)).toEqual([other.ravi.id]);
  });

  it("still stops a person after 120 searches in a minute", async () => {
    const u = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["principal"] }] });
    who.current = await currentFor(f.school.id, u.id);
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await search.GET(new Request("http://localhost/api/v1/search?q=a"))).status;
    expect(last).toBe(429);
  }, 60_000);
});

describe("Search box parents and receipts (PLATFORM-08)", () => {
  type Hit = { id: string; name: string; sub: string; href: string };
  const find = async (q: string) => (await search.GET(new Request(`http://localhost/api/v1/search?q=${encodeURIComponent(q)}`))).json() as Promise<{ parents: Hit[]; receipts: Hit[] }>;

  it("finds a parent by name, with the children's names, and links to the parent's page", async () => {
    who.current = await currentFor(f.school.id, f.principal.id);
    const body = await find("Srinivas");
    expect(body.parents.map((p) => p.id)).toEqual([f.ravi.guardian.id]);
    expect(body.parents[0].sub).toContain("Ravi Kumar");
    expect(body.parents[0].href).toBe(`/student-management/guardians/${f.ravi.guardian.id}`);
  });

  it("finds a fee receipt by its number, for people who see fees, and never another school's", async () => {
    const open = await dues(f.ctx, f.sita.id);
    const paid = await collect(f.ctx, { studentId: f.sita.id, dueIds: [open[0].id], amountPaise: R(6000) });
    const receipt = await withSchool(f.ctx, (tx) => tx.receipt.findUniqueOrThrow({ where: { paymentId: paid.payment.id } }));
    who.current = await currentFor(f.school.id, f.accountant.id);
    const body = await find(receipt.number);
    expect(body.receipts.map((r) => r.href)).toEqual([`/fee-management/payments/${paid.payment.id}`]);
    expect(body.receipts[0].sub).toContain("Sita Rao");
    expect(body.receipts[0].sub).toContain("₹6,000");
    who.current = await currentFor(other.school.id, other.principal.id);
    expect((await find(receipt.number)).receipts.every((r) => r.href !== `/fee-management/payments/${paid.payment.id}`)).toBe(true);
  });
});

describe("Dashboard Recent payments link", () => {
  const recent = (panels: Panel[]) => panels.find((p) => p.kind === "list" && p.title === "Recent payments") as (Panel & { href?: string; linkLabel?: string }) | undefined;
  const all = (h: Awaited<ReturnType<typeof buildHome>>) => [...h.panels.first, ...h.panels.main, ...h.panels.side];

  it("sends the Accountant to the Collect Fee page, which is the module's first page", async () => {
    const home = await buildHome(await currentFor(f.school.id, f.accountant.id), { now: new Date() });
    const p = recent(all(home));
    expect(p?.href).toBe("/fee-management");
    expect(p?.linkLabel).toBe("Collect fee");
  });

  it("sends the Principal to the Fee Dashboard: collecting is not the Principal's work", async () => {
    const home = await buildHome(await currentFor(f.school.id, f.principal.id), { now: new Date() });
    const p = recent(all(home));
    expect(p?.href).toBe("/fee-management/dashboard");
    expect(p?.linkLabel).toBe("Fee Dashboard");
  });
});
