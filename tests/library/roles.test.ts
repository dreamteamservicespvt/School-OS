// Who may do what in Library Management, checked on the server (05-roles.md:
// Principal, School Admin and Librarian Full, Vice Principal View, everyone
// else none; and the owner's leader rules in src/lib/duty.ts): the Librarian
// does the desk work; the Principal reads every page but Members & Cards and
// reminds the librarian instead of working the desk; the School Admin reads
// the pages and changes Library Settings; the Vice Principal reads Books,
// Members & Cards and Library Reports; Teachers and the Accountant have no
// library at all. With the module switched off, everything is refused. These
// call the real server actions and export routes as each role.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { LIB_PAGES, landingPage, pageOpen } from "@/lib/library/access";
import { CATALOGUE } from "@/lib/reports/catalogue";
import { LIBRARY_WIDGETS } from "@/lib/dashboard/widgets/library";
import type { Viewer } from "@/lib/dashboard/types";
import { addTestBook, as, libFor, makeLibrarySchool, type LibFixture } from "./fixture";

const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", () => ({
  requireAction: async (module: string, action: string) => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    const current = { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId }, school: { ...view.school, timeZone: "Asia/Kolkata", name: "Library Roles School" } };
    // The real role check runs first, exactly as in src/lib/current.ts.
    const reach = requirePermission(view.permissions, module as never, action as never);
    return { current, reach };
  },
}));

const actions = await import("@/app/(school)/library-management/actions");
const booksExport = await import("@/app/(school)/library-management/books/export/route");
const membersExport = await import("@/app/(school)/library-management/members/export/route");
const historyExport = await import("@/app/(school)/library-management/history/export/route");
const finesExport = await import("@/app/(school)/library-management/fines/export/route");

const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };
const get = (mod: { GET: (r: Request) => Promise<Response> }, path: string) => mod.GET(new Request(`http://localhost${path}`));

describe("Library Management by role", () => {
  let f: LibFixture;
  let copyId = "";
  let copy2 = "";
  const asUser = (id: string) => { who.userId = id; who.schoolId = f.school.id; };

  beforeAll(async () => {
    f = await makeLibrarySchool("Library Roles School");
    const b = await addTestBook(f, "Panchatantra", 2);
    copyId = b.copies[0].id;
    copy2 = b.copies[1].id;
  });

  const modes = async (id: string) => {
    const { v } = await libFor(f, id);
    return Object.fromEntries(LIB_PAGES.map((p) => [p, v.pages[p]]));
  };

  it("opens only the pages each role works in, full or to read", async () => {
    expect(await modes(f.librarian.id)).toEqual({ issue: "full", books: "full", members: "full", fines: "full", reports: "full", settings: "full" });
    expect(await modes(f.principal.id)).toEqual({ issue: "view", books: "view", members: "hidden", fines: "view", reports: "view", settings: "view" });
    expect(await modes(f.admin.id)).toEqual({ issue: "view", books: "view", members: "view", fines: "view", reports: "view", settings: "full" });
    expect(await modes(f.vp.id)).toEqual({ issue: "hidden", books: "view", members: "view", fines: "hidden", reports: "view", settings: "hidden" });
    for (const id of [f.teacher.id, f.accountant.id, f.frontdesk.id]) {
      expect(Object.values(await modes(id)).every((m) => m === "hidden")).toBe(true);
    }
    expect(landingPage((await libFor(f, f.librarian.id)).v)).toBe("issue");
    expect(landingPage((await libFor(f, f.principal.id)).v)).toBe("issue");
    expect(landingPage((await libFor(f, f.vp.id)).v)).toBe("books");
    expect(landingPage((await libFor(f, f.teacher.id)).v)).toBeNull();
    expect(pageOpen((await libFor(f, f.principal.id)).v, "members")).toBe(false);
  });

  it("gives desk work to the Librarian only, and Remind to the leaders", async () => {
    const lib = (await libFor(f, f.librarian.id)).can;
    expect(lib).toMatchObject({ desk: true, catalogue: true, members: true, fines: true, settings: true, remind: false, export: true });
    const principal = (await libFor(f, f.principal.id)).can;
    expect(principal).toMatchObject({ desk: false, catalogue: false, members: false, fines: false, settings: false, remind: true, export: true });
    const admin = (await libFor(f, f.admin.id)).can;
    expect(admin).toMatchObject({ desk: false, settings: true, remind: true });
    const vp = (await libFor(f, f.vp.id)).can;
    expect(vp).toMatchObject({ desk: false, catalogue: false, members: false, fines: false, settings: false, remind: false });
    expect((await libFor(f, f.accountant.id)).can).toMatchObject({ desk: false, export: false });
  });

  it("lets the Librarian issue a book, and refuses the Teacher, the Accountant, the Vice Principal and the Principal on the server", async () => {
    const fd = () => form({ member: `S:${f.meena.id}`, copyId });
    asUser(f.teacher.id);
    expect(await actions.issueAction(null, fd())).toMatchObject({ ok: false, message: expect.stringMatching(/permission/i) });
    asUser(f.accountant.id);
    expect(await actions.issueAction(null, fd())).toMatchObject({ ok: false, message: expect.stringMatching(/permission/i) });
    asUser(f.vp.id);
    expect(await actions.issueAction(null, fd())).toMatchObject({ ok: false, message: expect.stringMatching(/permission/i) });
    asUser(f.principal.id);
    expect(await actions.issueAction(null, fd())).toMatchObject({ ok: false, message: "Your role cannot issue books. Ask the librarian." });
    asUser(f.librarian.id);
    const done = await actions.issueAction(null, fd());
    expect(done).toMatchObject({ ok: true, data: { title: "Panchatantra", member: "Meena Reddy" } });
    expect(await withSchool(as(f, f.librarian.id), (tx) => tx.bookIssue.count({ where: { copyId, returnedAt: null } }))).toBe(1);
    // Return and block are desk and member work too.
    asUser(f.principal.id);
    expect(await actions.returnAction(null, form({ copyId }))).toMatchObject({ ok: false, message: "Your role cannot return books. Ask the librarian." });
    expect(await actions.blockAction(null, form({ member: `S:${f.ravi.id}`, blocked: "1", reason: "Testing the block" }))).toMatchObject({ ok: false });
    asUser(f.vp.id);
    expect(await actions.blockAction(null, form({ member: `S:${f.ravi.id}`, blocked: "1", reason: "Testing the block" }))).toMatchObject({ ok: false });
    expect(await withSchool(as(f, f.librarian.id), (tx) => tx.libraryMember.count())).toBe(0);
  });

  it("lets the Principal remind the librarian, but not the Librarian or the Vice Principal", async () => {
    asUser(f.principal.id);
    expect(await actions.remindLibrarianAction(null, form({ what: "overdue" }))).toMatchObject({ ok: true });
    const note = await withSchool(as(f, f.librarian.id), (tx) => tx.notification.findFirst({ where: { userLoginId: f.librarian.id, type: "library-remind" } }));
    expect(note?.text).toMatch(/overdue library books/);
    asUser(f.librarian.id);
    expect(await actions.remindLibrarianAction(null, form({ what: "overdue" }))).toMatchObject({ ok: false });
    asUser(f.vp.id);
    expect(await actions.remindLibrarianAction(null, form({ what: "overdue" }))).toMatchObject({ ok: false });
  });

  it("lets the School Admin change categories but not the Principal", async () => {
    asUser(f.principal.id);
    expect(await actions.saveCategoryAction(null, form({ name: "Quiz books", shelf: "Q" }))).toMatchObject({ ok: false });
    asUser(f.admin.id);
    expect(await actions.saveCategoryAction(null, form({ name: "Quiz books", shelf: "Q" }))).toMatchObject({ ok: true });
  });

  it("takes the Librarian straight to the scan page of a stock check just started, and refuses the Principal", async () => {
    asUser(f.principal.id);
    expect(await actions.startStockAction(null, form({ name: "October 2026" }))).toMatchObject({ ok: false, message: "Your role cannot run stock checks. Ask the librarian." });
    asUser(f.librarian.id);
    const thrown = await actions.startStockAction(null, form({ name: "October 2026" })).then(() => null, (e: unknown) => e as { digest?: string });
    const session = await withSchool(as(f, f.librarian.id), (tx) => tx.stockCheckSession.findFirstOrThrow({ where: { status: "OPEN" } }));
    expect(session.name).toBe("October 2026");
    expect(thrown?.digest).toContain(`/library-management/fines/stock/${session.id}`);
    // A second one while it is open is refused in plain words, with no redirect.
    expect(await actions.startStockAction(null, form({ name: "Another check" }))).toMatchObject({ ok: false, message: expect.stringMatching(/still open/) });
  });

  it("exports only from pages a role reads", async () => {
    asUser(f.vp.id);
    const books = await get(booksExport, "/library-management/books/export?format=csv");
    expect(books.status).toBe(200);
    expect(await books.text()).toContain("Panchatantra");
    expect((await get(membersExport, "/library-management/members/export?format=csv")).status).toBe(200);
    expect((await get(historyExport, "/library-management/history/export?format=csv")).status).toBe(403);
    expect((await get(finesExport, "/library-management/fines/export?format=csv")).status).toBe(403);
    asUser(f.principal.id);
    expect((await get(membersExport, "/library-management/members/export?format=csv")).status).toBe(403);
    expect((await get(historyExport, "/library-management/history/export?format=csv")).status).toBe(200);
    asUser(f.teacher.id);
    expect((await get(booksExport, "/library-management/books/export?format=csv")).status).toBe(403);
    asUser(f.accountant.id);
    expect((await get(finesExport, "/library-management/fines/export?format=csv")).status).toBe(403);
  });

  it("puts the desk widgets on the Librarian's home and the overdue numbers on the leaders'", () => {
    const v = (perms: Viewer["permissions"], roles: string[]) => ({ permissions: perms, roles: roles.map((key) => ({ key })), user: { id: "x" } }) as unknown as Viewer;
    const full = { "library-management": { see: "all", change: "all" } } as unknown as Viewer["permissions"];
    const desk = LIBRARY_WIDGETS.filter((w) => w.homes?.includes("librarian") && !w.homes?.includes("leader"));
    expect(desk.length).toBeGreaterThan(0);
    for (const w of desk) {
      expect(w.allowed!(v(full, ["librarian"])), w.id).toBe(true);
      expect(w.allowed!(v(full, ["principal"])), w.id).toBe(false);
    }
    const watch = LIBRARY_WIDGETS.find((w) => w.id === "library.overdue")!;
    expect(watch.allowed ? watch.allowed(v(full, ["principal"])) : true).toBe(true);
  });

  it("lists the library reports in the Reports & Analytics catalogue", () => {
    const keys = CATALOGUE.filter((e) => e.category === "Library").map((e) => e.key);
    expect(keys).toEqual(expect.arrayContaining(["lib-issued", "lib-overdue", "lib-popular", "lib-fines", "lib-stock"]));
  });

  it("refuses everything when the school switches the library off", async () => {
    await withSchool({ schoolId: f.school.id, userId: null }, (tx) => tx.schoolModule.update({ where: { schoolId_moduleKey: { schoolId: f.school.id, moduleKey: "library-management" } }, data: { isOn: false } }));
    asUser(f.librarian.id);
    expect(await actions.issueAction(null, form({ member: `S:${f.ravi.id}`, copyId: copy2 }))).toMatchObject({ ok: false, message: expect.stringMatching(/switched off/) });
    expect((await get(booksExport, "/library-management/books/export?format=csv")).status).toBe(404);
    await withSchool({ schoolId: f.school.id, userId: null }, (tx) => tx.schoolModule.update({ where: { schoolId_moduleKey: { schoolId: f.school.id, moduleKey: "library-management" } }, data: { isOn: true } }));
  });
});
