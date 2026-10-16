"use client";

// The Library's sheets (forms opened by the page address, P4 and P7). Each
// keeps what was typed when a check fails and shows the problem next to its
// field. The server checks everything again.

import { useState } from "react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SArea, SDate, SMoney, SSelect, SText } from "@/components/ui/sheet-fields";
import { FieldShell, inputCls } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cx } from "@/components/ui/cx";
import { cleanIsbn, isbnValid, ISBN_INVALID } from "@/lib/library/isbn";
import { SegField } from "./client";
import {
  addCopiesAction, backOnShelfAction, blockAction, cancelReservationAction, collectAction, correctChargeAction, decideChargeAction, fineFromSalaryStopAction, fineToSalaryAction,
  limitAction, markLostAction, saveBookAction, saveCategoryAction, startStockAction, waiveAction, withdrawCopyAction,
} from "../actions";

type Opt = { value: string; label: string };

/* ---------- Books ---------- */

export type BookStart = { id: string; title: string; authors: string; publisher: string; isbn: string; categoryId: string; subject: string; language: string; edition: string; price: string; shelf: string };

/** ISBN first: checked as it is typed (format and check digit), and again on the server with the duplicate check. */
function IsbnField({ start }: { start: string }) {
  const t = useTyped("isbn", start);
  const [v, setV] = useState(t.value);
  const clean = cleanIsbn(v);
  const bad = clean.length >= 10 && !isbnValid(clean);
  const good = clean.length >= 10 && isbnValid(clean);
  const error = t.error ?? (bad ? ISBN_INVALID : undefined);
  return (
    <FieldShell label="ISBN" id="book-isbn" error={error} help={good ? "Valid ISBN." : "10 or 13 digits from the back cover. Hyphens and spaces are fine. Leave empty if there is none."}>
      <input key={t.key} id="book-isbn" name="isbn" defaultValue={t.value} onChange={(e) => setV(e.target.value)} inputMode="text" autoComplete="off" spellCheck={false} maxLength={20}
        aria-invalid={error ? true : undefined} aria-describedby={error ? "book-isbn-error" : "book-isbn-help"} placeholder="978-81-7371-146-6"
        className={cx(inputCls(error), "h-11 font-mono")} />
    </FieldShell>
  );
}

export function BookSheet({ closeHref, doneHref, categories, start, nextAccession }: { closeHref: string; doneHref?: string; categories: Opt[]; start: BookStart | null; nextAccession: string }) {
  const editing = Boolean(start);
  const copies = useTyped("copies", "1");
  const [n, setN] = useState(Number(copies.value) || 1);
  const [more, setMore] = useState(Boolean(start && (start.subject || start.price || start.shelf || start.language || start.edition)));
  return (
    <SheetForm title={editing ? "Change book details" : "Add a book"} sub={editing ? start!.title : "Type the ISBN first; then the title and author."} closeHref={closeHref} doneHref={doneHref}
      action={saveBookAction} submitLabel={editing ? "Save" : n > 1 ? `Add book and ${n} copies` : "Add book"} pendingText="Saving…" hidden={start ? { bookId: start.id } : undefined}>
      <IsbnField start={start?.isbn ?? ""} />
      <SText name="title" label="Title" required maxLength={300} start={start?.title} placeholder="Wings of Fire" />
      <SText name="authors" label="Author(s)" required maxLength={300} start={start?.authors} placeholder="A. P. J. Abdul Kalam" help="Several authors: separate them with ; (semicolon). New names are added to the list." />
      <SText name="publisher" label="Publisher" maxLength={120} start={start?.publisher} placeholder="Optional" />
      <SSelect name="categoryId" label="Category" options={categories} placeholder="No category" start={start?.categoryId ?? ""} />
      {!editing && (
        <div className="grid grid-cols-[110px_1fr] gap-3 items-start">
          <FieldShell label="Copies" id="book-copies" required error={copies.error}>
            <input key={copies.key} id="book-copies" name="copies" type="number" min={1} max={200} defaultValue={copies.value} onChange={(e) => setN(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
              aria-invalid={copies.error ? true : undefined} className={cx(inputCls(copies.error), "h-11 tnum")} />
          </FieldShell>
          <SText name="accessions" label="Accession numbers" maxLength={2000} className="[&_input]:font-mono" placeholder={`From ${nextAccession}`}
            help={`Empty: numbered in sequence from ${nextAccession}. Or type one per copy, separated by commas.`} />
        </div>
      )}
      {!more ? (
        <button type="button" className="self-start text-[13.5px] font-semibold text-brand hover:underline" onClick={() => setMore(true)}>More details: subject, price, shelf</button>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <SText name="subject" label="Subject" maxLength={80} start={start?.subject} placeholder="Science" />
            <SMoney name="price" label="Price" start={start?.price} help="Used for lost-book charges" />
            <SText name="shelf" label="Shelf location" maxLength={30} start={start?.shelf} placeholder="Empty: the category's shelf" />
            <SText name="language" label="Language" maxLength={40} start={start?.language} placeholder="English" />
          </div>
          <SText name="edition" label="Edition" maxLength={40} start={start?.edition} placeholder="Optional" />
        </>
      )}
    </SheetForm>
  );
}

export function AddCopiesSheet({ closeHref, bookId, title, nextAccession }: { closeHref: string; bookId: string; title: string; nextAccession: string }) {
  return (
    <SheetForm title="Add copies" sub={title} closeHref={closeHref} action={addCopiesAction} submitLabel="Add copies" pendingText="Adding…" hidden={{ bookId }}>
      <SText name="copies" label="Number of copies" required type="number" min={1} max={200} start="1" className="max-w-[160px]" />
      <SText name="accessions" label="Accession numbers" maxLength={2000} className="[&_input]:font-mono" placeholder={`From ${nextAccession}`}
        help={`Empty: numbered in sequence from ${nextAccession}. Or type one per copy, separated by commas.`} />
    </SheetForm>
  );
}

export function WithdrawSheet({ closeHref, copyId, accession, title }: { closeHref: string; copyId: string; accession: string; title: string }) {
  return (
    <SheetForm title={`Withdraw copy ${accession}`} sub={`${title}. It stays in the book's history; its number is never given again.`} closeHref={closeHref} action={withdrawCopyAction} submitLabel="Withdraw copy" submitVariant="danger" hidden={{ copyId }}>
      <SArea name="reason" label="Reason" required maxLength={200} placeholder="For example: old and torn, replaced with a new copy" />
    </SheetForm>
  );
}

export function BackOnShelfSheet({ closeHref, copyId, accession, status }: { closeHref: string; copyId: string; accession: string; status: string }) {
  return (
    <SheetForm title={`Copy ${accession} back on the shelf`} sub={status === "LOST" ? "The copy was found." : status === "DAMAGED" ? "The copy was repaired." : "The copy is put back in use."} closeHref={closeHref} action={backOnShelfAction} submitLabel="Put back on the shelf" hidden={{ copyId }}>
      <SArea name="reason" label="Reason" required maxLength={200} placeholder={status === "LOST" ? "Found on the wrong shelf" : "Cover repaired"} />
    </SheetForm>
  );
}

export type LostCopy = { id: string; accession: string; title: string; holder: string | null; price: number; defaultLost: number; defaultDamaged: number };

export function LostSheet({ closeHref, copy, approvalAbove, finesToFees }: { closeHref: string; copy: LostCopy; approvalAbove: number; finesToFees: boolean }) {
  const kind = useTyped("kind", "LOST");
  const [k, setK] = useState(kind.value || "LOST");
  const charge = useTyped("charge", String(copy.defaultLost));
  const [amount, setAmount] = useState(charge.value);
  const num = Number(amount.replace(/[₹,\s]/g, "")) || 0;
  const big = Boolean(copy.holder) && num > approvalAbove;
  return (
    <SheetForm title={`Copy ${copy.accession}: lost or damaged`} sub={`${copy.title} · price ₹${copy.price.toLocaleString("en-IN")}`} closeHref={closeHref} action={markLostAction}
      submitLabel={big ? "Send for approval" : `Mark ${k === "LOST" ? "lost" : "damaged"}`} hidden={{ copyId: copy.id }}>
      <SegField name="kind" label="Lost or damaged" start="LOST" options={[{ value: "LOST", label: "Lost" }, { value: "DAMAGED", label: "Damaged" }]}
        onChange={(v) => { setK(v); setAmount(String(v === "LOST" ? copy.defaultLost : copy.defaultDamaged)); }} />
      {copy.holder ? (
        <>
          <SMoney key={k} name="charge" label="Charge" required start={amount} onValue={setAmount}
            help={big ? `Above ₹${approvalAbove.toLocaleString("en-IN")}: goes to Approvals first and is added only when approved.` : k === "LOST" ? "The book's price, plus the fee in Library Settings. 0 charges nothing." : "The book's price. Change it for small damage; 0 charges nothing."} />
          <Alert tone="info">{copy.holder} has this copy. The charge is {finesToFees ? "added to their fees (students) or collected at the desk (staff)" : "collected at the library desk"}, and the issue is closed.</Alert>
        </>
      ) : (
        <Alert tone="info">Nobody has this copy now, so only its status changes. Nothing is charged.</Alert>
      )}
      <SArea name="note" label="Note" maxLength={300} placeholder="Optional: what happened" />
    </SheetForm>
  );
}

/* ---------- Issue & Return ---------- */

export function CancelReservationSheet({ closeHref, reservationId, words }: { closeHref: string; reservationId: string; words: string }) {
  return (
    <SheetForm title="Cancel reservation" sub={words} closeHref={closeHref} action={cancelReservationAction} submitLabel="Cancel reservation" submitVariant="danger" hidden={{ reservationId }}>
      <SArea name="reason" label="Reason" required maxLength={200} placeholder="For example: the member does not need it any more" />
    </SheetForm>
  );
}

/* ---------- Members & Cards ---------- */

export function BlockSheet({ closeHref, memberKey, name, blocked }: { closeHref: string; memberKey: string; name: string; blocked: boolean }) {
  return (
    <SheetForm title={blocked ? `Unblock ${name}` : `Block ${name}`} sub={blocked ? "Books can be issued again." : "No books are issued while blocked. Books already out stay out."} closeHref={closeHref}
      action={blockAction} submitLabel={blocked ? "Unblock" : "Block"} submitVariant={blocked ? "primary" : "danger"} hidden={{ member: memberKey, blocked: blocked ? "0" : "1" }}>
      <SArea name="reason" label="Reason" required maxLength={200} placeholder={blocked ? "For example: fines paid" : "For example: two books lost this term"} />
    </SheetForm>
  );
}

export function LimitSheet({ closeHref, memberKey, name, limit, fromSettings, settingsLimit }: { closeHref: string; memberKey: string; name: string; limit: number; fromSettings: boolean; settingsLimit: number }) {
  return (
    <SheetForm title={`Change ${name}'s limit`} sub={`Library Settings give ${settingsLimit} book${settingsLimit === 1 ? "" : "s"} at a time${fromSettings ? "" : `; now ${limit}`}.`} closeHref={closeHref} action={limitAction} submitLabel="Save limit" hidden={{ member: memberKey }}>
      <SSelect name="limit" label="Books at a time" required start={fromSettings ? "settings" : String(limit)}
        options={[{ value: "settings", label: `As in Library Settings (${settingsLimit})` }, ...Array.from({ length: 16 }, (_, i) => ({ value: String(i), label: i === 0 ? "0 (none)" : String(i) }))]} />
      <SArea name="reason" label="Reason" required maxLength={200} placeholder="For example: project work this term" />
    </SheetForm>
  );
}

/* ---------- Fines ---------- */

export function WaiveSheet({ closeHref, fineId, words, inFees, inSalary = false }: { closeHref: string; fineId: string; words: string; inFees: boolean; inSalary?: boolean }) {
  return (
    <SheetForm title="Waive fine" sub={words} closeHref={closeHref} action={waiveAction} submitLabel="Waive fine" hidden={{ fineId }}>
      {inFees && <Alert tone="info">The fine is in the student&apos;s fees. Waiving removes that fee row too.</Alert>}
      {inSalary && <Alert tone="info">The fine was going to be taken from salary. Waiving takes it off the salary too.</Alert>}
      <SArea name="reason" label="Reason" required maxLength={200} placeholder="For example: the child was ill and absent" />
    </SheetForm>
  );
}

export function CollectSheet({ closeHref, fineId, words }: { closeHref: string; fineId: string; words: string }) {
  const mode = useTyped("mode", "CASH");
  const [m, setM] = useState(mode.value || "CASH");
  return (
    <SheetForm title="Collect fine" sub={words} closeHref={closeHref} action={collectAction} submitLabel="Collect and give receipt" hidden={{ fineId }}>
      <SegField name="mode" label="Paid by" start="CASH" onChange={setM} options={[{ value: "CASH", label: "Cash" }, { value: "UPI", label: "UPI" }, { value: "BANK_TRANSFER", label: "Bank" }, { value: "CHEQUE", label: "Cheque" }]} />
      {m !== "CASH" && <SText name="reference" label={m === "CHEQUE" ? "Cheque number" : "Transaction or UTR number"} required maxLength={60} className="[&_input]:font-mono" />}
      <p className="text-[12.5px] text-ink3">Recorded as income in Finance Management with a receipt number.</p>
    </SheetForm>
  );
}

/** A staff member's fine taken from their next salary instead of at the desk. */
export function ToSalarySheet({ closeHref, fineId, words, name }: { closeHref: string; fineId: string; words: string; name: string }) {
  return (
    <SheetForm title="Take from salary" sub={words} closeHref={closeHref} action={fineToSalaryAction} submitLabel="Take from salary" hidden={{ fineId }} pendingText="Saving…">
      <p className="text-[14px] text-ink2">The fine is added as a deduction to {name}&apos;s next salary worked out in Salary Management, with the fine number as the reason. {name} is told.</p>
      <p className="text-[13px] text-ink3">It shows as paid here when that salary is approved. It cannot be collected at the desk in the meantime, so it is never taken twice.</p>
    </SheetForm>
  );
}

/** Stops taking a fine from salary, so it is collected at the desk. */
export function StopSalarySheet({ closeHref, fineId, words, where }: { closeHref: string; fineId: string; words: string; where: string }) {
  return (
    <SheetForm title="Collect here instead" sub={words} closeHref={closeHref} action={fineFromSalaryStopAction} submitLabel="Do not take from salary" hidden={{ fineId }} pendingText="Saving…">
      <p className="text-[14px] text-ink2">{where}. The deduction comes off that salary and the fine is due here again.</p>
      <p className="text-[13px] text-ink3">A salary already sent for approval cannot change: the accountant takes it back first.</p>
    </SheetForm>
  );
}

export function CorrectSheet({ closeHref, fineId, words, amount }: { closeHref: string; fineId: string; words: string; amount: string }) {
  return (
    <SheetForm title="Correct the charge" sub={words} closeHref={closeHref} action={correctChargeAction} submitLabel="Save the new charge" hidden={{ fineId }}>
      <SMoney name="amount" label="Charge" required start={amount} help="Above the set amount it goes to Approvals again." />
      <SArea name="note" label="Why the amount changed" required maxLength={200} />
    </SheetForm>
  );
}

export function RejectChargeSheet({ closeHref, fineId, words }: { closeHref: string; fineId: string; words: string }) {
  return (
    <SheetForm title="Do not approve this charge" sub={words} closeHref={closeHref} action={decideChargeAction} submitLabel="Do not approve" submitVariant="danger" hidden={{ fineId, decision: "reject" }}>
      <SArea name="note" label="Reason" required maxLength={300} placeholder="For example: the book was already old; charge the price only" />
    </SheetForm>
  );
}

export function StartStockSheet({ closeHref, suggested }: { closeHref: string; suggested: string }) {
  return (
    <SheetForm title="Start a stock check" sub="Scan every copy on the shelves, then close the check to see what is missing." closeHref={closeHref} action={startStockAction} submitLabel="Start stock check">
      <SText name="name" label="Name" required maxLength={80} start={suggested} />
    </SheetForm>
  );
}

/* ---------- Settings ---------- */

export function CategorySheet({ closeHref, start }: { closeHref: string; start: { id: string; name: string; shelf: string; loanDays: string; forLoan: boolean } | null }) {
  return (
    <SheetForm title={start ? `Change ${start.name}` : "Add a category"} closeHref={closeHref} action={saveCategoryAction} submitLabel="Save category" hidden={start ? { categoryId: start.id } : undefined}>
      <SText name="name" label="Name" required maxLength={60} start={start?.name} placeholder="Science" />
      <div className="grid grid-cols-2 gap-3">
        <SText name="shelf" label="Shelf" maxLength={20} start={start?.shelf} placeholder="C" />
        <SText name="loanDays" label="Loan days" type="number" min={1} max={180} start={start?.loanDays} help="Empty: the member's loan days" />
      </div>
      <SegField name="forLoan" label="Lent out" start={start && !start.forLoan ? "no" : "yes"} options={[{ value: "yes", label: "Lent out" }, { value: "no", label: "Reference: not lent" }]} />
    </SheetForm>
  );
}

export { SDate };
