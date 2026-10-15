"use server";

import { optionalText, str } from "@/lib/fees/act";
import { HomeworkProblem } from "@/lib/homework/access";
import { createBoard, editBoard, HIDE_REASONS, moderate, postTopic, reply, type BoardInput } from "@/lib/homework/discussions";
import { hwForm, hwQuick } from "../_lib/action";
import { UUID } from "../_lib/page";

const uuid = (fd: FormData, key: string, what: string) => {
  const v = str(fd, key);
  if (!UUID.test(v)) throw new HomeworkProblem(`Choose the ${what}.`, key);
  return v;
};

function board(fd: FormData): BoardInput {
  const [sectionId, subjectId] = str(fd, "course").split("|");
  return {
    title: str(fd, "title"), sectionId: UUID.test(sectionId ?? "") ? sectionId : null, subjectId: UUID.test(subjectId ?? "") ? subjectId : null,
    description: optionalText(fd, "description", "Description", 600), audience: str(fd, "audience") === "staff" ? "staff" : "all",
    active: str(fd, "active") === "on", visible: true,
  };
}

export async function createBoardAction(_prev: unknown, fd: FormData) {
  return hwForm("create", fd, async ({ tx, s }) => { const b = await createBoard(tx, s, board(fd)); return { id: b.id, title: b.title, audience: b.audience }; },
    (b) => ({ message: `Board created: ${b.title}. ${b.audience === "staff" ? "Staff can see it now." : "Students of the class can see it now."}`, link: { href: `/homework-learning/discussions?board=${b.id}`, label: "Open" } }));
}

export async function editBoardAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s }) => { await editBoard(tx, s, uuid(fd, "id", "board"), board(fd)); return str(fd, "title").trim(); }, (t) => `Saved: ${t}.`);
}

/** A new topic, or a student's question. */
export async function postTopicAction(_prev: unknown, fd: FormData) {
  return hwForm("create", fd, async ({ tx, s }) => {
    const p = await postTopic(tx, s, uuid(fd, "boardId", "board"), { title: str(fd, "title"), body: str(fd, "body") });
    return { title: p.title, board: str(fd, "boardTitle") };
  }, (r) => `Posted in ${r.board}. The class can see it now.`);
}

/** A reply on a topic; the page refreshes to show it. */
export async function replyAction(topicId: string, body: string): Promise<{ problem?: string }> {
  const problem = await hwQuick("create", async ({ tx, s }) => {
    if (!UUID.test(topicId)) throw new HomeworkProblem("This topic was not found.");
    return reply(tx, s, topicId, body);
  }, () => "Reply posted.");
  return problem ? { problem } : {};
}

/** Pin, unpin, lock, unlock or unhide; board owner or Full reach only (checked in the library). */
export async function moderateAction(fd: FormData) {
  const what = str(fd, "what");
  if (!["pin", "unpin", "lock", "unlock", "unhide"].includes(what)) return "That is not something a moderator can do.";
  return hwQuick("edit", async ({ tx, s }) => moderate(tx, s, uuid(fd, "id", "post"), what as "pin" | "unpin" | "lock" | "unlock" | "unhide"),
    () => ({ pin: "Pinned to the top.", unpin: "Unpinned.", lock: "Replies are locked. Everyone can still read it.", unlock: "Replies are open again.", unhide: "The post is visible again." })[what as "pin"]);
}

/** Hide a post with a reason the class sees. Nothing is deleted, and it can be undone. */
export async function hidePostAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s }) => {
    const why = str(fd, "reason");
    if (!(HIDE_REASONS as readonly string[]).includes(why)) throw new HomeworkProblem("Choose why it is hidden.", "reason");
    return moderate(tx, s, uuid(fd, "id", "post"), "hide", why);
  }, (p) => ({ message: "Post hidden. It is kept, not deleted. You can unhide it.", undo: { kind: "homework-post-hide", id: p.id } }));
}
