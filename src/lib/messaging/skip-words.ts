// A count joined to the reason people were left out: "1 has no parent name",
// "14 have no parent name" (COMM-06). Plain words with no database, so the
// Send Message form and the server say it the same way.

/** "14 have no due amount", "1 has no mobile number", "2 opted out of messages". */
export function countWithReason(count: number, reason: string) {
  let r = reason.charAt(0).toLowerCase() + reason.slice(1);
  if (count === 1) r = r.replace(/^parents have /, "parent has ");
  else r = r.replace(/^has /, "have ").replace(/^is /, "are ").replace(/^was /, "were ");
  return `${count.toLocaleString("en-IN")} ${r}`;
}
