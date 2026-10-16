"use server";

import { revalidatePath } from "next/cache";
import { requireCurrent } from "@/lib/current";
import { runUndo } from "@/lib/undo";
import { flash } from "@/lib/flash";
import "@/lib/undo-handlers";

export async function undoChange(kind: string, id: string) {
  const current = await requireCurrent();
  try {
    await runUndo(current, kind, id);
    await flash({ message: "Undone. Everything is back as it was.", tone: "info" });
  } catch (e) {
    await flash({ message: e instanceof Error ? e.message : "That could not be undone.", tone: "danger" });
  }
  revalidatePath("/", "layout");
}
