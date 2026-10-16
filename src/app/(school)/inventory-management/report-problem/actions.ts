"use server";

// Report a problem (14 Rooms, Labs & Maintenance: "any staff member, from a
// phone with a photo"). Open to every staff member of a school with
// Inventory Management on, whatever their role's Inventory permission: they
// may only raise a request and read their own and those given to them.

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/forms";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { IMAGE_TYPES, saveFile } from "@/lib/files";
import { file } from "@/lib/fees/act";
import { id, optionalId, problemState, str, text, InventoryProblem } from "@/lib/inventory/act";
import { raiseMaintenance } from "@/lib/inventory/facilities";
import { MODULE, PRIORITY } from "@/lib/inventory/words";

export async function reportProblemAction(_p: FormState<{ number: string }>, fd: FormData): Promise<FormState<{ number: string }>> {
  try {
    const current = await requireCurrent();
    if (!current.modulesOn.has(MODULE)) throw new InventoryProblem("Inventory Management is switched off for this school, so problems cannot be reported here.");
    const priority = str(fd, "priority") || "NORMAL";
    if (!(priority in PRIORITY)) throw new InventoryProblem("Choose the priority.", "priority");
    const r = await withSchool(current.ctx, async (tx) => {
      const staff = await tx.staff.findFirst({ where: { userLoginId: current.user.id, archivedAt: null }, select: { id: true } });
      if (!staff) throw new InventoryProblem("Only staff members can report a problem. Ask a staff member to report it.");
      const photo = file(fd, "photo");
      const photoFileId = photo ? (await saveFile(tx, current.ctx, { file: photo, purpose: "maintenance-photo", allowed: IMAGE_TYPES, maxImageWidth: 1600 })).id : null;
      return raiseMaintenance(tx, current.ctx, { roomId: id(fd, "placeId", "place"), assetId: optionalId(fd, "assetId"), problem: text(fd, "problem", "Problem", { min: 5, max: 500 }), photoFileId, priority: priority as "NORMAL" });
    }, { timeout: 60_000 });
    const message = `${r.request.number} sent. The store keeper is told; you can follow it here.`;
    await flash({ message });
    revalidatePath("/", "layout");
    return { ok: true, message, data: { number: r.request.number } };
  } catch (e) {
    return problemState(e, fd) as FormState<{ number: string }>;
  }
}
