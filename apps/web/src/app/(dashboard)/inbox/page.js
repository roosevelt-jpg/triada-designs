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

const CHANNEL_FILTERS = [
  { value: "", label: "All channels" },
  { value: "webchat", label: "Webchat" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
];

function channelTone(channel) {
  if (channel === "facebook") return "info";
  if (channel === "instagram") return "brand";
  if (channel === "whatsapp") return "success";
  if (channel === "telegram") return "info";
  if (channel === "linkedin") return "info";
  if (channel === "tiktok") return "brand";
  return "neutral";
}

export default function InboxPage() {
  const [items, setItems] = useState([]);
  const [channel, setChannel] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = channel ? `?channel=${encodeURIComponent(channel)}` : "";
      const response = await apiFetch(`/v1/conversations${query}`);
      setItems(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardShell
      title="Unified inbox"
      description="Conversations across webchat, Meta, Telegram, LinkedIn, and TikTok. Human takeover suppresses automatic replies."
    >
      <div className="mb-4 ops-actions" role="toolbar" aria-label="Channel filters">
        {CHANNEL_FILTERS.map((filter) => (
          <button
            key={filter.value || "all"}
            type="button"
            aria-pressed={channel === filter.value}
            onClick={() => setChannel(filter.value)}
            className={`ops-filter-chip ${channel === filter.value ? "is-active" : ""}`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px]" />
          ))}
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Simulate an inbound from Integrations, or wait for a connected channel message."
        />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="surface-card divide-y divide-line overflow-hidden">
          {items.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/inbox/${conversation.id}`}
              className="flex flex-col gap-2 px-4 py-3.5 transition-colors duration-150 hover:bg-stone/50 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">
                  {conversation.contact?.name || "Unknown contact"}
                </p>
                <p className="text-sm tabular-nums text-muted">
                  {formatDateTime(conversation.last_message_at)}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={channelTone(conversation.channel)}>
                  {conversation.channel}
                </Badge>
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
