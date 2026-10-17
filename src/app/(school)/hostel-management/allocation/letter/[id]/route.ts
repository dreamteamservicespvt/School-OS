// The allocation letter for a resident's bed, in the school's "Letter" design
// (Settings, Document Designs), with the hostel rules printed below (15 §6:
// rules "printed on allocation"). For people who read the allocation, and a
// warden only for their own hostel.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { OPEN_LINK } from "@/lib/students/guardian-access";
import { renderDocument } from "@/lib/documents";
import { logExport } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { hostelViewer, pageOpen } from "@/lib/hostel/access";
import { myHostelIds, inScope } from "@/lib/hostel/scope";
import { hostelSettings, wardensByHostel } from "@/lib/hostel/settings";
import { studentsInfo } from "@/lib/hostel/allocation";
import { UUID_RE } from "@/lib/hostel/act";
import { MODULE, bedWords } from "@/lib/hostel/words";
import { plain } from "../../../_lib/route";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let current;
  try {
    ({ current } = await requireAction(MODULE, "print"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain("You do not have permission to print hostel letters.", 403);
    throw e;
  }
  if (!current.modulesOn.has(MODULE)) return plain("Hostel Management is switched off for this school.", 404);
  const v = hostelViewer(current);
  if (!pageOpen(v, "allocation")) return plain("You do not have permission to open Allocation.", 403);
  if (!UUID_RE.test(id)) return plain("This allocation was not found.", 404);
  return withSchool(current.ctx, async (tx) => {
    const mine = await myHostelIds(tx, current.ctx, v);
    const a = await tx.bedAllocation.findFirst({ where: { id } });
    if (!a || !inScope(mine, a.hostelId)) return plain("This allocation was not found.", 404);
    const [info, hostel, room, bed, s, wardens, guardian] = await Promise.all([
      studentsInfo(tx, current.ctx, [a.studentId]),
      tx.hostel.findFirst({ where: { id: a.hostelId } }),
      tx.hostelRoom.findFirst({ where: { id: a.roomId } }),
      tx.hostelBed.findFirst({ where: { id: a.bedId } }),
      hostelSettings(tx, current.ctx),
      wardensByHostel(tx, [a.hostelId]),
      tx.studentGuardian.findFirst({ where: { studentId: a.studentId, ...OPEN_LINK }, orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }], include: { guardian: { select: { name: true, address: true } } } }),
    ]);
    const st = info.get(a.studentId);
    if (!st || !hostel || !room || !bed) return plain("This allocation was not found.", 404);
    // The same number every time this allocation's letter is printed.
    const letterNo = `HL-${a.startDate.getUTCFullYear()}-${a.id.slice(0, 6).toUpperCase()}`;
    const w = (wardens.get(a.hostelId) ?? []).map((x) => `${x.name} (${x.title.toLowerCase()}${x.phone ? `, ${x.phone}` : ""})`).join(", ");
    const rules = s.rules.trim() ? `\n\nHostel rules\n${s.rules.trim()}` : "";
    const message = `We are happy to confirm a place for ${st.name}${st.classSection ? ` of Class ${st.classSection}` : ""} (admission no. ${st.admissionNo}) in ${hostel.name}: ${bedWords(room.roomNo, bed.bedNo)}, ${room.floor} floor${room.roomType ? `, ${room.roomType}` : ""}, from ${formatDate(a.startDate, "UTC")}.${w ? `\n\nWarden: ${w}.` : ""}${rules}\n\nPlease read the rules with your child and keep this letter for reference.`;
    const doc = await renderDocument(tx, current.ctx, "letter", {
      fields: {
        letter_no: letterNo,
        recipient_name: guardian ? `${guardian.guardian.name} (parent of ${st.name})` : `The parents of ${st.name}`,
        recipient_address: guardian?.guardian.address ?? "",
        subject: `Hostel place for ${st.name}`,
        message,
      },
    });
    await logExport(tx, current.ctx, { title: `Hostel allocation letter ${letterNo}`, format: "pdf", filters: st.name, rows: 1 });
    const pdf = await doc.pdf();
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="hostel-letter-${letterNo}.pdf"`, "Cache-Control": "no-store" } });
  }, { timeout: 60_000 });
}
