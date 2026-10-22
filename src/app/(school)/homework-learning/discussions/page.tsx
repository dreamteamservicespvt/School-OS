import Link from "next/link";
import { Lock, MessageSquarePlus, MessagesSquare, Pencil, Pin, Plus } from "lucide-react";
import { withSchool } from "@/lib/db";
import { boardTopics, HIDE_REASONS, listBoards, mayModerate, topicThread } from "@/lib/homework/discussions";
import { inYears } from "@/lib/homework/scope";
import { momentWords, plural } from "@/lib/homework/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Banner, Empty } from "@/components/money/kit";
import { HomeworkHead } from "../_components/homework-head";
import { BackLink } from "../_components/bits";
import { BASE, homeworkGuard, one, qs, UUID, type SearchParams } from "../_lib/page";
import { BoardSheet, HideSheet, ModMenu, ReplyBox, TopicSheet } from "./sheets";
import { Words } from "@/lib/i18n/client";

export const metadata = { title: "Discussions" };

const HREF = `${BASE}/discussions`;

/** Discussions (17 §2): class boards for questions and answers; the board's owner moderates. */
export default async function DiscussionsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await homeworkGuard("discussions");
  const sp = await searchParams;
  const s = p.scope;
  const boardId = UUID.test(one(sp.board)) ? one(sp.board) : "";
  const topicId = UUID.test(one(sp.topic)) ? one(sp.topic) : "";
  const doing = one(sp.do);
  const postId = UUID.test(one(sp.id)) ? one(sp.id) : "";
  const staffPosts = p.edits("discussions");
  const canPost = p.student || staffPosts;

  const data = await withSchool(p.current.ctx, async (tx) => {
    const boards = await listBoards(tx, s);
    const pick = boards.find((b) => b.id === boardId) ?? boards[0] ?? null;
    if (!pick) return { boards, pick: null };
    const thread = topicId ? await topicThread(tx, s, topicId) : null;
    const { board, topics } = await boardTopics(tx, s, pick.id);
    const hiding = doing === "hide" && postId ? await tx.discussionPost.findFirst({ where: { id: postId, boardId: pick.id } }) : null;
    let courses: { value: string; label: string }[] = [];
    if (staffPosts && doing === "board") {
      const pairs = s.level === "full"
        // Each campus's current year; only their campus's classes when limited to one campus.
        ? await tx.teacherAllocation.findMany({ where: { academicYearId: inYears(s), archivedAt: null, ...(s.campusSections ? { sectionId: { in: s.campusSections } } : {}) }, select: { sectionId: true, subjectId: true } })
        : s.pairs;
      const uniq = [...new Map(pairs.map((x) => [`${x.sectionId}|${x.subjectId}`, x])).values()];
      const [secs, subs] = await Promise.all([
        tx.section.findMany({ where: { id: { in: uniq.map((x) => x.sectionId) } }, include: { schoolClass: { select: { name: true, sortOrder: true } } } }),
        tx.subject.findMany({ where: { id: { in: uniq.map((x) => x.subjectId) } }, select: { id: true, name: true } }),
      ]);
      const sec = new Map(secs.map((x) => [x.id, x]));
      const sub = new Map(subs.map((x) => [x.id, x.name]));
      courses = uniq.filter((x) => sec.has(x.sectionId)).map((x) => {
        const c = sec.get(x.sectionId)!;
        return { value: `${x.sectionId}|${x.subjectId}`, label: `${c.schoolClass.name.replace(/^Class\s+/i, "")} ${c.name} · ${sub.get(x.subjectId) ?? ""}`, sort: c.schoolClass.sortOrder };
      }).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label)).map(({ value, label }) => ({ value, label }));
    }
    return { boards, pick, board, topics, thread: thread && thread.board.id === pick.id ? thread : null, hiding, courses };
  });

  const label = (s.student?.label ?? "").replace(/^Class\s+/i, "");
  const sub = p.student ? `Class ${label} boards · ask and answer questions with your class` : p.own ? "Boards for your classes · pin, lock or hide posts" : "Class discussion boards for questions and answers";
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { board: data.pick?.id ?? null, ...extra });
  const head = (
    <HomeworkHead page="discussions" pageName="Discussions" sub={sub}
      viewActions={p.student && data.pick && data.pick.active ? <ButtonLink href={here({ do: "topic" })} scroll={false} variant="primary" icon={MessageSquarePlus}><Words k="Ask a question" /></ButtonLink> : undefined}
      actions={<>
        <ButtonLink href={here({ do: "board" })} scroll={false} variant="secondary" icon={Plus}><Words k="New board" /></ButtonLink>
        {data.pick?.active && <ButtonLink href={here({ do: "topic" })} scroll={false} variant="primary" icon={MessageSquarePlus}><Words k="New topic" /></ButtonLink>}
      </>} />
  );

  if (!data.pick) {
    return (
      <div>
        {head}
        <Card><Empty icon={MessagesSquare} title="No boards yet" body={staffPosts ? "Make a board for a class, so students can ask questions." : p.student ? "Your teachers have not made a board for your class yet." : "Teachers have not made boards yet."}
          action={staffPosts ? <ButtonLink href={here({ do: "board" })} scroll={false} variant="primary" icon={Plus}><Words k="New board" /></ButtonLink> : undefined} /></Card>
        {staffPosts && doing === "board" && <BoardSheet closeHref={here({ do: null })} courses={data.courses ?? []} />}
      </div>
    );
  }

  const b = data.pick;
  const canMod = !p.student && mayModerate(s, { ownerId: b.ownerId });
  const t = data.thread;
  const me = p.current.user.id;

  return (
    <div>
      {head}
      <div className="grid xl:grid-cols-[300px_minmax(0,1fr)] gap-5 lg:gap-6 items-start">
        <Card>
          <CardHeader title="Boards" icon={MessagesSquare} />
          <ul className="px-2 pb-2">
            {data.boards.map((x) => {
              const on = x.id === b.id;
              return (
                <li key={x.id}>
                  <Link href={qs(HREF, { board: x.id })} aria-current={on ? "page" : undefined} className={cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition", on ? "bg-brand/8" : "hover:bg-sunken/70")}>
                    <span className={cx("w-9 h-9 rounded-xl grid place-items-center shrink-0", on ? "bg-brand text-brandink" : "bg-sunken text-ink2")}><MessagesSquare size={17} aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <p className={cx("font-semibold text-[14px] truncate", on && "text-brand")}>{x.title}</p>
                      <p className="text-[12px] text-ink3">{plural(x.topics, "topic")} · {plural(x.posts, "post")}{!x.active ? " · not active" : ""}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          {!t ? (
            <>
              <CardHeader title={b.title} icon={MessagesSquare}
                description={`${b.audience === "staff" ? "Staff only" : "Staff and students"} · moderated by ${b.ownerName}${b.active ? "" : " · not active"}`}
                action={canMod ? <ButtonLink href={here({ do: "edit-board" })} scroll={false} size="sm" variant="ghost" icon={Pencil}><Words k="Edit board" /></ButtonLink> : undefined} />
              {b.description && <p className="px-5 -mt-2 pb-3 text-[13.5px] text-ink2">{b.description}</p>}
              {!b.active && <Banner tone="info" icon={Lock} className="mx-4 mb-3"><Words k="This board is not active. Posts can be read but not added." /></Banner>}
              {data.topics!.length === 0 ? (
                <Empty icon={MessagesSquare} title="No topics yet" body={canPost && b.active ? (p.student ? "Ask the first question." : "Start the first topic.") : "Topics show here when someone posts."} />
              ) : (
                <ul className="px-2 pb-2">
                  {data.topics!.map((x) => (
                    <li key={x.id}>
                      <div className={cx("flex items-center gap-3 px-3 py-3 rounded-xl", !x.hiddenAt && "hover:bg-sunken/70")}>
                        <Avatar name={x.authorName} size={36} />
                        {x.hiddenAt && !canMod ? (
                          <div className="min-w-0 flex-1">
                            <p className="italic text-ink3 text-[14.5px]"><Words k="Hidden by the teacher ·" /> {x.hiddenReason}</p>
                            <p className="text-[12.5px] text-ink3">{x.authorName} · {momentWords(x.createdAt, p.tz)}</p>
                          </div>
                        ) : (
                          <Link href={here({ topic: x.id })} scroll={false} className="min-w-0 flex-1 text-left">
                            <p className="font-semibold text-[14.5px] leading-snug flex items-center gap-1.5 flex-wrap">
                              {x.pinned && <Pin size={14} className="text-brand" aria-label="Pinned" />}{x.locked && <Lock size={13} className="text-ink3" aria-label="Replies locked" />}
                              {x.hiddenAt ? <span className="italic font-normal text-ink3"><Words k="Hidden ·" /> {x.hiddenReason} · {x.title}</span> : x.title}
                            </p>
                            <p className="text-[12.5px] text-ink3">{x.authorName}{x.authorIsStaff ? " · teacher" : ""} · {momentWords(x.createdAt, p.tz)} · {plural(x.replies, "reply", "replies")}</p>
                          </Link>
                        )}
                        {canMod && <ModMenu id={x.id} pinned={x.pinned} locked={x.locked} hidden={!!x.hiddenAt} hideHref={here({ do: "hide", id: x.id })} />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="p-4 md:p-5">
              <BackLink href={here()} label={b.title} />
              <div className="flex items-start gap-3">
                <Avatar name={t.topic.authorName} size={40} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-[17px] leading-snug">{t.topic.hiddenAt && !canMod ? <span className="italic font-normal text-ink3"><Words k="Hidden by the teacher ·" /> {t.topic.hiddenReason}</span> : t.topic.title}</h2>
                  <p className="text-[12.5px] text-ink3">{t.topic.authorName}{t.topic.authorIsStaff && <Pill tone="brand" className="!h-5 !text-[11px] ml-1.5"><Words k="Teacher" /></Pill>} · {momentWords(t.topic.createdAt, p.tz)}</p>
                  {t.topic.body && (!t.topic.hiddenAt || canMod) && <p className="text-[14.5px] text-ink2 mt-2 leading-relaxed whitespace-pre-line">{t.topic.body}</p>}
                </div>
                {canMod && <ModMenu id={t.topic.id} pinned={t.topic.pinned} locked={t.topic.locked} hidden={!!t.topic.hiddenAt} hideHref={here({ topic: t.topic.id, do: "hide", id: t.topic.id })} />}
              </div>
              <ul className="mt-4 flex flex-col gap-3 border-l-2 border-line pl-4 ml-5">
                {t.replies.map((r) => (
                  <li key={r.id} className="flex items-start gap-2.5">
                    <Avatar name={r.authorName} size={30} />
                    <div className="min-w-0 flex-1 rounded-2xl bg-sunken/60 px-3.5 py-2.5">
                      <p className="text-[13px] font-semibold">{r.authorName}{r.authorIsStaff && <Pill tone="brand" className="!h-5 !text-[11px] ml-1.5"><Words k="Teacher" /></Pill>} <span className="text-ink3 font-normal text-[12px]">· {momentWords(r.createdAt, p.tz)}</span></p>
                      {r.hiddenAt
                        ? <p className="text-[14px] italic text-ink3 mt-0.5"><Words k="Hidden by the teacher ·" /> {r.hiddenReason}{canMod ? ` · ${r.body}` : ""}</p>
                        : <p className="text-[14px] text-ink2 mt-0.5 whitespace-pre-line">{r.body}</p>}
                    </div>
                    {canMod && r.authorId !== me && <ModMenu reply id={r.id} pinned={false} locked={false} hidden={!!r.hiddenAt} hideHref={here({ topic: t.topic.id, do: "hide", id: r.id })} />}
                  </li>
                ))}
                {t.replies.length === 0 && <li className="text-[13.5px] text-ink3"><Words k="No replies yet." /></li>}
              </ul>
              {t.topic.locked ? <Banner tone="info" icon={Lock} className="mt-4"><Words k="Replies are locked on this topic." /></Banner>
                : t.topic.hiddenAt ? null
                  : canPost && b.active && (!p.student || b.audience === "all") && <ReplyBox topicId={t.topic.id} student={p.student} />}
            </div>
          )}
        </Card>
      </div>
      {doing === "topic" && canPost && b.active && <TopicSheet closeHref={here({ do: null })} boardId={b.id} boardTitle={b.title} student={p.student} />}
      {doing === "board" && staffPosts && <BoardSheet closeHref={here({ do: null })} courses={data.courses ?? []} />}
      {doing === "edit-board" && canMod && <BoardSheet closeHref={here({ do: null })} courses={[]} start={{ id: b.id, title: b.title, description: b.description ?? "", audience: b.audience, active: b.active, course: "" }} />}
      {doing === "hide" && canMod && data.hiding && !data.hiding.hiddenAt && (
        <HideSheet closeHref={here({ do: null, id: null, topic: topicId || null })} id={data.hiding.id} title={data.hiding.title || data.hiding.body.slice(0, 60)} by={data.hiding.authorName} reasons={HIDE_REASONS} />
      )}
    </div>
  );
}
