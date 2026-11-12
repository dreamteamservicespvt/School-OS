const ExcelJS = (await import("exceljs")).default;
for (const f of ["inv-stock", "lib-fines"]) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(`D:/all/Projects/School-OS/qa-output/layman-e/downloads/${f}.xlsx`);
  const ws = wb.worksheets[0]; const r = ws.getRow(6);
  console.log(f, r.values.slice(1).map((v, i) => `${typeof v}:${JSON.stringify(v)}:${r.getCell(i + 1).numFmt ?? ""}`).join(" | "));
}
