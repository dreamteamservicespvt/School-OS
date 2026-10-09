// One person's data, when they ask to see it (DPDP Act 2023): a ZIP with one
// CSV per part. Encrypted ID numbers are left out. Written to the audit log.
import { getCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { makeZip } from "@/lib/zip";
import { personData, personTypesFor, type PersonType } from "@/lib/data-security/privacy";

export const dynamic = "force-dynamic";

function cell(v: unknown) {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : typeof v === "bigint" ? v.toString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: (Record<string, unknown> | null)[]) {
  const list = rows.filter((r): r is Record<string, unknown> => Boolean(r));
  const keys = [...new Set(list.flatMap((r) => Object.keys(r)))];
  return "﻿" + [keys.map(cell).join(","), ...list.map((r) => keys.map((k) => cell(r[k])).join(","))].join("\r\n") + "\r\n";
}

export async function GET(request: Request) {
  const current = await getCurrent();
  if (!current) return new Response("Sign in first.", { status: 401 });
  if (!can(current.permissions, "settings", "export")) return new Response("Your role does not allow exports. Ask your School Admin.", { status: 403 });
  const url = new URL(request.url);
  const type = url.searchParams.get("type") as PersonType;
  const id = url.searchParams.get("id") ?? "";
  if (!personTypesFor(current.permissions).includes(type)) return new Response("Your role cannot see these records.", { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("This person was not found.", { status: 404 });
  const out = await withSchool(current.ctx, async (tx) => {
    const data = await personData(tx, type, id);
    if (!data) return null;
    const entries = Object.entries(data.sections).map(([name, rows]) => ({ name: `${name}.csv`, data: Buffer.from(toCsv(rows as Record<string, unknown>[]), "utf8") }));
    entries.unshift({ name: "READ-ME.txt", data: Buffer.from(`Personal data held by ${current.school.name} about ${data.name}.\r\nPrepared ${new Date().toISOString()}. Dates are in UTC.\r\nEncrypted ID numbers (such as Aadhaar) are not included; the school office can show them on request.\r\n`, "utf8") });
    await writeAudit(tx, current.ctx, { action: "person-exported", recordType: type === "staff" ? "Staff" : type === "guardian" ? "Guardian" : "Student", recordId: id, after: { personType: type, files: entries.length } });
    return { zip: makeZip(entries), name: data.name };
  });
  if (!out) return new Response("This person was not found.", { status: 404 });
  const safe = out.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "person";
  return new Response(new Uint8Array(out.zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${safe}-data.zip"`, "Cache-Control": "no-store" },
  });
}
