// Excel downloads (layman tests LE5, LC11): quantities, marks, rupee amounts and
// percentages are numbers Excel can add up and sort, shown as they were on screen;
// phone numbers, card numbers and codes stay text (leading zeros kept).
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildExport, cellKind, cellValue } from "@/lib/exports";

type Row = { name: string; qty: string; value: string; fine: string; pct: string; phone: string; acc: string; marks: string };
const rows: Row[] = [
  { name: "Chalk", qty: "55", value: "₹14,300", fine: "₹260.50", pct: "87.5%", phone: "9876543210", acc: "00392", marks: "48 / 125" },
  { name: "Duster", qty: "1,200", value: "₹1,23,456", fine: "—", pct: "100%", phone: "9000000001", acc: "00400", marks: "12 / 125" },
  { name: "Ink", qty: "0", value: "-₹150", fine: "₹0", pct: "0%", phone: "", acc: "01234", marks: "" },
];
const cols = [
  { label: "Name", value: (r: Row) => r.name },
  { label: "Quantity", value: (r: Row) => r.qty },
  { label: "Value", value: (r: Row) => r.value },
  { label: "Fine", value: (r: Row) => r.fine },
  { label: "Present", value: (r: Row) => r.pct },
  { label: "Phone", value: (r: Row) => r.phone },
  { label: "Accession no.", value: (r: Row) => r.acc },
  { label: "Total", value: (r: Row) => r.marks },
];

describe("Excel cells", () => {
  it("are numbers with a format for amounts, and text for names and numbers that are names", async () => {
    const file = await buildExport("xlsx", cols, rows, { title: "Stock", schoolName: "Test School", filters: "", exportedBy: "Admin", timeZone: "Asia/Kolkata" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.body as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const at = (r: number, c: number) => ws.getRow(5 + r).getCell(c);
    expect(at(1, 1).value).toBe("Chalk");
    expect([at(1, 2).value, at(2, 2).value, at(3, 2).value]).toEqual([55, 1200, 0]);
    expect(at(2, 2).numFmt).toBe("#,##0");
    expect([at(1, 3).value, at(2, 3).value, at(3, 3).value]).toEqual([14300, 123456, -150]);
    expect(at(1, 3).numFmt).toContain('"₹"');
    expect(at(1, 4).value).toBe(260.5);
    expect(at(1, 4).numFmt).toContain(".00");
    expect(at(2, 4).value).toBe("—");
    expect([at(1, 5).value, at(2, 5).value, at(3, 5).value]).toEqual([0.875, 1, 0]);
    expect(at(1, 5).numFmt).toBe("0.0%");
    expect(at(1, 6).value).toBe("9876543210");
    expect(at(1, 7).value).toBe("00392");
    expect(at(1, 8).value).toBe("48 / 125");
  });

  it("keep a column as text when any filled cell is not a number", () => {
    expect(cellKind("Count", ["5", "about 6"]).kind).toBe("text");
    expect(cellKind("Amount", ["₹5", "Waived"]).kind).toBe("text");
    expect(cellKind("Roll no", ["1", "2"]).kind).toBe("text");
    expect(cellKind("Copies", [3, "4", ""]).kind).toBe("number");
    expect(cellValue({ kind: "number", format: "General" }, "007")).toBe("007");
  });
});
