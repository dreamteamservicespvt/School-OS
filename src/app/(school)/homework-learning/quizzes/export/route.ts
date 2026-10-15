import type { ExportColumn } from "@/lib/exports";
import { formatDateTime } from "@/lib/format";
import { listQuizzes, type QuizRow } from "@/lib/homework/quizzes";
import { homeworkExport } from "../../_lib/export";

export const dynamic = "force-dynamic";
const WORDS = ["Open", "Scheduled", "Draft", "Closed"];

/** Quiz results: each quiz in the dates and filter on screen, with how many took it and the average. */
export async function GET(req: Request) {
  return homeworkExport(req, "quizzes", "last30", async ({ tx, s, g, now, from, to, current }) => {
    const f = WORDS.includes(g("f")) ? g("f") : "";
    const q = g("q").trim().slice(0, 80);
    const rows = (await listQuizzes(tx, s, now, { from, to, q })).filter((z) => !f || z.word === f);
    const tz = current.school.timeZone;
    const columns: ExportColumn<QuizRow>[] = [
      { label: "Quiz", value: (z) => z.title },
      { label: "Subject", value: (z) => z.subject },
      { label: "Class", value: (z) => z.sectionLabel },
      { label: "Teacher", value: (z) => z.teacher },
      { label: "Questions", value: (z) => z.questions },
      { label: "Out of", value: (z) => z.maxScore },
      { label: "Time limit (min)", value: (z) => z.timeLimitMin ?? "" },
      { label: "Attempts allowed", value: (z) => z.attemptsAllowed },
      { label: "Taken", value: (z) => z.taken },
      { label: "Students", value: (z) => z.students },
      { label: "Average", value: (z) => z.avg ?? "" },
      { label: "Status", value: (z) => z.word },
      { label: "Opens", value: (z) => (z.opensAt ? formatDateTime(z.opensAt, tz) : "") },
      { label: "Closes", value: (z) => (z.closesAt ? formatDateTime(z.closesAt, tz) : "") },
    ];
    return { title: "Quiz results", rows, columns, filters: [f, q && `search "${q}"`].filter((x): x is string => !!x) };
  });
}
