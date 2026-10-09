// A PDF of a design with sample data or a chosen record. GET uses the saved
// design; POST (from the editor) uses the unsaved one being edited.
import { getCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { renderDocument } from "@/lib/documents";
import { BASES, optionsSchema, type BaseKey } from "@/lib/documents/designs";
import { recordData, type RecordRef } from "@/lib/documents/records";
import { findDocType } from "@/lib/documents/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ type: string }> };

function plain(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function make(request: Request, ctx: Ctx, override: { base: BaseKey; options: unknown } | null, record: RecordRef) {
  const current = await getCurrent();
  if (!current) return plain("Sign in first.", 401);
  if (!can(current.permissions, "settings", "view")) return plain("Your role does not allow this. Ask your School Admin.", 403);
  const { type } = await ctx.params;
  const t = findDocType(type);
  if (!t) return plain("This document type is not known.", 404);
  let design: { base: BaseKey; options: ReturnType<typeof optionsSchema.parse> } | undefined;
  if (override) {
    const parsed = optionsSchema.safeParse(override.options);
    if (!parsed.success || !BASES.some((b) => b.key === override.base)) return plain("Some design choices are not right. Fix them in the editor and try again.", 400);
    design = { base: override.base, options: parsed.data };
  }
  if (record && current.permissions[record.kind === "student" ? "student-management" : "staff-hr-management"].see !== "all") record = null;
  try {
    const pdf = await withSchool(current.ctx, async (tx) => {
      const data = await recordData(tx, current.ctx, t.key, record, current.school.timeZone);
      const doc = await renderDocument(tx, current.ctx, t.key, t.family === "card" ? [data, data, data, data] : data, { design });
      return { body: await doc.pdf(), name: doc.fileName };
    }, { timeout: 60_000 });
    return new Response(new Uint8Array(pdf.body), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="preview-${pdf.name}"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "design-pdf", error: e instanceof Error ? e.message : String(e) }));
    return plain("The PDF could not be made right now. Please try again in a minute.", 503);
  }
}

export async function GET(request: Request, ctx: Ctx) {
  const url = new URL(request.url);
  const student = url.searchParams.get("student");
  const staff = url.searchParams.get("staff");
  const record: RecordRef = student ? { kind: "student", id: student } : staff ? { kind: "staff", id: staff } : null;
  return make(request, ctx, null, record);
}

export async function POST(request: Request, ctx: Ctx) {
  const fd = await request.formData();
  let options: unknown = null;
  try {
    options = JSON.parse(String(fd.get("options") ?? ""));
  } catch {
    return plain("The design could not be read. Reload the editor.", 400);
  }
  const kind = fd.get("recordKind");
  const id = String(fd.get("recordId") ?? "");
  const record: RecordRef = (kind === "student" || kind === "staff") && id ? { kind, id } : null;
  return make(request, ctx, { base: String(fd.get("base") ?? "classic") as BaseKey, options }, record);
}
