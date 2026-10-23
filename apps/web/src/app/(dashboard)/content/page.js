"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

export default function ContentPage() {
  const [items, setItems] = useState([]);
  const [publications, setPublications] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [response, pubs] = await Promise.all([
        apiFetch("/v1/content"),
        apiFetch("/v1/publications"),
      ]);
      setItems(response.data || []);
      setPublications(pubs.data || []);
    } catch (err) {
      setError(err.message || "Failed to load content");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(id) {
    setBusyId(`approve-${id}`);
    try {
      await apiFetch(`/v1/content/${id}/approve`, { method: "POST" });
      setNotice("Approved. Publish still requires the version gate.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function schedule(item) {
    setBusyId(`schedule-${item.id}`);
    try {
      const when = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      await apiFetch(`/v1/content/${item.id}/schedule`, {
        method: "POST",
        body: { scheduled_for: when },
      });
      setNotice(`Scheduled for ${when}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function publish(item, adapter) {
    setBusyId(`publish-${item.id}-${adapter}`);
    try {
      const result = await apiFetch(`/v1/content/${item.id}/publish`, {
        method: "POST",
        body: {
          adapter,
          approval_version: item.approval_version,
        },
      });
      if (!result.ok) {
        setError(result.error || "Publish blocked");
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
      title="Content studio"
      description="Draft → human approval → schedule/publish. Adapters: WordPress + Meta page (local sim without credentials)."
    >
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="No content items" description="Generate or create a draft to begin review." />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="surface-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-2xl">{item.title}</h3>
                <Badge
                  tone={
                    item.status === "published"
                      ? "success"
                      : item.status === "approved" || item.status === "scheduled"
                        ? "brand"
                        : "warning"
                  }
                >
                  {item.status}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted">{item.body}</p>
              <p className="mt-3 text-xs uppercase tracking-wide text-muted">
                {item.channel} · version {item.approval_version ?? 0}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.status === "in_review" || item.status === "draft" ? (
                  <Button disabled={busyId === `approve-${item.id}`} onClick={() => approve(item.id)}>
                    Approve (human)
                  </Button>
                ) : null}
                {item.status === "approved" ? (
                  <>
                    <Button
                      variant="secondary"
                      disabled={busyId === `schedule-${item.id}`}
                      onClick={() => schedule(item)}
                    >
                      Schedule (+3d)
                    </Button>
                    <Button
                      disabled={busyId === `publish-${item.id}-wordpress`}
                      onClick={() => publish(item, "wordpress")}
                    >
                      Publish WordPress
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busyId === `publish-${item.id}-meta_page`}
                      onClick={() => publish(item, "meta_page")}
                    >
                      Publish Meta page
                    </Button>
                  </>
                ) : null}
                {item.status === "scheduled" ? (
                  <>
                    <Button
                      disabled={busyId === `publish-${item.id}-wordpress`}
                      onClick={() => publish(item, "wordpress")}
                    >
                      Publish now (WP)
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busyId === `publish-${item.id}-meta_page`}
                      onClick={() => publish(item, "meta_page")}
                    >
                      Publish now (Meta)
                    </Button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!loading ? (
        <div className="mt-8 surface-card p-5">
          <h2 className="font-display text-2xl">Publication logs</h2>
          <div className="mt-3 divide-y divide-line">
            {publications.length === 0 ? (
              <p className="text-sm text-muted">No publications yet.</p>
            ) : (
              publications.map((pub) => (
                <div key={pub.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span>
                    {pub.adapter} · content {pub.content_item_id} · v{pub.approval_version_checked}
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
