// The letter a key press would type, so Search can keep the first keys pressed
// while it opens (QA SEARCH-01): a single printable character with no Ctrl,
// Alt or Cmd. Enter, arrows, Escape and shortcuts are left alone.

export type KeyLike = { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; isComposing?: boolean };

export function typedKey(e: KeyLike): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return null;
  return [...e.key].length === 1 ? e.key : null;
}
