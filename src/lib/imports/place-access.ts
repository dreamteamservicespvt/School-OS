// Who may work on a file at each place, checked on the server before any
// change. Each place keeps its own module's rules, exactly as when the
// records are typed there: Settings needs its page and the kind's own module
// (canBring), old dues need full Fee Management, the holiday list the School
// Calendar's full level, and so on.
import "server-only";

import { requireAction, type Current } from "../current";
import { requireSettingsAction } from "../settings/page-access";
import { canBring, canUndo, kindInfo, MoveInProblem } from "../move-in/service";
import { moduleImportRefusal } from "./module-import";
import { findModule } from "../modules";
import { PermissionDeniedError, reachFor } from "../permissions";
import { HrOnlyError } from "../staff/access";
import { withSchool } from "../db";
import { FullOnlyError, viewerFor } from "../admission/access";
import { libCan, libViewer } from "../library/access";
import { invCan, invViewer } from "../inventory/access";
import { hostelCan, hostelViewer } from "../hostel/access";
import { importPlace, placeHolds, type ImportPlace } from "./places";

type Need = "create" | "archive";

/** The place from a form or a bound argument, or a plain refusal. */
export function placeOf(key: unknown): ImportPlace {
  const place = importPlace(key);
  if (!place) throw new MoveInProblem("This page was not found.");
  return place;
}

/** The signed-in person, allowed this page (Settings, Data Backup & Security; or the module) for the action. */
export async function placeCurrent(place: ImportPlace, need: Need): Promise<Current> {
  if (place.key === "settings") return (await requireSettingsAction("data-security", "view")).current;
  return (await requireAction(place.module, place.undoAs ?? need)).current;
}

/** Why this person may not bring in (create) or undo (archive) this kind here, in plain words, or null when they may. */
export async function placeRefusal(current: Current, place: ImportPlace, kind: string, need: Need): Promise<string | null> {
  if (!placeHolds(place, kind)) return "This file is not brought in on this page.";
  const owner = findModule(place.module);
  if (place.key !== "settings" && owner?.optional && !current.modulesOn.has(place.module)) return `${owner.name} is switched off for this school. A School Admin can switch it on in Settings, Modules On/Off.`;
  switch (place.key) {
    case "settings":
      return (need === "create" ? canBring : canUndo)(current.permissions, kind, current.modulesOn)
        ? null
        : `Your role cannot ${need === "create" ? "add" : "undo"} ${kindInfo(kind)?.label.toLowerCase() ?? "these records"}. Ask your School Admin.`;
    case "fees":
    case "finance":
    case "events":
      return moduleImportRefusal(current, kind, need);
    case "staff":
      // HR's own work: Staff & HR full, for bringing in and for Undo alike.
      return reachFor(current.permissions, "staff-hr-management", "create") === "all" ? null : new HrOnlyError("importing staff").message;
    case "enquiries": {
      // The admission team's work (Admission Management full), for bringing in and for Undo alike.
      if (reachFor(current.permissions, "admission-management", "create") === "none") return new FullOnlyError("importing enquiries").message;
      const v = await withSchool(current.ctx, (tx) => viewerFor(tx, current.ctx, current));
      return v.change === "all" ? null : new FullOnlyError("importing enquiries").message;
    }
    case "library":
      // The librarian's work (Books full).
      return reachFor(current.permissions, "library-management", need) !== "none" && libCan(libViewer(current)).catalogue
        ? null : `Your role cannot ${need === "create" ? "import books" : "undo a book import"}. Ask the librarian.`;
    case "inventory-items":
    case "inventory-assets": {
      // Items: the store keeper (Items & Stock full). Assets: Assets full.
      const can = invCan(invViewer(current));
      const what = place.key === "inventory-items" ? "items" : "assets";
      return reachFor(current.permissions, "inventory-management", need) !== "none" && (what === "items" ? can.stock : can.assets)
        ? null : `Your role cannot ${need === "create" ? `import ${what}` : `undo an import of ${what}`}. Ask the store keeper.`;
    }
    case "hostel":
      // People who add rooms; a warden brings rooms into their own hostel only (the import's own check).
      return reachFor(current.permissions, "hostel-management", need) !== "none" && hostelCan(hostelViewer(current)).rooms
        ? null : `Your role cannot ${need === "create" ? "import rooms" : "undo a room import"}. Ask the hostel warden.`;
    case "students":
      // Student Management full (05-roles.md), as for adding or archiving a student by hand.
      return reachFor(current.permissions, "student-management", need) !== "none" && current.permissions["student-management"]?.change === "all"
        ? null : new PermissionDeniedError("student-management").message;
  }
}

/**
 * The choices made with the upload on this place's page, checked on the
 * server and kept with the file. Student Management: the section for rows
 * with no class (one of the person's own campus) and the class fee plan.
 */
export async function placeOptions(place: ImportPlace, current: Current, fd: FormData): Promise<Record<string, unknown> | undefined> {
  if (place.key !== "students") return undefined;
  const sectionId = String(fd.get("sectionId") ?? "").trim();
  if (sectionId) {
    const ok = /^[0-9a-f-]{36}$/i.test(sectionId) && await withSchool(current.ctx, (tx) => tx.section.count({
      where: { id: sectionId, archivedAt: null, ...(current.campusId ? { schoolClass: { campusId: current.campusId } } : {}) },
    }));
    if (!ok) throw new MoveInProblem("Choose the class and section again.", "sectionId");
  }
  return { sectionId: sectionId || null, applyFeePlan: fd.get("applyFeePlan") === "on" };
}

/** For server actions: the person, allowed to bring in (or undo) this kind at this place. Throws a plain refusal. */
export async function placeGuard(placeKey: unknown, kind: string, need: Need) {
  const place = placeOf(placeKey);
  const current = await placeCurrent(place, need);
  const why = await placeRefusal(current, place, kind, need);
  if (why) throw new MoveInProblem(why);
  return { current, place };
}
