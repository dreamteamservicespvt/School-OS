// Attendance Register export (P8) and printed register (P9): the same marks
// and totals as on screen (Done when 9). Only sections the person may open.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { esc, htmlToPdf } from "@/lib/pdf";
import { formatDateTime } from "@/lib/format";
import { monthStart, todayIn } from "@/lib/staff/dates";
import { attendanceAccess } from "@/lib/attendance/access";
import { attendanceSettings } from "@/lib/attendance/settings";
import { readMonth, registerChoices, registerMonth, type RegisterRow } from "@/lib/attendance/register";
import { percentText } from "@/lib/attendance/summary";

const PRINT_COLOURS: Record<string, string> = { success: "#dcfce7", danger: "#fee2e2", warning: "#fef3c7", info: "#e0f2fe", brand: "#e0e7ff", neutral: "#f1f5f9" };

export async function GET(req: Request) {
  const { current } = await requireAction("attendance-management", "export");
  const url = new URL(req.url);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const today = todayIn(tz);
  const month = readMonth(url.searchParams.get("month")) ?? monthStart(today);
  const status = url.searchParams.get("status") || null;
  return withSchool(current.ctx, async (tx) => {
    const settings = await attendanceSettings(tx, current.ctx);
    const access = await attendanceAccess(tx, current.ctx, current, settings.lockOverrideRoles);
    const sections = await registerChoices(tx, access);
    const section = sections.find((s) => s.id === url.searchParams.get("section"));
    if (!section) return new Response("This class was not found, or it is not one of yours.", { status: 404 });
    const grid = await registerMonth(tx, current.ctx, { sectionId: section.id, month, today, status });
    if (!grid) return new Response("This class was not found.", { status: 404 });
    const letters = new Map(grid.statuses.map((s) => [s.key, s]));
    const statusName = status ? letters.get(status)?.name ?? status : null;
    const filters = [`Class ${grid.section.name}`, `Month ${grid.label}`, statusName ? `Has ${statusName.toLowerCase()}` : null].filter(Boolean).join(", ");
    const title = `Attendance Register ${grid.section.name} ${grid.label}`;
    await logExport(tx, current.ctx, { title, format, filters, rows: grid.rows.length });

    if (format === "pdf") {
      const head = grid.dates.map((d) => `<th class="${d.off ? "off" : ""}">${d.weekday.slice(0, 2)}<br>${d.day}</th>`).join("");
      const body = grid.rows.map((r) => `<tr><td class="name">${esc(r.roll ?? "")} ${esc(r.name)}</td>${grid.dates.map((d) => {
        if (d.off) return `<td class="off"></td>`;
        const st = r.days[d.iso] ? letters.get(r.days[d.iso]) : undefined;
        return `<td style="background:${st ? PRINT_COLOURS[st.tone] ?? "#fff" : "#fff"}">${esc(st?.letter ?? "")}</td>`;
      }).join("")}<td class="num">${r.summary.present}</td><td class="num">${r.summary.countedDays}</td><td class="num">${esc(percentText(r.summary.percent))}</td></tr>`).join("");
      const legend = grid.statuses.map((s) => `<span class="key" style="background:${PRINT_COLOURS[s.tone] ?? "#fff"}">${esc(s.letter)}</span> ${esc(s.name)}`).join(" &nbsp; ");
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,"Noto Sans",sans-serif;font-size:8pt;color:#111}
        h1{font-size:13pt;margin:0}.meta{color:#444;margin:3px 0 8px}
        table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:2px;text-align:center}
        th{background:#eef2ff;font-weight:600}td.name{text-align:left;white-space:nowrap;padding:2px 4px}
        .off{background:#e5e7eb}.num{text-align:right;padding:2px 4px}.key{display:inline-block;border:1px solid #bbb;padding:0 4px;font-weight:600}
        tfoot td{text-align:left;color:#444}
      </style></head><body>
      <h1>${esc(current.school.name)}: Attendance Register</h1>
      <p class="meta">${esc(grid.section.name)} · ${esc(grid.label)}${statusName ? ` · Has ${esc(statusName.toLowerCase())}` : ""} · Printed by ${esc(current.user.displayName)} on ${esc(formatDateTime(new Date(), tz))}</p>
      <p class="meta">${legend} &nbsp; <span class="key off">&nbsp;&nbsp;</span> Holiday or Sunday</p>
      <table><thead><tr><th style="text-align:left">Student</th>${head}<th>Present</th><th>Counted</th><th>%</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="${grid.dates.length + 4}">${grid.workingDays} working days. Class attendance ${esc(percentText(grid.overall.percent))}. Holidays, Sundays and unmarked days are not counted; a half day counts as half.</td></tr></tfoot></table>
      </body></html>`;
      const pdf = await htmlToPdf(html, { landscape: true, margin: "8mm" });
      const name = `attendance-register-${grid.section.name}-${grid.month}`.replace(/[^\w-]+/g, "-").toLowerCase();
      const res = exportResponse({ body: pdf, type: "application/pdf", name: `${name}.pdf` });
      if (url.searchParams.get("print") === "1") res.headers.set("Content-Disposition", `inline; filename="${name}.pdf"`);
      return res;
    }

    const columns: ExportColumn<RegisterRow>[] = [
      { label: "Roll no.", value: (r) => r.roll ?? "" },
      { label: "Student", value: (r) => r.name },
      { label: "Admission no.", value: (r) => r.admissionNo },
      ...grid.dates.map((d): ExportColumn<RegisterRow> => ({
        label: `${d.day} ${d.weekday}`,
        value: (r) => (d.off ? "-" : r.days[d.iso] ? letters.get(r.days[d.iso])?.letter ?? r.days[d.iso] : ""),
      })),
      { label: "Days present", value: (r) => r.summary.present },
      { label: "Days counted", value: (r) => r.summary.countedDays },
      { label: "Absent", value: (r) => r.summary.absent },
      { label: "Late", value: (r) => r.summary.late },
      { label: "Leave", value: (r) => r.summary.leave },
      { label: "Attendance %", value: (r) => (r.summary.percent === null ? "" : r.summary.percent) },
    ];
    const file = await buildExport(format, columns, grid.rows, {
      title, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: tz,
      filters: `${filters}. ${grid.workingDays} working days; "-" is a holiday or Sunday (not counted).`,
    });
    return exportResponse(file);
  }, { timeout: 60_000 });
}
