// One at a time's number keys (Marks Entry): what the box holds after a key. A box just chosen is "fresh":
// the first key replaces the mark in it, like selecting the text, so correcting 11 to 18 never gives 1118
// (self-test B4, 2026-11-12). Returns undefined when the key changes nothing.
export function keypadValue(v: string, key: string, opts: { fresh: boolean; absent: boolean }): string | undefined {
  const clean = opts.absent || opts.fresh;
  if (key === "AB" || key === "ML") return key;
  if (key === "del") return clean ? "" : v.slice(0, -1);
  if (key === ".5") return clean ? "0.5" : v.includes(".") ? undefined : `${v || "0"}.5`;
  return clean ? key : `${v}${key}`.slice(0, 5);
}
