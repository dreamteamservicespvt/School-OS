// Who may do what in Salary Management, checked on the server (05-roles.md,
// the approved prototype's role audit and the design thread): full for the
// Principal, School Admin and Accountant; HR's View is Generate Salary and
// Salary History with days, leave and loss of pay but never money; everyone
// else (the Vice Principal too) sees only their own slips. These call the real
// server actions and routes as each role and check nothing changed.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission, combineRoles, type PermissionMap } from "@/lib/permissions";
import { ALL_ROLE_TEMPLATES } from "@/lib/roles";
import { decide } from "@/lib/approvals";
import "@/lib/approval-handlers";
import { SALARY_PAGES, salaryLevel, salaryPageAllowed, type SalaryPageKey } from "@/lib/salary/access";
import { seesStaffPay } from "@/lib/finance/access";
import { saveStructure } from "@/lib/salary/structures";
import { calculateRun, openRun, sendForApproval } from "@/lib/salary/payroll";
import { SALARY_WIDGETS } from "@/lib/dashboard/widgets/salary";
import type { Viewer } from "@/lib/dashboard/types";
import { as, d, lines, makeSalarySchool, R, type SalaryFixture } from "./fixture";

const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", () => ({
  requireAction: async (module: string, action: string) => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    const current = { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId } };
    // The real role check runs first, exactly as in src/lib/current.ts.
    const reach = requirePermission(view.permissions, module as never, action as never);
    return { current, reach };
  },
}));

const { openMonthAction } = await import("@/app/(school)/salary-management/generate/actions");
const { giveAdvanceAction } = await import("@/app/(school)/salary-management/advances/actions");
const { slipOptionAction, statutorySwitchAction } = await import("@/app/(school)/salary-management/settings/actions");
const { sendSlipsAction } = await import("@/app/(school)/salary-management/slips/actions");
const slipPdf = await import("@/app/(school)/salary-management/slips/pdf/route");
const runExport = await import("@/app/(school)/salary-management/generate/export/route");
const report = await import("@/app/(school)/salary-management/history/report/route");
const advExport = await import("@/app/(school)/salary-management/advances/export/route");

const perms = (...keys: string[]): PermissionMap => combineRoles(keys.map((k) => ALL_ROLE_TEMPLATES.find((r) => r.key === k)!.permissions));
const pages = (...keys: string[]) => (Object.keys(SALARY_PAGES) as SalaryPageKey[]).filter((k) => salaryPageAllowed(perms(...keys), k));
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };
const asUser = (f: SalaryFixture, id: string) => { who.userId = id; who.schoolId = f.school.id; };
const get = (mod: { GET: (r: Request) => Promise<Response> }, path: string) => mod.GET(new Request(`http://localhost${path}`));

describe("Salary pages by role", () => {
  it("gives the Principal, School Admin and Accountant every page, with amounts", () => {
    for (const k of ["principal", "school-admin", "accountant"]) {
      expect(salaryLevel(perms(k))).toBe("full");
      expect(pages(k)).toEqual(Object.keys(SALARY_PAGES));
    }
  });

  it("gives HR Generate Salary and Salary History only (days, leave and loss of pay)", () => {
    expect(salaryLevel(perms("hr"))).toBe("view");
    expect(pages("hr").sort()).toEqual(["generate", "history"]);
  });

  it("gives the Vice Principal, teachers and other staff their own slips only", () => {
    for (const k of ["vice-principal", "teacher", "class-teacher", "librarian", "driver"]) {
      const level = salaryLevel(perms(k));
      if (level === null) continue;
      expect(level).toBe("own");
      expect(pages(k)).toEqual(["slips"]);
    }
    expect(salaryLevel(perms("vice-principal"))).toBe("own");
  });

  it("keeps staff pay out of the Vice Principal's Finance View", () => {
    expect(seesStaffPay(perms("vice-principal"))).toBe(false);
    expect(seesStaffPay(perms("accountant"))).toBe(true);
  });

  it("shows the salary to-do cards only to people with full Salary Management", () => {
    const v = (k: string) => ({ permissions: perms(k) }) as Viewer;
    for (const w of SALARY_WIDGETS.filter((x) => x.allowed)) {
      expect(w.allowed!(v("accountant")), w.id).toBe(true);
      expect(w.allowed!(v("hr")), w.id).toBe(false);
      expect(w.allowed!(v("vice-principal")), w.id).toBe(false);
      expect(w.allowed!(v("teacher")), w.id).toBe(false);
    }
  });
});

describe("Salary on the server", () => {
  let f: SalaryFixture;
  const today = d("2026-10-13");
  const sep = d("2026-09-01");
  let runId = "";
  let slipA = "";
  let slipB = "";

  beforeAll(async () => {
    f = await makeSalarySchool("Salary Roles School");
    const acc = as(f, f.accountant.id);
    await withSchool(acc, async (tx) => {
      await saveStructure(tx, acc, { staffId: f.staffA.id, effectiveFrom: d("2026-04-01"), lines: lines(22000, 8000), pfApplies: true, esiApplies: true, tdsPaise: R(0), reason: null });
      await saveStructure(tx, acc, { staffId: f.staffB.id, effectiveFrom: d("2026-04-01"), lines: lines(12000, 6000), pfApplies: true, esiApplies: true, tdsPaise: R(0), reason: null });
      await tx.role.updateMany({ where: { key: { in: ["class-teacher", "hr", "teacher"] } }, data: { isEnabled: true } });
    });
    const run = await withSchool(acc, (tx) => openRun(tx, acc, { campusId: f.school.campus.id, month: sep, today }));
    runId = run.id;
    await withSchool(acc, (tx) => calculateRun(tx, acc, runId, today));
    const sent = await withSchool(acc, (tx) => sendForApproval(tx, acc, runId));
    await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), sent.approvalId!, "approve", null));
    const slips = await withSchool(acc, (tx) => tx.payslip.findMany({ where: { runId } }));
    slipA = slips.find((s) => s.staffId === f.staffA.id)!.id;
    slipB = slips.find((s) => s.staffId === f.staffB.id)!.id;
  });

  const octRuns = () => withSchool(as(f, null), (tx) => tx.payrollRun.count({ where: { month: d("2026-10-01") } }));

  it("refuses a teacher, HR and the Vice Principal every change, and nothing changes", async () => {
    for (const user of [f.teacherA, f.hrLogin, f.vp]) {
      asUser(f, user.id);
      const open = await openMonthAction(null, form({ month: "2026-10", campusId: f.school.campus.id }));
      expect(open?.ok, user.id).toBe(false);
      const adv = await giveAdvanceAction(null, form({ staffId: f.staffA.id, type: "ADVANCE", amount: "5000", installment: "5000", from: "2026-11", reason: "Festival" }));
      expect(adv?.ok).toBe(false);
      expect((await slipOptionAction(null, form({ key: "slipEmail", on: "1" })))?.ok).toBe(false);
      expect((await statutorySwitchAction(null, form({ field: "pfOn", on: "0" })))?.ok).toBe(false);
      expect((await sendSlipsAction(null, form({ ids: slipA, how: "app" })))?.ok).toBe(false);
    }
    expect(await octRuns()).toBe(0);
    await withSchool(as(f, null), async (tx) => {
      expect(await tx.salaryAdvance.count()).toBe(0);
      expect((await tx.salarySetting.findFirstOrThrow()).slipEmail).toBe(false);
      expect(await tx.payslip.count({ where: { status: "SENT" } })).toBe(0);
    });
  });

  it("lets the Accountant open the month", async () => {
    asUser(f, f.accountant.id);
    const r = await openMonthAction(null, form({ month: "2026-10", campusId: f.school.campus.id }));
    expect(r?.ok).toBe(true);
    expect(await octRuns()).toBe(1);
  });

  it("gives a person their own slip and refuses anyone else's, at the query", async () => {
    asUser(f, f.teacherA.id);
    const own = await get(slipPdf, `/salary-management/slips/pdf?ids=${slipA}`);
    expect(own.status).toBe(200);
    expect(own.headers.get("Content-Type")).toBe("application/pdf");
    const other = await get(slipPdf, `/salary-management/slips/pdf?ids=${slipB}`);
    expect(other.status).toBe(403);
    // Both asked at once: only their own comes back, marked downloaded.
    const both = await get(slipPdf, `/salary-management/slips/pdf?ids=${slipA},${slipB}`);
    expect(both.status).toBe(200);
    const status = await withSchool(as(f, null), (tx) => tx.payslip.findMany({ where: { id: { in: [slipA, slipB] } }, select: { id: true, status: true } }));
    expect(status.find((s) => s.id === slipA)!.status).toBe("DOWNLOADED");
    expect(status.find((s) => s.id === slipB)!.status).toBe("MADE");
  }, 60_000); // Two PDFs are drawn; the first loads the fonts, which is slow on CI runners.

  it("exports days, leave and loss of pay to HR, never amounts", async () => {
    asUser(f, f.hrLogin.id);
    const res = await get(runExport, `/salary-management/generate/export?run=${runId}&format=csv`);
    expect(res.status).toBe(200);
    const head = (await res.text()).split("\n").find((l) => l.includes("Staff ID")) ?? "";
    expect(head).toContain("Loss of pay days");
    for (const word of ["Gross", "Net", "PF", "TDS", "Employer"]) expect(head).not.toContain(word);
    expect((await get(report, "/salary-management/history/report?kind=summary&format=csv")).status).toBe(403);
    expect((await get(report, "/salary-management/history/report?kind=days&format=csv")).status).toBe(200);
    expect((await get(advExport, "/salary-management/advances/export?format=csv")).status).toBe(403);
  });

  it("refuses the export of salary to own-reach staff and the Vice Principal", async () => {
    for (const user of [f.teacherA, f.vp]) {
      asUser(f, user.id);
      expect((await get(runExport, `/salary-management/generate/export?run=${runId}&format=csv`)).status).toBe(403);
      expect((await get(report, "/salary-management/history/report?kind=days&format=csv")).status).toBe(403);
    }
  });

  it("gives the Accountant the money reports", async () => {
    asUser(f, f.accountant.id);
    const res = await get(report, "/salary-management/history/report?kind=summary&format=csv&period=custom&from=2026-04-01&to=2027-03-31");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("September 2026");
  });
});
