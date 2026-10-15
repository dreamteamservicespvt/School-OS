// Sending a purchase order to the vendor by email (14 Purchases & Vendors:
// "send the PO by email or print"), through the school's own email channel
// (Settings, Messaging). The PDF is made first; the email goes outside the
// database transaction; the order is marked sent by email only when the
// provider took it. With email off or in test mode nothing is sent and the
// person is told to download the PDF instead.
import "server-only";

import { withSchool, type SchoolContext } from "../db";
import { channelSecrets, channelSetups } from "../messaging/channels";
import { providerFor } from "../messaging/providers";
import { purchaseOrderDoc } from "./documents";
import { markEmailed } from "./purchases";
import { InventoryProblem } from "./problem";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function emailPurchaseOrder(ctx: SchoolContext, orderId: string, toTyped: string | null, schoolName: string) {
  const prep = await withSchool(ctx, async (tx) => {
    const po = await purchaseOrderDoc(tx, ctx, orderId);
    if (!po) throw new InventoryProblem("This order was not found.");
    if (["WAITING", "CANCELLED"].includes(po.order.status)) throw new InventoryProblem(`${po.order.number} is ${po.order.status === "WAITING" ? "waiting for approval" : "cancelled"}. It cannot be sent.`);
    const detail = await tx.vendorDetail.findUnique({ where: { vendorId: po.order.vendorId } });
    const to = (toTyped?.trim() || detail?.email || "").toLowerCase();
    if (!to) throw new InventoryProblem(`${po.vendor?.name ?? "This vendor"} has no email address. Type one, or add it to the vendor.`, "to");
    if (!EMAIL_RE.test(to)) throw new InventoryProblem("This email address does not look right.", "to");
    const setups = await channelSetups(tx, ctx);
    const setup = setups.email;
    const secrets = setup.isOn && setup.environment === "live" ? await channelSecrets(tx, ctx, "email") : {};
    return { po, to, setup, secrets };
  }, { timeout: 60_000 });
  const { po, to, setup, secrets } = prep;
  if (!setup.isOn) throw new InventoryProblem("Email is switched off for this school (Settings, Messaging). Download the PDF and send it yourself.");
  if (setup.environment !== "live") throw new InventoryProblem("School email is in test mode, so nothing would reach the vendor. Download the PDF and send it yourself, or ask the School Admin to make email live.");
  const pdf = await po.doc.pdf();
  const result = await providerFor(setup, secrets).send({
    channel: "email", to, subject: `Purchase order ${po.order.number} from ${schoolName}`,
    text: `Dear ${po.vendor?.name ?? "Sir or Madam"},\n\nPlease find our purchase order ${po.order.number} attached. Kindly deliver the items by the date shown and send the bill with the order number.\n\nRegards,\n${schoolName}`,
    attachments: [{ filename: `${po.order.number.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`, content: pdf, contentType: "application/pdf" }],
  });
  if (!result.ok) throw new InventoryProblem(`The email did not go: ${result.reason} Download the PDF and send it yourself, or try again later.`);
  await withSchool(ctx, (tx) => markEmailed(tx, ctx, orderId, to));
  return { to, number: po.order.number };
}
