// Counts in plain words for the import pages (00-global.md §9): "1 row is",
// "2 rows are". Pure, so the buttons and the server say the same thing.

/** "1 holiday", "2 holidays". */
export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What Undo does to what an import added and changed: "The 1 holiday it added is archived." */
export function undoWords(added: number, updated: number, one: string, many: string): string {
  const parts = [
    added ? `the ${count(added, one, many)} it added ${added === 1 ? "is" : "are"} archived` : "",
    updated ? `the ${count(updated, "record")} it changed ${updated === 1 ? "is" : "are"} put back as ${updated === 1 ? "it was" : "they were"}` : "",
  ].filter(Boolean);
  if (!parts.length) return "";
  const text = parts.join(", and ");
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

/**
 * What stays with the file after its ready rows are brought in: the rows with
 * problems and the rows the person left out. Empty when nothing stays.
 */
export function stayWords(problems: number, leftOut: number): string {
  const parts = [problems ? `${count(problems, "row")} with problems` : "", leftOut ? `${count(leftOut, "row")} you left out` : ""].filter(Boolean);
  if (!parts.length) return "";
  const one = problems + leftOut === 1;
  const what = `The ${parts.join(" and the ")}`;
  return `${what} ${one ? "stays" : "stay"} here, counted with the file; ${one ? "fix it and bring it in" : "fix them and bring them in"} after.`;
}
