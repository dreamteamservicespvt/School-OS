// The words a student sees when a file cannot be handed in. The shared upload check
// (src/lib/upload-check.ts) asks for "a photo, a PDF or a spreadsheet", but homework takes
// photos and PDFs only, and the hand-in sheet says so (layman test LC13).

const SHARED_END = "Upload a photo, a PDF or a spreadsheet.";
const HAND_IN_END = "Hand in a photo or a PDF.";

/** The upload check's message, worded for handing in homework. */
export function handInFileWords(message: string): string {
  return message.endsWith(SHARED_END) ? `${message.slice(0, -SHARED_END.length)}${HAND_IN_END}` : message;
}
