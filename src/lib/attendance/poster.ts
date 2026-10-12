// QR attendance poster (05 §2 Devices & QR): school logo and name, the QR
// and short instructions. No personal data. Themes Ocean Blue, Royal Purple
// and Forest Green. One HTML page used for the live preview and the PDF.
import "server-only";

import type { QrSession } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { esc } from "../pdf";
import { formatDate } from "../format";
import { qrSvg } from "../documents/qr";
import { dataUri } from "../documents";
import { qrLink } from "./qr";

// Print colours: a poster is paper, so these are fixed and do not follow the screen theme.
const THEMES: Record<string, { name: string; main: string; soft: string; ink: string }> = {
  ocean: { name: "Ocean Blue", main: "#0b5cad", soft: "#e6f0fb", ink: "#082b52" },
  purple: { name: "Royal Purple", main: "#5b2a9e", soft: "#f1e9fb", ink: "#2c1250" },
  forest: { name: "Forest Green", main: "#1f6b3a", soft: "#e7f4ec", ink: "#0f3a1f" },
};

export function posterThemes() {
  return Object.entries(THEMES).map(([value, t]) => ({ value, label: t.name }));
}

export async function posterData(tx: Tx, ctx: SchoolContext, session: QrSession, origin: string, date: Date) {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId } });
  const logo = (await dataUri(tx, school.logoFileId)) ?? (school.logoUrl?.startsWith("data:image/") ? school.logoUrl : null);
  return { schoolName: school.name, logo, link: qrLink(origin, ctx.schoolId, session, date), session, date };
}

export function posterHtml(d: Awaited<ReturnType<typeof posterData>>, themeKey: string, opts: { preview?: boolean } = {}) {
  const t = THEMES[themeKey] ?? THEMES.ocean;
  const who = d.session.forWhom === "students" ? "Students" : d.session.forWhom === "both" ? "Staff and students" : "Staff";
  const validity = d.session.rotation === "fixed" ? "This code does not change." : `Valid on ${formatDate(d.date, "UTC")} only. A new poster is needed each day, or show it on a screen.`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(d.session.name)}</title><style>
    @page{size:A4;margin:0}${opts.preview ? "html{zoom:.4}body{overflow:hidden}" : ""}
    *{box-sizing:border-box}
    body{margin:0;font-family:Arial,"Noto Sans",sans-serif;color:${t.ink};background:#fff}
    .page{width:210mm;min-height:297mm;padding:16mm 14mm;display:flex;flex-direction:column;align-items:center;text-align:center;background:linear-gradient(180deg,${t.soft} 0,#fff 45%)}
    .band{width:100%;background:${t.main};color:#fff;border-radius:6mm;padding:8mm 6mm;display:flex;align-items:center;justify-content:center;gap:6mm}
    .band img{height:20mm;width:auto;background:#fff;border-radius:3mm;padding:1.5mm}
    .band h1{margin:0;font-size:22pt;line-height:1.2}
    h2{margin:12mm 0 2mm;font-size:30pt;color:${t.main}}
    .sub{margin:0;font-size:14pt}
    .qr{margin:10mm 0;padding:6mm;border:2mm solid ${t.main};border-radius:6mm;background:#fff}
    .qr svg{width:110mm;height:110mm;display:block}
    ol{margin:0;padding:0 0 0 8mm;text-align:left;font-size:14pt;line-height:1.6;max-width:150mm}
    .foot{margin-top:auto;font-size:10pt;color:#444}
  </style></head><body><div class="page">
    <div class="band">${d.logo ? `<img src="${esc(d.logo)}" alt="">` : ""}<h1>${esc(d.schoolName)}</h1></div>
    <h2>Scan to check in</h2>
    <p class="sub">${esc(who)} · ${esc(d.session.name)}</p>
    <div class="qr">${qrSvg(d.link, "110mm")}</div>
    <ol>
      <li>Open your phone camera and point it at the code.</li>
      <li>Tap the link and sign in to School OS if asked.</li>
      <li>Allow location if your phone asks. You must be at school.</li>
      <li>You will see "Checked in" with the time. Scan once a day.</li>
    </ol>
    <p class="foot">${esc(validity)}</p>
  </div></body></html>`;
}
