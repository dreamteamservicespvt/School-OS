import { redirect } from "next/navigation";
import { financePage } from "../../_lib/page";

const UUID = /^[0-9a-f-]{36}$/i;

/** Links from Approvals and duplicate warnings open the expense on the Expenses page. */
export default async function ExpenseLink({ params }: { params: Promise<{ expenseId: string }> }) {
  await financePage();
  const { expenseId } = await params;
  redirect(UUID.test(expenseId) ? `/finance-management/expenses?open=${expenseId}` : "/finance-management/expenses");
}
