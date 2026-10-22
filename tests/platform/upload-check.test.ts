// Upload checks (08-platform-security.md §8; gap list G46 part 4): files are
// judged by their content, programs, scripts and web pages are refused, PDF
// programs and Excel macros are refused, photos lose where they were taken,
// and the virus scanner (off until set up) refuses infected files. Every
// refusal says why in plain words.
import { createServer, type Server } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { withSchool, type SchoolContext } from "@/lib/db";
import { DOCUMENT_TYPES, FileProblem, IMAGE_TYPES, saveFile, SHEET_TYPES } from "@/lib/files";
import { checkSheet, scanUpload } from "@/lib/upload-check";
import { fileStore } from "@/lib/storage";
import { makeSchool } from "../helpers";

let ctx: SchoolContext;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

const save = (body: Buffer | string, name: string, allowed: readonly string[] = DOCUMENT_TYPES) =>
  withSchool(ctx, (tx) => saveFile(tx, ctx, { file: new File([new Uint8Array(typeof body === "string" ? Buffer.from(body) : body)], name), purpose: "test", allowed }));

beforeAll(async () => {
  const s = await makeSchool("Upload School");
  ctx = { schoolId: s.id, userId: null };
});

describe("upload checks", () => {
  it("refuse programs and scripts, whatever their name says", async () => {
    await expect(save(Buffer.concat([Buffer.from("MZ"), Buffer.alloc(100)]), "fees.pdf")).rejects.toThrow(/is a program/);
    await expect(save(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3]), "photo.jpg")).rejects.toThrow(/is a program/);
    await expect(save("#!/bin/sh\nrm -rf /", "list.csv", SHEET_TYPES)).rejects.toThrow(/is a program/);
    await expect(save(PDF, "setup.exe")).rejects.toThrow(/Programs, scripts and web pages cannot be uploaded/);
  });

  it("refuse web pages and SVG pictures, which can carry hidden code", async () => {
    await expect(save("﻿  <!DOCTYPE html><html><script>alert(1)</script>", "notice.pdf")).rejects.toThrow(/web page/);
    await expect(save('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "logo.png", IMAGE_TYPES)).rejects.toThrow(/SVG/);
    await expect(save("<svg onload=alert(1)>", "logo.svg", IMAGE_TYPES)).rejects.toThrow(/cannot be uploaded/);
  });

  it("refuse a PDF with a built-in program, and keep a plain one", async () => {
    await expect(save(Buffer.from("%PDF-1.4\n1 0 obj<</OpenAction<</S/JavaScript/JS(app.alert(1))>>>>endobj\n%%EOF"), "tc.pdf")).rejects.toThrow(/built-in program/);
    const ok = await save(PDF, "tc.pdf");
    expect(ok.contentType).toBe("application/pdf");
    expect(ok.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuse Excel files with macros, ZIPs that are not workbooks, and CSVs that are not text", async () => {
    const zip = (names: string[]) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(names.join("\0"))]);
    await expect(save(zip(["[Content_Types].xml", "xl/workbook.xml", "xl/vbaProject.bin"]), "marks.xlsx", SHEET_TYPES)).rejects.toThrow(/macros/);
    await expect(save(zip(["[Content_Types].xml", "word/document.xml"]), "marks.xlsx", SHEET_TYPES)).rejects.toThrow(/not an Excel workbook/);
    await expect(save(Buffer.from("name,class\0\0\0"), "marks.csv", SHEET_TYPES)).rejects.toThrow(/not a plain CSV/);
    expect(() => checkSheet(zip(["[Content_Types].xml", "xl/workbook.xml", "xl/vbaProject.bin"]), "marks.xlsx")).toThrow(FileProblem);
    expect(() => checkSheet(Buffer.from("Admission No,Marks\nA1,45\n"), "marks.csv")).not.toThrow();
  });

  it("remove where a photo was taken, and refuse a photo that cannot be opened", async () => {
    const withGps = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#c33" } })
      .jpeg()
      .withExif({ IFD0: { Make: "PhoneCo" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "17/1 23/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "78/1 29/1 0/1" } })
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();
    const saved = await save(withGps, "child.jpg", IMAGE_TYPES);
    const kept = await fileStore().get(saved.storageKey);
    expect((await sharp(kept!).metadata()).exif).toBeUndefined();
    expect(kept!.includes(Buffer.from("PhoneCo"))).toBe(false);
    await expect(save(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), "broken.jpg", IMAGE_TYPES)).rejects.toThrow(/could not be opened/);
  });
});

describe("virus scanner hook", () => {
  let server: Server;
  let port = 0;

  beforeAll(async () => {
    // A stand-in for ClamAV's clamd: finds the EICAR test text, passes anything else.
    server = createServer((socket) => {
      let got = Buffer.alloc(0);
      socket.on("data", (d) => {
        got = Buffer.concat([got, d]);
        if (got.subarray(-4).equals(Buffer.alloc(4))) {
          socket.end(got.includes(Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    delete process.env.CLAMAV_HOST;
    delete process.env.CLAMAV_PORT;
    await new Promise((r) => server.close(r));
  });

  it("is off until CLAMAV_HOST is set", async () => {
    delete process.env.CLAMAV_HOST;
    expect(await scanUpload(PDF)).toEqual({ status: "off" });
  });

  it("refuses an infected file and keeps a clean one", async () => {
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = String(port);
    expect(await scanUpload(PDF)).toEqual({ status: "clean" });
    const eicar = Buffer.from("%PDF-1.4\n% X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n%%EOF");
    await expect(save(eicar, "fees.pdf")).rejects.toThrow(/looks like it has a virus/);
    expect((await save(PDF, "fees.pdf")).contentType).toBe("application/pdf");
  });

  it("refuses the upload, in plain words, when the scanner cannot be reached", async () => {
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = "1";
    await expect(save(PDF, "fees.pdf")).rejects.toThrow(/could not be checked for viruses just now/);
  });
});
