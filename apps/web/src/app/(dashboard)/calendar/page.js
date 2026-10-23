"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";
import { getSystemTimeState, nowDate, syncSystemTime } from "@/lib/system-time";

export default function CalendarPage() {
  const [items, setItems] = useState([]);
  const [publications, setPublications] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");
  const [nowLabel, setNowLabel] = useState("");
  const [timezone, setTimezone] = useState("UTC");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const clock = await syncSystemTime().catch(() => getSystemTimeState());
      setTimezone(clock.timezone || "UTC");
      setNowLabel(formatDateTime(nowDate()));
      const [data, pubs] = await Promise.all([
        apiFetch("/v1/calendar"),
        apiFetch("/v1/publications"),
      ]);
      setItems(data.data || []);
      setPublications(pubs.data || []);
    } catch (err) {
      setError(err.message || "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function publish(item, adapter) {
    setBusyId(`${item.id}-${adapter}`);
    try {
      const result = await apiFetch(`/v1/content/${item.id}/publish`, {
        method: "POST",
        body: { adapter, approval_version: item.approval_version },
      });
      if (!result.ok) {
        setError(result.error || "Publish blocked by approval gate");
      } else {
        setNotice(`Published via ${adapter} (${result.result?.mode || "local"}).`);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardShell
      title="Content calendar"
      description={`Scheduled items and publication logs (workspace now: ${nowLabel || "…"} · ${timezone}). Public posts require human approval + version check.`}
    >
      {loading ? <Skeleton className="h-28" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          description="Approve content in Content Studio and schedule to populate this view."
        />
      ) : null}
      {!loading && items.length > 0 ? (
        <div className="surface-card divide-y divide-line overflow-hidden">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted">{formatDateTime(item.scheduled_for)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{item.channel || "channel"}</Badge>
                <Badge tone="neutral">{item.status}</Badge>
                {(item.status === "scheduled" || item.status === "approved") && (
                  <>
                    <Button
                      size="sm"
                      disabled={busyId === `${item.id}-wordpress`}
                      onClick={() => publish(item, "wordpress")}
                    >
                      Publish WP
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === `${item.id}-meta_page`}
                      onClick={() => publish(item, "meta_page")}
                    >
                      Publish Meta
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!loading ? (
        <div className="mt-8 surface-card p-5">
          <h2 className="font-display text-2xl">Publication logs</h2>
          <div className="mt-3 divide-y divide-line">
            {publications.length === 0 ? (
              <p className="text-sm text-muted">No publication attempts yet.</p>
            ) : (
              publications.map((pub) => (
                <div key={pub.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                  <span>
                    {pub.adapter} · {pub.external_id || "no external id"} ·{" "}
                    {pub.published_at ? formatDateTime(pub.published_at) : "—"}
                  </span>
                  <Badge tone={pub.status === "published" ? "success" : "warning"}>{pub.status}</Badge>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
