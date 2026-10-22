// Where to type the go-live date, said from where the person is (QA GOLIVE-01):
// on the go-live check the date is a field on the same page; on Fee Management's
// Import page it is reached by its path in Settings. Pure, so the panel can use it.

/** Where the panel "Fees due before go-live" is shown. */
export type GoLiveDatePlace = { on: "fee-import" } | { on: "go-live-check"; canType: boolean };

export const GO_LIVE_FORM_ANCHOR = "old-software";

/** The words shown while no go-live date is typed; `here` is the name of the card with the field, on the go-live check. */
export function goLiveDateHint(place: GoLiveDatePlace): { before: string; here: string | null; after: string } {
  if (place.on === "go-live-check") {
    return place.canType
      ? { before: "Type the go-live date under ", here: "What your old software says", after: " on this page to see the fees due before it." }
      : { before: "The Principal or School Admin types the go-live date under ", here: "What your old software says", after: " on this page; then the fees due before it show here." };
  }
  return { before: "Type the go-live date on the go-live check (Settings, Data Backup & Security, Switching to School OS) to see the fees due before it.", here: null, after: "" };
}
