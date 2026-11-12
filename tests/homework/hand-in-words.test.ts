// Layman test LC13: a refused hand-in asked for "a photo, a PDF or a spreadsheet", but
// homework takes photos and PDFs only (src/lib/homework/hand-in-words.ts).
import { describe, expect, it } from "vitest";
import { handInFileWords } from "@/lib/homework/hand-in-words";
import { EN } from "@/lib/i18n/catalogues/en";

describe("the words for a file that cannot be handed in", () => {
  it("ask for a photo or a PDF, as the hand-in sheet says", () => {
    const shared = "Programs, scripts and web pages cannot be uploaded, so this file was not saved. Upload a photo, a PDF or a spreadsheet.";
    expect(handInFileWords(shared)).toBe("Programs, scripts and web pages cannot be uploaded, so this file was not saved. Hand in a photo or a PDF.");
    expect(handInFileWords("This file is a program, not a document or photo, so it was not saved. Upload a photo, a PDF or a spreadsheet."))
      .toBe("This file is a program, not a document or photo, so it was not saved. Hand in a photo or a PDF.");
  });

  it("leave other messages as they are", () => {
    const svg = "Pictures in SVG format can carry hidden code, so they are not accepted. Save the picture as PNG or JPG and upload that.";
    expect(handInFileWords(svg)).toBe(svg);
  });

  it("are in the word list, so Telugu and Hindi screens translate them", () => {
    for (const m of ["Programs, scripts and web pages cannot be uploaded, so this file was not saved. Hand in a photo or a PDF.", "This file is a program, not a document or photo, so it was not saved. Hand in a photo or a PDF."]) {
      expect((EN as readonly string[]).includes(m)).toBe(true);
    }
  });
});
