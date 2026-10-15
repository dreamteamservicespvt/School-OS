// Who may see and do what in Library Management (05-roles.md: Principal,
// School Admin and Librarian Full; Vice Principal View; everyone else none)
// and the owner's rules of 13 and 14 Oct 2026 (src/lib/duty.ts): the
// Librarian does the desk work. The Principal reads every page but Members &
// Cards and gets the overdue list with Remind instead of the desk; the
// School Admin reads every page and changes Library Settings; the Vice
// Principal (View) reads Books, Members & Cards and Library Reports. A
// school-made role with Full does the work. What is hidden here is also
// refused on the server.
import { pageMode, type DutyPerson, type PageMode } from "../duty";
import type { Reach } from "../permissions";
import { MODULE } from "./words";

export const LIB_PAGES = ["issue", "books", "members", "fines", "reports", "settings"] as const;
export type LibPage = (typeof LIB_PAGES)[number];

/** View roles read these pages only (the approved design's VIEW list for the library). */
const VIEW_PAGES: readonly LibPage[] = ["books", "members", "reports"];

export type LibViewer = {
  userId: string;
  see: Reach;
  change: Reach;
  roleKeys: string[];
  pages: Record<LibPage, PageMode>;
};

type Source = { permissions: Record<string, { see: Reach; change: Reach }>; roles?: DutyPerson["roles"]; user: { id: string } };

export function libViewer(current: Source): LibViewer {
  const a = current.permissions[MODULE] ?? { see: "none", change: "none" };
  const roles = current.roles ?? [];
  const roleKeys = roles.map((r) => r.key).filter((k): k is string => Boolean(k));
  const pages = {} as Record<LibPage, PageMode>;
  for (const p of LIB_PAGES) {
    if (a.see === "none") pages[p] = "hidden";
    else if (a.change !== "all") pages[p] = VIEW_PAGES.includes(p) ? "view" : "hidden";
    else pages[p] = pageMode({ roles }, MODULE, p);
  }
  return { userId: current.user.id, see: a.see, change: a.change, roleKeys, pages };
}

export const pageOpen = (v: Pick<LibViewer, "pages">, p: LibPage) => v.pages[p] !== "hidden";

/** What each person may do, so buttons a role cannot use are hidden (and the server refuses them). */
export function libCan(v: LibViewer) {
  const full = (p: LibPage) => v.change === "all" && v.pages[p] === "full";
  return {
    /** Issue, return, renew and reserve at the desk. */
    desk: full("issue"),
    /** Add and change books and copies, labels, withdraw, mark lost or damaged, import. */
    catalogue: full("books"),
    /** Block and unblock, change a limit, print library cards. */
    members: full("members"),
    /** Waive and collect fines, stock checks. */
    fines: full("fines"),
    /** Change Library Settings. */
    settings: full("settings"),
    /** Leaders who read the desk's work remind the librarian about overdue books. */
    remind: v.change === "all" && v.pages.issue === "view",
    /** Exports for everyone who reads the whole library. */
    export: v.see === "all",
  };
}

export type LibCan = ReturnType<typeof libCan>;

/** The page a person lands on: the desk for those who work it, else the first page they read. */
export function landingPage(v: Pick<LibViewer, "pages">): LibPage | null {
  if (v.pages.issue !== "hidden") return "issue";
  return LIB_PAGES.find((p) => v.pages[p] !== "hidden") ?? null;
}
