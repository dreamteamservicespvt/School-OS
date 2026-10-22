// React 19 resets every <form action={...}> once its server action ends. A text
// box comes back from its value, but a controlled <select value> goes back to
// its first option and a controlled tick box (<input checked>) to how it started,
// while React still holds the choice; the next save then sends "" or the wrong
// tick (QA ADMIT-01: "Class applied for" went from LKG to "Choose class").
// KeepSelect and KeepCheck (src/components/ui/keep-select.tsx) put the choice
// back. This reads every .tsx file and fails when a controlled <select> or tick
// box could sit in an action form without them:
// - inside a <form action={...}> in the same file, it must use them;
// - outside any form in its file (a field piece, or a sheet whose form is drawn
//   by a shared component), it must use them unless its component is listed
//   below as never being inside an action form (URL filters, pickers, screens
//   that save from a button);
// - inside a plain <form onSubmit> it is fine: React does not reset those.
// An uncontrolled tick box (no `checked`) inside a <form action={...}> in the
// same file goes back to its defaultChecked on the reset, so a refused save
// loses the parent's tick (QA APPLY-01: the online form's data consent came off
// after "give the previous school") or puts back one they took off. It must be
// a KeepCheck held by React, unless its defaultChecked is worked out from the
// values the save sends back (listed in FROM_VALUES_SENT_BACK).
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");

/** "file#Component": controlled boxes here are never inside an action form. */
const OUTSIDE_ACTION_FORMS: Record<string, string> = {
  // Filters and pickers that change the address, not a form.
  "src/components/ui/url-filters.tsx#UrlSelect": "URL filter",
  "src/components/ui/url-controls.tsx#UrlSelect": "URL filter",
  "src/components/ui/list-controls.tsx#UrlSelect": "URL filter",
  "src/components/ui/list-controls.tsx#UrlToggle": "URL filter",
  "src/components/ui/kit-client.tsx#UrlSelect": "URL filter",
  "src/components/money/url-filters.tsx#UrlSelect": "URL filter",
  "src/components/list/list-toolbar.tsx#ListToolbar": "URL filter",
  "src/components/list/period-filter.tsx#PeriodFilter": "URL filter",
  "src/components/attendance/month-select.tsx#MonthSelect": "URL filter",
  "src/app/(school)/attendance-management/_components/url-filters.tsx#UrlFilters": "URL filter",
  "src/app/(school)/attendance-management/_components/picker.tsx#SheetPicker": "opens a sheet by address",
  "src/app/(school)/academic-management/_components/pickers.tsx#ParamSelect": "URL filter",
  "src/app/(school)/academic-management/_components/year-bar.tsx#YearPicker": "URL filter",
  "src/app/(school)/academic-management/teacher-allocation/filters.tsx#GapsToggle": "URL filter",
  "src/app/(school)/academic-management/classes-board.tsx#ClassesBoard": "URL filter",
  "src/app/(school)/academic-management/time-table/print-picker.tsx#PrintPicker": "print choice, no form",
  "src/app/(school)/events-calendar/_components/bits.tsx#JumpSelect": "URL filter",
  "src/app/(school)/dashboard/dashboard-client.tsx#RefreshControl": "screen setting, no form",
  "src/app/(school)/settings/school-profile/campuses.tsx#Campuses": "show-archived filter, outside the campus form",
  // Import wizards: steps move on with buttons, not form actions.
  "src/app/(school)/admission-management/enquiries/import/import-steps.tsx#ImportSteps": "import wizard",
  "src/app/(school)/hostel-management/rooms/import/import-steps.tsx#ImportSteps": "import wizard",
  "src/app/(school)/inventory-management/_components/import-steps.tsx#ImportSteps": "import wizard",
  "src/app/(school)/library-management/books/import/import-steps.tsx#ImportSteps": "import wizard",
  "src/app/(school)/staff-hr-management/import/import-steps.tsx#ImportSteps": "import wizard",
  "src/components/import/module-import-steps.tsx#ModuleImportSteps": "import wizard",
  "src/components/import/ai-column-suggestions.tsx#AiColumnSuggestionCard": "import wizard",
  // Screens that save from a button (startTransition), with no action form.
  "src/app/(school)/communication/settings/settings-forms.tsx#RuleRow": "saves from a button",
  "src/app/(school)/communication/settings/settings-forms.tsx#DeliveryForm": "saves from a button",
  "src/app/(school)/communication/settings/settings-forms.tsx#QueryRulesForm": "saves from a button",
  "src/app/(school)/communication/settings/settings-forms.tsx#TopicList": "saves from a button",
  "src/app/(school)/communication/settings/settings-forms.tsx#OptOutPanel": "saves from a button",
  "src/app/(school)/communication/settings/settings-forms.tsx#ParentLinkForm": "saves from a button",
  "src/app/(school)/settings/messaging/channel-forms.tsx#ChannelCard": "saves from a button",
  "src/app/(school)/settings/messaging/channel-forms.tsx#CreditsForm": "saves from a button",
  "src/app/(school)/communication/parent-link/[id]/link-panel.tsx#LinkPanel": "saves from a button",
  "src/app/(school)/communication/parent-link/send/families-form.tsx#FamiliesForm": "saves from a button",
  "src/app/(school)/communication/queries/[id]/query-panel.tsx#QueryComposer": "saves from a button",
  "src/app/(school)/communication/queries/[id]/query-panel.tsx#QuerySide": "saves from a button",
  "src/app/(school)/admission-management/applications/online-link.tsx#OnlineLinkButton": "saves from a button",
  "src/app/(school)/examination-results/settings/settings-ui.tsx#ScaleEditor": "saves from a button",
  "src/app/(school)/examination-results/settings/settings-ui.tsx#ClassPatternsEditor": "saves from a button",
  "src/app/(school)/examination-results/settings/settings-ui.tsx#BoardsEditor": "saves from a button",
  "src/app/(school)/examination-results/report-cards/report-cards-ui.tsx#StatusBoard": "saves from a button",
  "src/app/(school)/examination-results/report-cards/report-cards-ui.tsx#GradeGrid": "saves from a button",
  "src/app/(school)/examination-results/results/results-ui.tsx#PublishFlow": "saves from a button",
  "src/app/(school)/examination-results/marks/marks-grid.tsx#MarksGrid": "saves from a button",
  "src/app/(school)/examination-results/marks/marks-grid.tsx#OneAtATime": "saves from a button",
  "src/app/(school)/attendance-management/_components/staff-sheet.tsx#StaffSheet": "saves from a button",
  "src/app/(school)/attendance-management/_components/poster-preview.tsx#PosterPreview": "screen choice, no form",
  "src/app/(school)/settings/document-designs/[type]/editor.tsx#DesignEditor": "saves from a button",
  "src/app/(school)/settings/document-designs/[type]/editor.tsx#Check": "saves from a button",
  "src/app/(school)/settings/document-designs/[type]/editor.tsx#RecordPicker": "preview choice, no form",
  "src/app/(school)/settings/data-security/switching/parts.tsx#GoLiveButton": "saves from a button",
  "src/app/(school)/settings/modules/switch-forms.tsx#TemplatePicker": "saves from a button",
  "src/app/(school)/academic-management/settings/settings-ui.tsx#OpenYear": "saves from a button",
};

/** "file#Component": uncontrolled tick boxes here start from the values the refused save sends back. */
const FROM_VALUES_SENT_BACK: Record<string, string> = {
  "src/app/(school)/settings/forms-approvals/field-editor.tsx#FieldForm": "defaultChecked from v(\"required\")",
  "src/app/(school)/settings/school-profile/documents.tsx#DocForm": "defaultChecked from state.values.visibleTo",
  "src/app/(school)/student-management/new/add-student-form.tsx#AddStudentForm": "defaultChecked from v(\"gender\")",
};

type Hit = { where: string; owner: string; kind: "select" | "tick" | "loose-tick"; form: "action" | "plain" | "none" };

function walk(dir: string, out: string[] = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const file of walk(src)) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const attr = (el: ts.JsxOpeningLikeElement, name: string) =>
      el.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === name);
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText();
        const type = attr(node, "type")?.initializer?.getText().replace(/[{}"'`]/g, "");
        const tickBox = (tag === "input" || tag === "KeepCheck") && (type === "checkbox" || type === "radio");
        const kind = tag === "select" && attr(node, "value") ? "select" : tag === "input" && attr(node, "checked") ? "tick" : tickBox && !attr(node, "checked") ? "loose-tick" : null;
        if (kind) {
          let form: Hit["form"] = "none";
          let owner = "";
          for (let p: ts.Node | undefined = ts.isJsxOpeningElement(node) ? node.parent.parent : node.parent; p; p = p.parent) {
            if (form === "none" && ts.isJsxElement(p) && p.openingElement.tagName.getText() === "form") {
              const a = attr(p.openingElement, "action");
              // action={"/path"} or action={`/path`} is an address (a GET form), not a server action.
              const e = a?.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : undefined;
              form = e && !ts.isStringLiteral(e) && !ts.isTemplateExpression(e) && !ts.isNoSubstitutionTemplateLiteral(e) ? "action" : "plain";
            }
            const name = ts.isFunctionDeclaration(p) && p.name ? p.name.text : ts.isVariableDeclaration(p) ? p.name.getText() : "";
            if (!owner && /^[A-Z]/.test(name)) owner = name;
          }
          const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          hits.push({ where: `${rel}:${line}`, owner: `${rel}#${owner}`, kind, form });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return hits;
}

describe("controlled boxes keep their choice after a refused save", () => {
  const hits = scan();

  it("finds the controlled boxes (the scan works)", () => {
    expect(hits.filter((h) => h.kind !== "loose-tick").length).toBeGreaterThan(50);
  });

  it("uses KeepSelect or KeepCheck for every controlled <select> or tick box that can sit in an action form", () => {
    const bad = hits
      .filter((h) => h.kind !== "loose-tick")
      .filter((h) => h.form === "action" || (h.form === "none" && !OUTSIDE_ACTION_FORMS[h.owner]))
      .map((h) => `${h.where} (${h.kind === "select" ? "<select value>: use KeepSelect" : "<input checked>: use KeepCheck"})`);
    expect(bad).toEqual([]);
  });

  it("keeps every tick box in an action form after a refused save (KeepCheck, or a start from the values sent back)", () => {
    const loose = hits.filter((h) => h.kind === "loose-tick" && h.form === "action");
    expect(loose.length).toBeGreaterThan(0);
    const bad = loose.filter((h) => !FROM_VALUES_SENT_BACK[h.owner]).map((h) => `${h.where} (uncontrolled tick box: hold it in React state and use KeepCheck)`);
    expect(bad).toEqual([]);
  });

  it("lists no component that has no controlled box left", () => {
    const owners = new Set(hits.filter((h) => h.kind !== "loose-tick" && h.form === "none").map((h) => h.owner));
    expect(Object.keys(OUTSIDE_ACTION_FORMS).filter((k) => !owners.has(k))).toEqual([]);
    const loose = new Set(hits.filter((h) => h.kind === "loose-tick" && h.form === "action").map((h) => h.owner));
    expect(Object.keys(FROM_VALUES_SENT_BACK).filter((k) => !loose.has(k))).toEqual([]);
  });
});
