"use client";

import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { InboxChatWorkspace } from "@/components/inbox/InboxChatWorkspace";

export default function ConversationDetailPage() {
  const params = useParams();
  const conversationId = String(params.conversationId || "");

  return (
    <DashboardShell
      title="Unified inbox"
      description="Messenger-style threads across every channel — reply, take over, or leave AI running."
      contentClassName="inbox-shell"
    >
      <InboxChatWorkspace selectedId={conversationId} />
    </DashboardShell>
  );
}
