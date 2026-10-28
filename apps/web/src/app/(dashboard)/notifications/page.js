"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";

function typeTone(type) {
  if (type === "content_pending_review") return "warning";
  if (type === "system") return "brand";
  return "neutral";
}

function typeLabel(type) {
  if (type === "content_pending_review") return "Pending review";
  if (type === "system") return "System";
  return String(type || "Notice").replaceAll("_", " ");
}

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, counts] = await Promise.all([
        apiFetch("/v1/notifications?limit=80"),
        apiFetch("/v1/notifications/unread-count"),
      ]);
      setItems(Array.isArray(list?.data) ? list.data : []);
      setUnread(Number(counts?.unread_count ?? list?.unread_count ?? 0) || 0);
    } catch (err) {
      setError(err?.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === "unread") return items.filter((n) => !n.read_at);
    if (filter === "content_pending_review") {
      return items.filter((n) => n.type === "content_pending_review");
    }
    return items;
  }, [items, filter]);

  const pendingReviewCount = useMemo(
    () => items.filter((n) => n.type === "content_pending_review" && !n.read_at).length,
    [items],
  );

  async function markOne(id) {
    try {
      const result = await apiFetch(`/v1/notifications/${id}/read`, {
        method: "POST",
      });
      setUnread(Number(result?.unread_count ?? 0) || 0);
      setItems((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n,
        ),
      );
    } catch (err) {
      setError(err?.message || "Unable to mark read");
    }
  }

  async function markAll() {
    try {
      const result = await apiFetch("/v1/notifications/read-all", { method: "POST" });
      setUnread(Number(result?.unread_count ?? 0) || 0);
      const at = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || at })));
    } catch (err) {
      setError(err?.message || "Unable to mark all read");
    }
  }

  return (
    <DashboardShell
      title="Notifications"
      description="Unread alerts and content waiting for review."
      actions={
        unread > 0 ? (
          <Button variant="secondary" size="sm" onClick={markAll}>
            Mark all read
          </Button>
        ) : null
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { key: "all", label: "All" },
          { key: "unread", label: `Unread (${unread})` },
          {
            key: "content_pending_review",
            label: `Pending review (${pendingReviewCount})`,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors",
              filter === tab.key
                ? "border-champagne bg-sand text-brown-dark"
                : "border-line bg-white text-muted hover:bg-ivory",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error && visible.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description={
            filter === "content_pending_review"
              ? "No content is waiting for review."
              : "You’re all caught up."
          }
        />
      ) : null}

      {!loading && !error && visible.length > 0 ? (
        <ul className="divide-y divide-line/80 overflow-hidden rounded-md border border-line bg-white/90">
          {visible.map((item) => {
            const href = item.href || "/content";
            const unreadItem = !item.read_at;
            return (
              <li
                key={item.id}
                className={cn(
                  "flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                  unreadItem ? "bg-sand/25" : "bg-transparent",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">{item.title}</p>
                    <Badge tone={typeTone(item.type)}>{typeLabel(item.type)}</Badge>
                    {unreadItem ? <Badge tone="brand">Unread</Badge> : null}
                  </div>
                  {item.body ? (
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{item.body}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted">
                    {formatDateTime(item.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {unreadItem ? (
                    <Button variant="ghost" size="sm" onClick={() => markOne(item.id)}>
                      Mark read
                    </Button>
                  ) : null}
                  <Link
                    href={href}
                    onClick={() => {
                      if (unreadItem) markOne(item.id);
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-line bg-white px-3 text-sm font-medium text-ink transition-colors hover:bg-stone"
                  >
                    {item.type === "content_pending_review" ? "Open review" : "Open"}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </DashboardShell>
  );
}
