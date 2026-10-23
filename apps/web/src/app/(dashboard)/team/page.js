import { DashboardShell } from "@/components/layout/DashboardShell";
import { EmptyState } from "@/components/ui/EmptyState";

export default function Page() {
  return (
    <DashboardShell
      title="Team"
      description="Foundation screen for Milestone 1. Deeper workflows land in later milestones per the implementation plan."
    >
      <EmptyState
        title="Foundation ready"
        description="Navigation, auth, and design system are in place. Feature depth expands after CRM, inbox, and WordPress/Zoho paths."
      />
    </DashboardShell>
  );
}
