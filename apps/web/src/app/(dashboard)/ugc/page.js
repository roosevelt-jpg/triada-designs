"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

export default function UgcPage() {
  const [items, setItems] = useState([]);
  const [queue, setQueue] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("https://instagram.com/p/example");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [i, q] = await Promise.all([
        apiFetch("/v1/jewellery-ops/ugc"),
        apiFetch("/v1/jewellery-ops/ugc/repost-queue"),
      ]);
      setItems(i.data || []);
      setQueue(q.data || []);
    } catch (err) {
      setError(err.message || "Failed to load UGC");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function simulateTag(event) {
    event.preventDefault();
    setStatus("");
    try {
      await apiFetch("/v1/jewellery-ops/ugc/tags", {
        method: "POST",
        body: { platform: "instagram", external_post_url: url },
      });
      setStatus("Tag recorded + Telegram alert + repost candidate queued.");
      load();
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function requestPermission(itemId) {
    await apiFetch(`/v1/jewellery-ops/ugc/${itemId}/request-permission`, { method: "POST" });
    load();
  }

  return (
    <DashboardShell
      title="UGC & tags"
      description="After delivery invites to post and tag Triada; tag alerts; list of posts to ask permission to repost."
    >
      {loading ? <Skeleton className="h-32" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error ? (
        <div className="space-y-5">
          <Card>
            <h2 className="ops-section-title">Simulate tag alert</h2>
            <form className="mt-3 space-y-3" onSubmit={simulateTag}>
              <Input label="Post URL" value={url} onChange={(e) => setUrl(e.target.value)} />
              <Button type="submit" size="sm">
                Record tag
              </Button>
            </form>
            {status ? <p className="mt-2 text-sm text-muted">{status}</p> : null}
          </Card>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">UGC items</h2>
            </div>
            <div className="divide-y divide-line">
              {items.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink">
                      {item.item_type} · {item.platform || "—"}
                    </p>
                    <p className="text-muted">{item.external_post_url || item.reward_offer || "—"}</p>
                  </div>
                  <Badge>{item.status}</Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Repost permission list</h2>
            </div>
            <div className="divide-y divide-line">
              {queue.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink">{item.external_post_url || item.id}</p>
                    <p className="text-muted">permission {item.permission_to_repost ? "granted" : "needed"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{item.status}</Badge>
                    {item.status === "new" ? (
                      <Button size="sm" variant="secondary" onClick={() => requestPermission(item.id)}>
                        Ask permission
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
