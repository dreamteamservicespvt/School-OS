// A platform invoice as a GST invoice PDF from DREAM TEAM SERVICES.
// DREAM TEAM's GSTIN and address come from the environment, never the code.
import { requireConsole } from "@/lib/console/current";
import { withConsole } from "@/lib/db";
import { esc, htmlToPdf } from "@/lib/pdf";
import { formatDate, formatRupees } from "@/lib/format";
import { GST_PERCENT, INVOICE_KIND_LABEL, itemsOf } from "@/lib/console/billing";
import { logActivity } from "@/lib/console/activity";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await requireConsole();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const found = await withConsole(async (tx) => {
    const inv = await tx.platformInvoice.findUnique({ where: { id } });
    if (!inv) return null;
    const card = await tx.consoleSchool.findUnique({ where: { id: inv.forSchoolId } });
    await logActivity(tx, c.actor, { type: "export", school: card ? { id: card.id, name: card.name } : null, text: `downloaded invoice ${inv.number} as a PDF.` });
    return { inv, card };
  });
  if (!found) return new Response("Not found", { status: 404 });
  const { inv, card } = found;
  const seller = {
    name: process.env.DREAM_TEAM_LEGAL_NAME?.trim() || "DREAM TEAM SERVICES",
    address: process.env.DREAM_TEAM_ADDRESS?.trim() || "",
    gstin: process.env.DREAM_TEAM_GSTIN?.trim() || "",
  };
  const lines = itemsOf(inv);
  const half = GST_PERCENT / 2;
  const intra = (card?.state ?? "").toLowerCase() === (process.env.DREAM_TEAM_STATE?.trim().toLowerCase() || "telangana");
  const taxable = inv.subtotalPaise - inv.discountPaise;
  const status = inv.status === "PAID" ? `Paid${inv.paidAt ? ` on ${formatDate(inv.paidAt)}` : ""}` : inv.status === "CANCELLED" ? `Cancelled: ${inv.cancelReason ?? ""}` : `Due ${formatDate(inv.dueOn)}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,"Noto Sans",sans-serif;font-size:10.5pt;color:#111;margin:0}
    h1{font-size:18pt;margin:0 0 2px}.muted{color:#555}.row{display:flex;justify-content:space-between;gap:24px}
    table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border-bottom:1px solid #ccc;padding:6px 4px;text-align:left;vertical-align:top}
    th{background:#eef2ff;font-size:9.5pt}td.n,th.n{text-align:right;white-space:nowrap}.tot td{border:0;padding:3px 4px}.big td{font-weight:bold;font-size:12pt;border-top:2px solid #111}
    .stamp{display:inline-block;padding:3px 8px;border:1.5px solid #1d4ed8;color:#1d4ed8;border-radius:6px;font-weight:bold;font-size:9.5pt}
    .cancel{color:#b91c1c;border-color:#b91c1c}
  </style></head><body>
  <div class="row">
    <div><h1>Tax invoice</h1><p class="muted">${esc(INVOICE_KIND_LABEL[inv.kind] ?? inv.kind)} · School OS subscription</p></div>
    <div style="text-align:right"><b>${esc(seller.name)}</b><br>${esc(seller.address).replace(/\n/g, "<br>")}${seller.gstin ? `<br>GSTIN ${esc(seller.gstin)}` : ""}</div>
  </div>
  <div class="row" style="margin-top:16px">
    <div><p class="muted">Bill to</p><b>${esc(card?.name ?? "")}</b><br>${esc(card?.address ?? "")}${card?.city && card.address !== card.city ? `, ${esc(card.city)}` : ""}<br>${esc(card?.state ?? "")}<br>School code ${esc(card?.code ?? "")}</div>
    <div style="text-align:right">Invoice <b>${esc(inv.number)}</b><br>Date ${esc(formatDate(inv.issuedOn))}<br>${inv.periodFrom && inv.periodTo ? `Period ${esc(formatDate(inv.periodFrom))} to ${esc(formatDate(inv.periodTo))}<br>` : ""}<span class="stamp ${inv.status === "CANCELLED" ? "cancel" : ""}">${esc(status)}</span></div>
  </div>
  <table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>
    ${lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="n">${l.amountPaise < 0n ? "" : esc(l.qty.toLocaleString("en-IN"))}</td><td class="n">${l.amountPaise < 0n ? "" : esc(formatRupees(l.ratePaise))}</td><td class="n">${l.amountPaise < 0n ? "−" : ""}${esc(formatRupees(l.amountPaise < 0n ? -l.amountPaise : l.amountPaise))}</td></tr>`).join("")}
  </tbody></table>
  <table class="tot" style="width:46%;margin-left:auto">
    <tr><td>Taxable value</td><td class="n">${esc(formatRupees(taxable))}</td></tr>
    ${intra ? `<tr><td>CGST ${half}%</td><td class="n">${esc(formatRupees(inv.gstPaise / 2n))}</td></tr><tr><td>SGST ${half}%</td><td class="n">${esc(formatRupees(inv.gstPaise - inv.gstPaise / 2n))}</td></tr>` : `<tr><td>IGST ${GST_PERCENT}%</td><td class="n">${esc(formatRupees(inv.gstPaise))}</td></tr>`}
    <tr class="big"><td>Total</td><td class="n">${esc(formatRupees(inv.totalPaise))}</td></tr>
  </table>
  ${inv.razorpayLinkUrl && inv.status === "UNPAID" ? `<p style="margin-top:18px">Pay online: ${esc(inv.razorpayLinkUrl)}</p>` : ""}
  <p class="muted" style="margin-top:24px;font-size:9pt">This is a computer-made invoice and needs no signature.</p>
  </body></html>`;
  const pdf = await htmlToPdf(html, { margin: "14mm" });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${inv.number.replace(/\//g, "-")}.pdf"`, "Cache-Control": "no-store" },
  });
}
