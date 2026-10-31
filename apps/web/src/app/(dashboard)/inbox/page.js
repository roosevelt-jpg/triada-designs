"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { InboxChatWorkspace } from "@/components/inbox/InboxChatWorkspace";

export default function InboxPage() {
  return (
    <DashboardShell
      title="Unified inbox"
      description="Messenger-style threads across every channel — reply, take over, or leave AI running."
      contentClassName="inbox-shell"
    >
      <InboxChatWorkspace />
    </DashboardShell>
  );
}
