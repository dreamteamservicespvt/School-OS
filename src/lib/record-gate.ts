// A record page whose record is not there answers HTTP 404 (QA PLATFORM-17).
//
// Every module has a loading.tsx, and Next.js starts streaming a page with 200 as
// soon as that loading screen can show. A record page that then calls notFound()
// shows "This page is not here", but the status is already 200, so monitors and
// crawlers see a success. The school layout sits above every loading.tsx, so it
// asks this list first, on a full page load only (src/proxy.ts passes the path):
// when the record does not exist in this school (row-level security hides every
// other school's rows), the layout calls notFound() before anything streams.
//
// Only a missing record is decided here. Everything else (archived records, a
// role that may not open it, a teacher's own classes) stays with the page itself.
// Where an id belongs, anything that is not an id is missing too, except the names
// of the fixed folders beside the record folder (for example /leaving/alumni);
// tests/platform/record-gate.test.ts checks those names against src/app.
import "server-only";

import type { Tx } from "./db";

export { PAGE_PATH_HEADER } from "./record-gate-header";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sel = { select: { id: true } } as const;

type Find = (tx: Tx, ids: string[]) => Promise<unknown>;
type Rule = { path: string; segments: string[]; find: Find; beside: readonly string[] };

/**
 * "student-management/students/:id" and how to find that record; ids come in the order of their ":" segments.
 * `beside`: the fixed folders next to the record folder, which are never taken for a bad id.
 */
const rule = (path: string, find: Find, beside: readonly string[] = []): Rule => ({ path, segments: path.split("/"), find, beside });

const RULES: Rule[] = [
  rule("admission-management/applications/:id", (tx, [id]) => tx.application.findFirst({ where: { id }, ...sel }), ["export", "new"]),
  rule("admission-management/decision/:id", (tx, [id]) => tx.application.findFirst({ where: { id }, ...sel })),
  rule("approvals/:id", (tx, [id]) => tx.approval.findFirst({ where: { id }, ...sel })),
  rule("attendance-management/devices/:id", (tx, [id]) => tx.attendanceDevice.findFirst({ where: { id }, ...sel }), ["qr"]),
  rule("attendance-management/devices/qr/:id", (tx, [id]) => tx.qrSession.findFirst({ where: { id }, ...sel })),
  rule("attendance-management/register/corrections/:id", (tx, [id]) => tx.attendanceCorrection.findFirst({ where: { id }, ...sel })),
  rule("communication/history/:id", (tx, [id]) => tx.message.findFirst({ where: { id }, ...sel }), ["export"]),
  rule("communication/notices/:id", (tx, [id]) => tx.notice.findFirst({ where: { id }, ...sel }), ["export", "new"]),
  rule("communication/parent-link/:id", (tx, [id]) => tx.parentLink.findFirst({ where: { id }, ...sel }), ["consent", "export", "send"]),
  rule("communication/queries/:id", (tx, [id]) => tx.query.findFirst({ where: { id }, ...sel }), ["export", "new"]),
  rule("communication/surveys/:id", (tx, [id]) => tx.survey.findFirst({ where: { id }, ...sel }), ["export", "new"]),
  rule("communication/templates/:id", (tx, [id]) => tx.template.findFirst({ where: { id }, ...sel }), ["export", "new"]),
  rule("events-calendar/events/:id", (tx, [id]) => tx.event.findFirst({ where: { id }, ...sel }), ["export"]),
  rule("events-calendar/gallery/:id", (tx, [id]) => tx.album.findFirst({ where: { id }, ...sel })),
  rule("examination-results/datesheet/:id", (tx, [id]) => tx.exam.findFirst({ where: { id }, ...sel }), ["new"]),
  rule("examination-results/marks/:entryId/:sectionId", (tx, [entryId, sectionId]) =>
    Promise.all([tx.datesheetEntry.findFirst({ where: { id: entryId }, ...sel }), tx.section.findFirst({ where: { id: sectionId }, ...sel })]).then(([e, s]) => e && s)),
  rule("fee-management/collect/:studentId", (tx, [id]) => tx.student.findFirst({ where: { id }, ...sel })),
  rule("fee-management/ledger/:studentId", (tx, [id]) => tx.student.findFirst({ where: { id }, ...sel }), ["import"]),
  rule("fee-management/dashboard/class/:sectionId", (tx, [id]) => tx.section.findFirst({ where: { id }, ...sel })),
  rule("fee-management/payments/:paymentId", (tx, [id]) => tx.payment.findFirst({ where: { id }, ...sel })),
  rule("finance-management/day-book/:entryId", (tx, [id]) => tx.dayBookEntry.findFirst({ where: { id }, ...sel }), ["export"]),
  rule("front-office/visit/:id", (tx, [id]) => tx.visitorEntry.findFirst({ where: { id }, ...sel })),
  rule("homework-learning/homework/:id", (tx, [id]) => tx.homework.findFirst({ where: { id }, ...sel })),
  rule("homework-learning/quizzes/:id", (tx, [id]) => tx.quiz.findFirst({ where: { id }, ...sel }), ["export"]),
  rule("inventory-management/assets/:id", (tx, [id]) => tx.asset.findFirst({ where: { id }, ...sel }), ["export", "import", "tags"]),
  rule("inventory-management/items/:id", (tx, [id]) => tx.item.findFirst({ where: { id }, ...sel }), ["audits", "export", "import", "movements"]),
  rule("inventory-management/items/audits/:id", (tx, [id]) => tx.stockAudit.findFirst({ where: { id }, ...sel })),
  rule("inventory-management/purchases/orders/:id", (tx, [id]) => tx.purchaseOrder.findFirst({ where: { id }, ...sel })),
  rule("library-management/books/:id", (tx, [id]) => tx.book.findFirst({ where: { id }, ...sel }), ["export", "import", "labels"]),
  rule("library-management/fines/stock/:id", (tx, [id]) => tx.stockCheckSession.findFirst({ where: { id }, ...sel })),
  rule("settings/forms-approvals/forms/:id", (tx, [id]) => tx.customForm.findFirst({ where: { id }, ...sel })),
  rule("settings/payment-gateways/:id", (tx, [id]) => tx.paymentGatewayAccount.findFirst({ where: { id }, ...sel }), ["new"]),
  rule("staff-hr-management/:staffId", (tx, [id]) => tx.staff.findFirst({ where: { id }, ...sel }), ["add", "documents", "exit", "export", "files", "id-cards", "import", "leave", "recruitment", "settings"]),
  rule("staff-hr-management/exit/:exitId", (tx, [id]) => tx.exitCase.findFirst({ where: { id }, ...sel }), ["new"]),
  rule("student-management/behaviour/:id", (tx, [id]) => tx.behaviourIncident.findFirst({ where: { id }, ...sel }), ["career", "counselling", "new"]),
  rule("student-management/behaviour/counselling/:id", (tx, [id]) => tx.counsellingCase.findFirst({ where: { id }, ...sel }), ["new"]),
  rule("student-management/certificates/:id", (tx, [id]) => tx.certificate.findFirst({ where: { id }, ...sel }), ["digilocker", "id-cards", "new", "preview", "print"]),
  rule("student-management/guardians/:id", (tx, [id]) => tx.guardian.findFirst({ where: { id }, ...sel }), ["consent", "link", "new"]),
  rule("student-management/import/:batchId", (tx, [id]) => tx.importBatch.findFirst({ where: { id }, ...sel }), ["errors", "file", "history", "template"]),
  rule("student-management/leaving/:id", (tx, [id]) => tx.leavingRequest.findFirst({ where: { id }, ...sel }), ["alumni", "left", "new"]),
  rule("student-management/leaving/alumni/:id", (tx, [id]) => tx.alumniRecord.findFirst({ where: { id }, ...sel }), ["jobs"]),
  rule("student-management/promotion/:batchId", (tx, [id]) => tx.promotionBatch.findFirst({ where: { id }, ...sel })),
  rule("student-management/students/:id", (tx, [id]) => tx.student.findFirst({ where: { id }, ...sel })),
  rule("student-management/students/:id/parents/:linkId", (tx, [id, linkId]) => tx.studentGuardian.findFirst({ where: { id: linkId, studentId: id }, ...sel })),
  rule("transport-management/routes/:id", (tx, [id]) => tx.route.findFirst({ where: { id }, ...sel })),
];

/** Every record page decided here, as written in RULES (for the test that compares them with src/app). */
export const RULE_PATHS: readonly { path: string; beside: readonly string[] }[] = RULES.map((r) => ({ path: r.path, beside: r.beside }));

type Opened = { rule: Rule; ids: string[]; notAnId: boolean };

/** The rules whose record pages this path opens (a path can open a record inside a record), with their ids. */
export function recordsIn(path: string): Opened[] {
  const parts = path.split("?")[0].split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const out: Opened[] = [];
  for (const r of RULES) {
    if (r.segments.length > parts.length) continue;
    const ids: string[] = [];
    let notAnId = false;
    const fits = r.segments.every((s, i) => {
      if (s[0] !== ":") return s === parts[i];
      ids.push(parts[i]);
      if (UUID.test(parts[i])) return true;
      // Not a fixed folder beside the record folder: it was meant as a record id, and is not one.
      if (r.beside.includes(parts[i])) return false;
      notAnId = true;
      return true;
    });
    if (fits) out.push({ rule: r, ids, notAnId });
  }
  return out;
}

/** Is a record this full page load opens missing from this school? Asked inside the school's own transaction. */
export async function recordMissing(tx: Tx, path: string | null): Promise<boolean> {
  if (!path) return false;
  const opened = recordsIn(path);
  if (opened.some((o) => o.notAnId)) return true;
  const found = await Promise.all(opened.map(({ rule: r, ids }) => r.find(tx, ids)));
  return found.some((f) => !f);
}
