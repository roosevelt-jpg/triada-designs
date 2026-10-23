"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

export default function InboxPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/v1/conversations");
      setItems(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardShell
      title="Unified inbox"
      description="Normalized conversations across channels. Human takeover suppresses automatic replies."
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="When a channel delivers a message, it will appear here."
        />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="surface-card divide-y divide-line overflow-hidden">
          {items.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/inbox/${conversation.id}`}
              className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-stone/60 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">
                  {conversation.contact?.name || "Unknown contact"}
                </p>
                <p className="text-sm text-muted">
                  {conversation.channel} · {formatDateTime(conversation.last_message_at)}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge tone={conversation.automation_mode === "human" ? "warning" : "brand"}>
                  {conversation.automation_mode === "human" ? "Human mode" : "AI mode"}
                </Badge>
                <Badge tone="neutral">{conversation.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
