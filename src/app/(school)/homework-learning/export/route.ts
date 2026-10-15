import type { ExportColumn } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { listHomework, type HomeworkRow } from "@/lib/homework/homework";
import { homeworkExport } from "../_lib/export";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

/** The homework list as on screen: tab, search, class, subject and the dates given. */
export async function GET(req: Request) {
  return homeworkExport(req, "homework", "thismonth", async ({ tx, s, today, g, from, to }) => {
    const tab = ["history", "archived"].includes(g("tab")) ? g("tab") : "current";
    const q = g("q").trim().toLowerCase().slice(0, 80);
    const section = UUID.test(g("section")) ? g("section") : "";
    const subject = UUID.test(g("subject")) ? g("subject") : "";
    const { all } = await listHomework(tx, s, today, { archived: tab === "archived" });
    const rows = all
      .filter((r) => !from || !to || (r.startDate >= from && r.startDate <= to))
      .filter((r) => tab === "archived" || (tab === "current" ? r.status === "Current" : r.status !== "Current"))
      .filter((r) => (!section || r.sectionId === section) && (!subject || r.subjectId === subject) && (!q || r.title.toLowerCase().includes(q)));
    const columns: ExportColumn<HomeworkRow>[] = [
      { label: "Homework", value: (r) => r.title },
      { label: "Subject", value: (r) => r.subject },
      { label: "Class", value: (r) => r.sectionLabel },
      { label: "Teacher", value: (r) => r.teacher },
      { label: "Given", value: (r) => formatDate(r.startDate) },
      { label: "Due", value: (r) => formatDate(r.dueDate) },
      { label: "Out of", value: (r) => r.maxMarks },
      { label: "Assigned", value: (r) => r.counts.assigned },
      { label: "Submitted", value: (r) => r.counts.submitted },
      { label: "Late", value: (r) => r.counts.late },
      { label: "Checked", value: (r) => r.counts.graded },
      { label: "Not handed in", value: (r) => r.counts.notIn },
      { label: "Seen by parent", value: (r) => (r.seen === null ? "" : r.seen) },
      { label: "Status", value: (r) => (r.archived ? "Archived" : r.status) },
    ];
    return { title: "Homework", rows, columns, filters: [{ current: "Current", history: "History", archived: "Archived" }[tab]!, q && `search "${q}"`].filter((x): x is string => !!x) };
  });
}
