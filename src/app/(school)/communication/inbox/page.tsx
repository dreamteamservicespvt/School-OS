import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, CheckCheck, CircleAlert, Inbox, Phone, Search, Settings2 } from "lucide-react";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { COMM_FEATURES } from "@/lib/communication/features";
import { canReplyFreely, inboxWhere, QUICK_REPLIES, type InboxTab } from "@/lib/communication/inbox";
import { childrenByGuardian } from "@/lib/communication/parent-link-admin";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/empty-state";
import { CommHead } from "../_components/comm-head";
import { ownerOptions } from "../queries/owners";
import { ChatButtons, Composer } from "./chat-tools";

export const metadata: Metadata = { title: "WhatsApp Inbox" };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

function when(d: Date, tz: string, now: Date) {
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(x);
  if (day(d) === day(now)) return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(d).toUpperCase();
  if (day(d) === day(new Date(now.getTime() - 86400_000))) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: tz }).format(d);
}
const clock = (d: Date, tz: string) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(d).toUpperCase();

export default async function InboxPage({ searchParams }: { searchParams: Search }) {
  const access = await commPage();
  const { current, full } = access;
  const tz = current.school.timeZone;
  const raw = await searchParams;
  const on = current.features.has(COMM_FEATURES.inbox);
  const head = (
    <CommHead access={access} page="WhatsApp Inbox" href="/communication/inbox"
      sub={full ? "All school WhatsApp chats in one place. Each staff member sees the chats given to them." : "Only chats given to you. The office can pass a chat to you."} />
  );
  if (!on) {
    return (
      <>
        {head}
        <Card><EmptyState Icon={Inbox} title="WhatsApp Inbox is switched off"
          action={full ? <ButtonLink href="/communication/settings" icon={Settings2}>Message Settings</ButtonLink> : undefined}>
          {full ? "Switch it on under Optional pages in Message Settings once WhatsApp Business is connected." : "The Principal or School Admin can switch it on."}
        </EmptyState></Card>
      </>
    );
  }

  const tab: InboxTab = full ? (one(raw.tab) === "mine" || one(raw.tab) === "none" ? (one(raw.tab) as InboxTab) : "all") : "mine";
  const q = one(raw.q).slice(0, 60);
  const chatId = /^[0-9a-f-]{36}$/.test(one(raw.chat)) ? one(raw.chat) : "";
  const now = new Date();
  const data = await withSchool(current.ctx, async (tx) => {
    const ctx = current.ctx;
    const where = inboxWhere(ctx, full, tab, q);
    const [chats, mine, all, none] = await Promise.all([
      tx.whatsappChat.findMany({ where, orderBy: { lastMessageAt: "desc" }, take: 100, include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } }),
      tx.whatsappChat.count({ where: inboxWhere(ctx, full, "mine", "") }),
      full ? tx.whatsappChat.count({ where: inboxWhere(ctx, full, "all", "") }) : 0,
      full ? tx.whatsappChat.count({ where: inboxWhere(ctx, full, "none", "") }) : 0,
    ]);
    const curId = chatId || (chats[0]?.id ?? "");
    const cur = curId ? await tx.whatsappChat.findFirst({ where: { AND: [{ id: curId }, inboxWhere(ctx, full, full ? "all" : "mine", "")] } }) : null;
    const thread = cur ? await tx.whatsappChatMessage.findMany({ where: { schoolId: ctx.schoolId, chatId: cur.id }, orderBy: { createdAt: "asc" }, take: 300 }) : [];
    const ids = [...new Set([...chats.map((c) => c.assignedToId), cur?.assignedToId, ...thread.map((m) => m.sentById)].filter(Boolean) as string[])];
    const people = await tx.userLogin.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
    let about: { lines: string[]; links: { href: string; label: string }[] } = { lines: [], links: [] };
    if (cur?.contactType === "guardian" && cur.contactId) {
      const g = await tx.guardian.findFirst({ where: { id: cur.contactId, schoolId: ctx.schoolId }, select: { relationship: true } });
      const kids = (await childrenByGuardian(tx, ctx, [cur.contactId])).get(cur.contactId) ?? [];
      about = { lines: [`${g?.relationship ?? "Parent"} of ${kids.map((k) => `${k.name}${k.classLabel ? `, ${k.classLabel}` : ""}`).join(" and ") || "no child studying now"}`], links: kids.map((k) => ({ href: `/student-management/students/${k.id}`, label: k.name })) };
    } else if (cur?.contactType === "staff" && cur.contactId) {
      const s = await tx.staff.findFirst({ where: { id: cur.contactId, schoolId: ctx.schoolId }, select: { id: true, designation: true } });
      about = { lines: [`Staff · ${s?.designation ?? "Staff"}`], links: s ? [{ href: `/staff-hr-management/${s.id}`, label: "Staff record" }] : [] };
    }
    const query = cur?.queryId ? await tx.query.findFirst({ where: { id: cur.queryId, schoolId: ctx.schoolId }, select: { id: true, number: true } }) : null;
    return { chats, counts: { mine, all, none }, cur, thread, people: new Map(people.map((p) => [p.id, p.displayName])), about, query, owners: full ? await ownerOptions(tx, ctx) : [] };
  });
  const { cur } = data;
  const name = (id: string | null) => (id ? data.people.get(id) ?? "Staff" : null);
  const href = (change: Record<string, string>) => {
    const sp = new URLSearchParams();
    const merged = { tab: full && tab !== "all" ? tab : "", q, chat: chatId, ...change };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    return `/communication/inbox${sp.toString() ? `?${sp}` : ""}`;
  };
  const showThread = Boolean(chatId);
  const open = cur ? canReplyFreely(cur, now) : false;
  const people = data.owners.filter((o) => o.value.startsWith("user:")).map((o) => ({ value: o.value.slice(5), label: o.label }));
  const tabs: [InboxTab, string][] = [["mine", `Mine · ${data.counts.mine}`], ["all", `All · ${data.counts.all}`], ["none", `Unassigned · ${data.counts.none}`]];

  return (
    <>
      {head}
      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_260px] xl:h-[660px]">
          {/* Chat list */}
          <div className={cx("flex-col min-h-0 xl:border-r border-line", showThread ? "hidden xl:flex" : "flex")}>
            <div className="p-3 flex flex-col gap-2.5 border-b border-line">
              {full ? (
                <nav aria-label="Chats" className="inline-flex p-1 rounded-xl bg-sunken gap-1 w-full">
                  {tabs.map(([t, label]) => (
                    <Link key={t} href={href({ tab: t === "all" ? "" : t, chat: "" })} aria-current={tab === t ? "page" : undefined}
                      className={cx("flex-1 h-8 px-2 rounded-lg text-[12.5px] font-semibold grid place-items-center whitespace-nowrap transition", tab === t ? "bg-surface text-ink shadow-card" : "text-ink2 hover:text-ink")}>{label}</Link>
                  ))}
                </nav>
              ) : <p className="text-[13px] font-semibold text-ink2 px-1">Assigned to me · {data.counts.mine}</p>}
              <form action="/communication/inbox" className="relative">
                {full && tab !== "all" && <input type="hidden" name="tab" value={tab} />}
                <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
                <label htmlFor="inbox-search" className="sr-only">Search chats</label>
                <input id="inbox-search" name="q" defaultValue={q} placeholder="Name or phone" className="h-11 w-full rounded-xl bg-surface border border-line pl-10 pr-3.5 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
              </form>
            </div>
            <ul className="flex-1 overflow-y-auto divide-y divide-line/70">
              {data.chats.map((c) => {
                const last = c.messages[0];
                return (
                  <li key={c.id}>
                    <Link href={href({ chat: c.id })} aria-current={cur?.id === c.id ? "true" : undefined}
                      className={cx("w-full flex items-start gap-3 px-3.5 py-3 text-left transition", cur?.id === c.id ? "bg-brand/8" : "hover:bg-sunken/60")}>
                      {c.contactType === "unknown" ? <span className="w-10 h-10 rounded-full bg-sunken text-ink3 grid place-items-center shrink-0"><Phone size={17} aria-hidden="true" /></span> : <Avatar name={c.displayName} size={40} />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2"><span className="font-semibold text-[14px] truncate flex-1">{c.displayName}</span><span className={cx("text-[11.5px] tnum shrink-0", c.unreadCount ? "text-ok font-semibold" : "text-ink3")}>{when(c.lastMessageAt, tz, now)}</span></span>
                        <span className="block text-[12.5px] text-ink3 truncate">{last ? `${last.direction === "out" ? "You: " : ""}${last.body}` : ""}</span>
                        <span className="flex items-center gap-1.5 mt-1">
                          <span className="text-[11.5px] text-ink3 truncate flex-1">{c.assignedToId ? `To ${name(c.assignedToId)}` : "Not assigned"}{c.resolvedAt ? " · resolved" : ""}</span>
                          {c.unreadCount > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-ok text-white text-[11px] font-bold grid place-items-center tnum">{c.unreadCount}</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
              {!data.chats.length && (
                <li><EmptyState bare Icon={Inbox} title={q ? "No chats match" : tab === "none" ? "Every chat has an owner" : "No chats here"}>
                  {q ? "Try another name or number." : tab === "mine" ? "Chats given to you show up here." : "Messages to the school’s WhatsApp number show up here."}
                </EmptyState></li>
              )}
            </ul>
          </div>

          {/* Thread */}
          {cur ? (
            <div className={cx("flex-col min-h-0 h-[620px] xl:h-auto", showThread ? "flex" : "hidden xl:flex")}>
              <div className="flex items-center gap-2.5 px-3 md:px-4 py-2.5 border-b border-line flex-wrap">
                <Link href={href({ chat: "" })} className="xl:hidden w-9 h-9 grid place-items-center rounded-lg text-ink2 hover:bg-sunken" aria-label="Back to chats"><ArrowLeft size={18} aria-hidden="true" /></Link>
                {cur.contactType === "unknown" ? <span className="w-9 h-9 rounded-full bg-sunken text-ink3 grid place-items-center shrink-0"><Phone size={16} aria-hidden="true" /></span> : <Avatar name={cur.displayName} size={36} />}
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{cur.displayName}</p><p className="text-[12px] text-ink3 truncate">{data.about.lines[0] ?? "Number not in School OS"}</p></div>
                {access.canChange && <ChatButtons chatId={cur.id} name={cur.displayName} assigned={Boolean(cur.assignedToId)} resolved={Boolean(cur.resolvedAt)} office={full} people={people}
                  queryHref={data.query ? `/communication/queries/${data.query.id}` : null} />}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-3 md:px-5 py-4 flex flex-col gap-2.5 bg-sunken/30">
                {data.thread.map((m, i) => {
                  const newDay = i === 0 || formatDate(m.createdAt, tz) !== formatDate(data.thread[i - 1].createdAt, tz);
                  const me = m.direction === "out";
                  return (
                    <div key={m.id} className="contents">
                      {newDay && <p className="text-center text-[11.5px] text-ink3 font-semibold">{when(m.createdAt, tz, now).includes(":") ? "Today" : when(m.createdAt, tz, now)}</p>}
                      <div className={cx("max-w-[85%] md:max-w-[75%] rounded-2xl px-3.5 py-2 shadow-card", me ? "self-end bg-brand/10 rounded-tr-md" : "self-start bg-surface rounded-tl-md border border-line/70")}>
                        {me && <p className="text-[11.5px] font-semibold text-brand mb-0.5">{name(m.sentById) ?? "School"}</p>}
                        <p className="text-[14px] leading-relaxed whitespace-pre-line break-words">{m.body}</p>
                        <p className="text-[11px] text-ink3 text-right mt-0.5 tnum flex items-center justify-end gap-1">
                          {clock(m.createdAt, tz)}
                          {me && (m.status === "READ" ? <CheckCheck size={13} className="text-info" aria-label="Read" /> : m.status === "DELIVERED" ? <CheckCheck size={13} aria-label="Delivered" /> : m.status === "FAILED" ? <CircleAlert size={13} className="text-bad" aria-label="Not sent" /> : <Check size={13} aria-label="Sent" />)}
                        </p>
                        {me && m.status === "FAILED" && m.failReason && <p className="text-[11.5px] text-bad">{m.failReason}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {access.canChange && (open ? (
                <Composer chatId={cur.id} firstName={cur.displayName.split(" ")[0]} quick={QUICK_REPLIES} canSend />
              ) : (
                <div className="p-3 border-t border-line">
                  <Banner tone="warn" title="The 24-hour reply window has closed." action={<ButtonLink href="/communication" size="sm" variant="secondary">Send Message</ButtonLink>}>WhatsApp allows only an approved template now.</Banner>
                </div>
              ))}
            </div>
          ) : (
            <div className="hidden xl:grid place-items-center text-[13.5px] text-ink3">Choose a chat.</div>
          )}

          {/* About this person */}
          {cur && (
            <aside className="hidden xl:flex flex-col border-l border-line overflow-y-auto">
              <div className="p-5 flex flex-col items-center text-center border-b border-line">
                {cur.contactType === "unknown" ? <span className="w-16 h-16 rounded-full bg-sunken text-ink3 grid place-items-center"><Phone size={26} aria-hidden="true" /></span> : <Avatar name={cur.displayName} size={64} />}
                <p className="font-semibold text-[15px] mt-2.5">{cur.displayName}</p>
                <p className="text-[12.5px] text-ink3 tnum">+91 {cur.phone}</p>
                <p className="text-[12.5px] text-ink2 mt-1.5">{data.about.lines[0] ?? "Number not in School OS"}</p>
              </div>
              <dl className="p-5 flex flex-col gap-3 text-[13px]">
                <div><dt className="text-ink3 text-[12px]">Assigned to</dt><dd className="font-semibold">{name(cur.assignedToId) ?? "Nobody yet"}</dd></div>
                <div><dt className="text-ink3 text-[12px]">First message</dt><dd className="tnum">{formatDate(cur.createdAt, tz)}</dd></div>
                <div><dt className="text-ink3 text-[12px]">Status</dt><dd>{cur.resolvedAt ? `Resolved ${formatDate(cur.resolvedAt, tz)}` : "Open"}</dd></div>
                {data.query && <div><dt className="text-ink3 text-[12px]">Query</dt><dd><Link href={`/communication/queries/${data.query.id}`} className="text-brand font-semibold hover:underline">{data.query.number}</Link></dd></div>}
              </dl>
              {data.about.links.length > 0 && (
                <ul className="px-5 pb-5 flex flex-col gap-1.5">
                  {data.about.links.map((l) => <li key={l.href}><Link href={l.href} className="text-[13px] text-brand font-semibold hover:underline">{l.label}</Link></li>)}
                </ul>
              )}
            </aside>
          )}
        </div>
      </Card>
    </>
  );
}
