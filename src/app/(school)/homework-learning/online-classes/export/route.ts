import type { ExportColumn } from "@/lib/exports";
import { formatDateTime } from "@/lib/format";
import { listSessions, type SessionRow } from "@/lib/homework/online";
import { homeworkExport } from "../../_lib/export";

export const dynamic = "force-dynamic";

/** Online class attendance: each class in the dates and tab on screen, with who joined. */
export async function GET(req: Request) {
  return homeworkExport(req, "online-classes", "acyear", async ({ tx, s, g, now, from, to, current }) => {
    const past = g("tab") === "past";
    const all = await listSessions(tx, s, now, { from, to });
    const rows = all.filter((x) => (past ? !(x.word === "Scheduled" || x.word === "Live") : x.word === "Scheduled" || x.word === "Live"));
    const tz = current.school.timeZone;
    const columns: ExportColumn<SessionRow>[] = [
      { label: "Class", value: (x) => x.title },
      { label: "Subject", value: (x) => x.subject },
      { label: "Section", value: (x) => x.sectionLabel },
      { label: "Teacher", value: (x) => x.teacher },
      { label: "Starts", value: (x) => formatDateTime(x.startsAt, tz) },
      { label: "Length (min)", value: (x) => x.lengthMin },
      { label: "Status", value: (x) => x.word },
      { label: "Joined", value: (x) => x.joined ?? "" },
      { label: "Students", value: (x) => x.of },
      { label: "Recordings", value: (x) => x.recordings },
      { label: "Note", value: (x) => x.cancelNote ?? "" },
    ];
    return { title: "Online class attendance", rows, columns, filters: [past ? "Past" : "Upcoming"] };
  });
}
