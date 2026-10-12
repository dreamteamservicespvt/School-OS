// Communication and Settings on the Dashboard: parent queries waiting for
// the person, overdue queries, new app messages, and alerts that a
// messaging channel or payment gateway needs fixing (01 §2 "Alerts").
import "server-only";

import { readListParams } from "../../list";
import { queryWhere } from "../../communication/queries";
import { QUERY_FILTERS, queryListWhere } from "../../communication/query-list";
import { channelSetups } from "../../messaging/channels";
import { creditBalances } from "../../messaging/credits";
import { n, plural, reach, someNames } from "../common";
import type { AttentionItem, DashContext, Widget } from "../types";

const QUERIES = "/communication/queries";

/** The same count Feedback & Queries shows with these filters. */
async function queryCount(c: DashContext, filters: Record<string, string>) {
  const r = reach(c.viewer, "communication") === "all" ? "all" : "own";
  const where = queryListWhere(await queryWhere(c.tx, c.viewer.ctx, r), c.viewer.ctx, readListParams(filters, QUERY_FILTERS), c.now);
  return { count: await c.tx.query.count({ where }), where };
}

const parentMessages: Widget<"band"> = {
  id: "communication.my-queries",
  module: "communication",
  kind: "band",
  homes: ["teacher", "class-teacher", "accountant", "receptionist", "transport", "academic-head", "office", "exam", "admission", "counsellor"],
  async load(c) {
    const { count, where } = await queryCount(c, { owner: "me" });
    const overdue = count ? await c.tx.query.count({ where: { AND: [where, { dueBy: { lt: c.now } }] } }) : 0;
    return { id: "communication.my-queries", label: "Parent messages", big: n(count), foot: count ? (overdue ? `${n(overdue)} past the reply time` : "Waiting for your reply") : "Nothing waiting for you", href: `${QUERIES}?owner=me` };
  },
};

const overdueQueries: Widget<"attention"> = {
  id: "communication.overdue-queries",
  module: "communication",
  kind: "attention",
  homes: ["leader"],
  allowed: (v) => reach(v, "communication") === "all",
  async load(c) {
    const { count, where } = await queryCount(c, { overdue: "1" });
    if (!count) return null;
    const rows = await c.tx.query.findMany({ where, orderBy: { dueBy: "asc" }, take: 2, select: { fromName: true, number: true } });
    return {
      id: "communication.overdue-queries", tone: "warn", icon: "MessagesSquare",
      title: `${plural(count, "parent query", "parent queries")} past the reply time`,
      detail: count > 2 ? `${rows.map((r) => `${r.fromName} (${r.number})`).join(", ")} and ${count - 2} more` : someNames(rows.map((r) => `${r.fromName} (${r.number})`)),
      action: "Open", href: `${QUERIES}?overdue=1`, value: String(count),
    };
  },
};

const myOverdueQueries: Widget<"attention"> = {
  id: "communication.my-overdue-queries",
  module: "communication",
  kind: "attention",
  homes: ["teacher", "class-teacher", "accountant", "receptionist", "office", "admission", "counsellor"],
  allowed: (v) => reach(v, "communication") !== "all",
  async load(c) {
    const { count } = await queryCount(c, { owner: "me", overdue: "1" });
    if (!count) return null;
    return {
      id: "communication.my-overdue-queries", tone: "warn", icon: "MessagesSquare",
      title: `${plural(count, "parent message")} waiting past the reply time`,
      detail: "Reply, or pass it to the right person", action: "Reply", href: `${QUERIES}?owner=me&overdue=1`, value: String(count),
    };
  },
};

/** New app messages for the person (Messages, filtered to new). */
const newMessages: Widget<"band"> = {
  id: "communication.new-messages",
  module: "dashboard",
  kind: "band",
  homes: ["staff"],
  async load(c) {
    const count = await c.tx.messageRecipient.count({ where: { userLoginId: c.viewer.user.id, channel: "app", status: { in: ["SENT", "DELIVERED", "READ"] }, readAt: null } });
    return { id: "communication.new-messages", label: "New messages", big: n(count), foot: count ? "From the school, in the app" : "You are up to date", href: count ? "/messages?show=unread" : "/messages" };
  },
};

/** Settings alerts for the people who fix them: a failed channel or gateway test, or message credits running low. */
const settingsAlerts: Widget<"attention"> = {
  id: "settings.alerts",
  module: "settings",
  kind: "attention",
  homes: ["leader"],
  allowed: (v) => reach(v, "settings", "edit") === "all",
  async load(c) {
    const out: AttentionItem[] = [];
    const [channels, credits, gateways] = await Promise.all([
      channelSetups(c.tx, c.viewer.ctx),
      creditBalances(c.tx, c.viewer.ctx),
      c.tx.paymentGatewayAccount.findMany({ where: { archivedAt: null, isActive: true, lastTestOk: false }, select: { displayName: true, lastTestNote: true } }),
    ]);
    for (const g of gateways) out.push({
      id: `settings.gateway-test:${g.displayName}`, tone: "bad", icon: "CreditCard",
      title: `Payment gateway test failed: ${g.displayName}`, detail: g.lastTestNote ?? "Parents cannot pay online until it works",
      action: "Fix", href: "/settings/payment-gateways", value: "failed",
    });
    for (const ch of ["whatsapp", "sms"] as const) {
      const s = channels[ch];
      if (!s.isOn) continue;
      if (s.lastTestOk === false) out.push({
        id: `settings.channel-test:${ch}`, tone: "bad", icon: "Send",
        title: `${ch === "sms" ? "SMS" : "WhatsApp"} test message failed`, detail: s.lastTestNote ?? "Messages may not reach parents",
        action: "Fix", href: "/settings/messaging", value: "failed",
      });
      if (credits[ch] < s.lowCreditAlert) out.push({
        id: `settings.credits:${ch}`, tone: "warn", icon: "Send",
        title: `${ch === "sms" ? "SMS" : "WhatsApp"} credits below ${n(s.lowCreditAlert)}`, detail: `${n(credits[ch])} left · buy more before the next reminder`,
        action: "Add credits", href: "/settings/messaging", value: String(credits[ch]),
      });
    }
    return out;
  },
};

export const COMMUNICATION_WIDGETS: Widget[] = [parentMessages, newMessages, overdueQueries, myOverdueQueries, settingsAlerts] as Widget[];
