import type { Metadata } from "next";
import { requireCurrent } from "@/lib/current";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { MessageIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const current = await requireCurrent();
  return (
    <>
      <PageHeader title="Messages" href="/messages" userId={current.user.id} />
      <EmptyState title="No messages yet" icon={<MessageIcon className="size-6" />}>
        Your own messages and replies will appear here. Sending to parents and groups happens in Communication, which arrives in Stage 2.
      </EmptyState>
    </>
  );
}
