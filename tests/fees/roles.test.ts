// Who sees what in Fee and Finance Management: the per-role rules of the
// approved prototype (config.js VIEW_BY_ROLE, shell.jsx canOpen), staff pay
// left out of the Vice Principal's Finance View, nobody approving their own
// request, and go-live (records start on the go-live date).
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { ALL_ROLE_TEMPLATES } from "@/lib/roles";
import { combineRoles, type PermissionMap } from "@/lib/permissions";
import { FEE_PAGES, feeLevel, feePageAllowed, admissionOnlyFor, type FeePageKey } from "@/lib/fees/access";
import { FINANCE_PAGES, financeLevel, financePageAllowed, hiddenPayHeads, seesStaffPay, type FinancePageKey } from "@/lib/finance/access";
import { goLiveOverlap, DEFAULT_GO_LIVE } from "@/lib/finance/go-live";
import { postToDayBook, accountBook } from "@/lib/finance/daybook";
import { dayBookView } from "@/lib/finance/daybook-view";
import { expenseRows, NO_FILTER } from "@/lib/finance/expense-list";
import { recordExpense } from "@/lib/finance/expenses";
import { systemHead } from "@/lib/finance/settings";
import { decide } from "@/lib/approvals";
import "@/lib/approval-handlers";
import { makeFeeSchool, R } from "./fixture";
import { widgetsFor } from "@/lib/dashboard/compose";
import { homesFor } from "@/lib/dashboard/homes";
import { MONEY_WIDGETS } from "@/lib/dashboard/widgets/money";
import type { Viewer } from "@/lib/dashboard/types";
import { MODULES } from "@/lib/modules";
import { makeUser } from "../helpers";

const role = (key: string) => {
  const r = ALL_ROLE_TEMPLATES.find((x) => x.key === key);
  if (!r) throw new Error(`No role ${key}`);
  return r;
};
const perms = (...keys: string[]): PermissionMap => combineRoles(keys.map((k) => role(k).permissions));
const viewer = (...keys: string[]) => {
  const p = perms(...keys)["fee-management"];
  return { roleKeys: keys, see: p.see, change: p.change };
};
const feePages = (...keys: string[]) => (Object.keys(FEE_PAGES) as FeePageKey[]).filter((k) => feePageAllowed(viewer(...keys), k));
const financePages = (...keys: string[]) => (Object.keys(FINANCE_PAGES) as FinancePageKey[]).filter((k) => financePageAllowed(perms(...keys), k));

describe("Fee Management pages by role", () => {
  it("gives the Admission Counsellor one page only, Admission Fees", () => {
    expect(feeLevel(viewer("admission-counsellor"))).toBe("admission");
    expect(feePages("admission-counsellor")).toEqual(["dashboard"]);
    expect(admissionOnlyFor({ permissions: perms("admission-counsellor"), roles: [{ key: "admission-counsellor" }] })).toBe(true);
  });

  it("gives the Vice Principal (View) the Fee Dashboard, Defaulters and Fee Reports only", () => {
    expect(feeLevel(viewer("vice-principal"))).toBe("view");
    expect(feePages("vice-principal").sort()).toEqual(["dashboard", "defaulters", "documents", "reports"].sort());
    for (const k of ["collect", "payments", "ledger", "structure", "concessions", "settings"] as FeePageKey[]) expect(feePageAllowed(viewer("vice-principal"), k)).toBe(false);
  });

  it("gives the Accountant and Principal every page", () => {
    expect(feePages("accountant")).toEqual(Object.keys(FEE_PAGES));
    expect(feePages("principal")).toEqual(Object.keys(FEE_PAGES));
  });

  it("shows no fee details to roles without Fee Management, such as the Warden and Office Staff", () => {
    for (const k of ["hostel-warden", "office-staff", "teacher", "store-keeper", "librarian"]) {
      expect(feeLevel(viewer(k))).toBeNull();
      expect(feePages(k)).toEqual([]);
    }
  });

  it("lets a counsellor who is also an accountant see everything", () => {
    expect(feeLevel(viewer("admission-counsellor", "accountant"))).toBe("full");
  });
});

describe("Finance Management pages by role", () => {
  it("leaves Accounts and Finance Settings out of the Vice Principal's Finance View", () => {
    expect(financeLevel(perms("vice-principal"))).toBe("view");
    expect(financePages("vice-principal")).toEqual(["day-book", "income", "expenses", "cash-bank", "budget", "reports"]);
  });

  it("gives the Accountant every page, and the Store Keeper none", () => {
    expect(financePages("accountant")).toEqual(Object.keys(FINANCE_PAGES));
    expect(financeLevel(perms("store-keeper"))).toBeNull();
    expect(financePages("store-keeper")).toEqual([]);
  });

  it("shows staff pay only to people who see everyone's salary", () => {
    expect(seesStaffPay(perms("accountant"))).toBe(true);
    expect(seesStaffPay(perms("principal"))).toBe(true);
    expect(seesStaffPay(perms("vice-principal"))).toBe(false);
  });
});

describe("staff pay in the Vice Principal's Finance View", () => {
  it("leaves salary out of the Day Book, cash book and expenses, while the accountant sees it", async () => {
    const s = await makeFeeSchool();
    const day = new Date("2026-10-05T00:00:00Z");
    const ids: Record<string, string> = { "run-1": randomUUID(), "adv-1": randomUUID(), "e-1": randomUUID() };
    const out = await withSchool(s.ctx, async (tx) => {
      const salary = await systemHead(tx, s.ctx, "salary");
      const cash = await tx.bankAccount.findFirstOrThrow({ where: { kind: "CASH" } });
      const rent = await tx.accountHead.findFirstOrThrow({ where: { kind: "EXPENSE", systemKey: null } });
      await postToDayBook(tx, s.ctx, { date: day, direction: "OUT", amountPaise: R(30000), mode: "BANK_TRANSFER", section: "salary", headName: "Salaries", accountHeadId: salary?.id, accountId: cash.id, sourceType: "payroll", sourceId: ids["run-1"], sourceKey: "payroll:run-1", partyName: "Salary for September 2026" });
      await postToDayBook(tx, s.ctx, { date: day, direction: "OUT", amountPaise: R(2000), mode: "CASH", section: "salary-advance", headName: "Salary advance", accountId: cash.id, sourceType: "salary-advance", sourceId: ids["adv-1"], sourceKey: "salary-advance:adv-1", partyName: "Advance to a teacher" });
      await postToDayBook(tx, s.ctx, { date: day, direction: "OUT", amountPaise: R(500), mode: "CASH", section: "expense", headName: rent.name, accountHeadId: rent.id, accountId: cash.id, sourceType: "expense-payment", sourceId: ids["e-1"], sourceKey: "expense-payment:e-1", partyName: "Chalk and dusters" });
      await recordExpense(tx, s.ctx, { date: day, accountHeadId: salary!.id, amountPaise: R(1500), vendorId: null, costCentreId: null, billFileId: null, note: "Part-time salary", isVendorBill: false, billNo: null, billDueDate: null, duplicateReason: null }, null, { draft: true });
      const vp = await hiddenPayHeads(tx, perms("vice-principal"));
      const acc = await hiddenPayHeads(tx, perms("accountant"));
      const f = { from: day, to: day, classId: null, depositAccountId: null, waiting: false };
      return {
        vp, acc,
        vpBook: await dayBookView(tx, { ...f, hidePay: vp }),
        accBook: await dayBookView(tx, { ...f, hidePay: acc }),
        vpCash: await accountBook(tx, cash.id, day, day, vp),
        accCash: await accountBook(tx, cash.id, day, day, acc),
        vpExp: await expenseRows(tx, { ...NO_FILTER, hidePay: vp }),
        accExp: await expenseRows(tx, { ...NO_FILTER, hidePay: acc }),
      };
    });
    expect(out.acc).toBeNull();
    expect(out.vp).not.toBeNull();
    expect(out.accBook.rows.map((r) => r.who).sort()).toEqual(["Advance to a teacher", "Chalk and dusters", "Salary for September 2026"]);
    expect(out.vpBook.rows.map((r) => r.who)).toEqual(["Chalk and dusters"]);
    expect(out.vpBook.sections.salary).toHaveLength(0);
    expect(out.accCash.lines).toHaveLength(3);
    expect(out.vpCash.lines.map((l) => l.partyName)).toEqual(["Chalk and dusters"]);
    expect(out.vpCash.payHidden).toBe(2);
    // The balance still counts everything, so the books stay right.
    expect(out.vpCash.closing).toBe(out.accCash.closing);
    expect(out.accExp.rows.some((r) => r.note === "Part-time salary")).toBe(true);
    expect(out.vpExp.rows.some((r) => r.note === "Part-time salary")).toBe(false);
  });
});

describe("nobody approves their own request", () => {
  it("refuses the principal approving an expense they asked for", async () => {
    const s = await makeFeeSchool();
    const other = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["principal"] }], name: "Second Principal" });
    const approvalId = await withSchool(s.pctx, async (tx) => {
      const head = await tx.accountHead.findFirstOrThrow({ where: { kind: "EXPENSE", systemKey: null } });
      await tx.financeSetting.update({ where: { schoolId: s.school.id }, data: { billRequiredAbove: R(1000000) } });
      const e = await recordExpense(tx, s.pctx, { date: new Date("2026-10-05T00:00:00Z"), accountHeadId: head.id, amountPaise: R(50000), vendorId: null, costCentreId: null, billFileId: null, note: "New benches", isVendorBill: false, billNo: null, billDueDate: null, duplicateReason: "test" }, null);
      return (await tx.expense.findUniqueOrThrow({ where: { id: e.expense.id } })).approvalId;
    });
    expect(approvalId).toBeTruthy();
    await expect(withSchool(s.pctx, (tx) => decide(tx, s.pctx, approvalId!, "approve", null))).rejects.toThrow(/own request/);
    const octx = { schoolId: s.school.id, userId: other.id };
    await withSchool(octx, (tx) => decide(tx, octx, approvalId!, "approve", null));
    const e = await withSchool(s.ctx, (tx) => tx.expense.findFirstOrThrow({ where: { approvalId: approvalId! } }));
    expect(e.status).toBe("APPROVED");
  });
});

describe("go-live", () => {
  const goLive = new Date(`${DEFAULT_GO_LIVE}T00:00:00Z`);
  const d = (x: string) => new Date(`${x}T00:00:00Z`);

  it("starts on 1 April 2026 for every school unless changed", async () => {
    const s = await makeFeeSchool();
    const set = await withSchool(s.ctx, (tx) => tx.financeSetting.findUniqueOrThrow({ where: { schoolId: s.school.id } }));
    expect(set.goLiveDate.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("says a range before go-live is kept in the old software, and a range across it is partly", () => {
    expect(goLiveOverlap(goLive, d("2026-01-01"), d("2026-03-31"))).toBe("before");
    expect(goLiveOverlap(goLive, d("2026-03-01"), d("2026-04-30"))).toBe("partly");
    expect(goLiveOverlap(goLive, d("2026-04-01"), d("2026-04-30"))).toBe("after");
    expect(goLiveOverlap(goLive, null, null)).toBe("partly");
  });
});

describe("Fee and Finance cards on the Dashboard", () => {
  const dash = (key: string) => {
    const v = { permissions: perms(key), roles: [{ key }], modulesOn: new Set(MODULES.map((m) => m.key)) } as unknown as Viewer;
    return widgetsFor(v, homesFor(v), MONEY_WIDGETS).map((w) => w.id);
  };

  it("shows fee amounts only to roles with Fee Management, never to the Admission Counsellor", () => {
    expect(dash("accountant")).toEqual(expect.arrayContaining(["fees.collected-today", "fees.cheques-to-verify", "fees.defaulters", "fees.recent-payments", "finance.money-today", "finance.day-book"]));
    expect(dash("principal")).toEqual(expect.arrayContaining(["fees.collected-today", "fees.overdue", "fees.collection-chart", "finance.expenses"]));
    for (const k of ["admission-counsellor", "hostel-warden", "office-staff", "teacher", "store-keeper"]) {
      expect(dash(k).filter((id) => id.startsWith("fees.")), k).toEqual([]);
    }
  });

  it("gives the Vice Principal no card that opens a page their role cannot use", () => {
    const ids = dash("vice-principal");
    expect(ids).toContain("fees.collected-today");
    expect(ids).not.toContain("fees.recent-payments"); // each row opens the payment page
    expect(ids).not.toContain("fees.cheques-to-verify");
  });
});
