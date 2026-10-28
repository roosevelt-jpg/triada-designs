"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { creativeModeLabel } from "@/lib/integrations/brand-labels";
import { formatDateTime } from "@/lib/formatters";

function mediaUrl(url) {
  if (!url) return null;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? url : `/${url}`;
}

function modeTone(mode) {
  const label = creativeModeLabel(mode);
  if (label === "Live AI" || mode === "live" || mode === "gemini" || mode === "anthropic") {
    return "success";
  }
  if (mode === "local_sim" || mode === "local" || mode === "local_seed") return "warning";
  return "neutral";
}

function ContentReviewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlight = searchParams.get("highlight") || "";

  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/v1/content/review");
      setItems(response.data || []);
    } catch (err) {
      try {
        const all = await apiFetch("/v1/content");
        const list = (all.data || []).filter(
          (c) => c.status === "in_review" || c.status === "draft"
        );
        const withMedia = await Promise.all(
          list.map(async (item) => {
            const media = await apiFetch(`/v1/content/${item.id}/media`).catch(() => ({
              assets: [],
              variants: [],
            }));
            return {
              ...item,
              media,
              preview_asset:
                media.assets?.find((a) => a.kind === "video") ||
                media.assets?.find((a) => a.kind === "animation") ||
                media.assets?.find((a) => a.kind === "image") ||
                null,
            };
          })
        );
        setItems(withMedia);
      } catch (fallbackErr) {
        setError(fallbackErr.message || err.message || "Failed to load review queue");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    if (!highlight) return items;
    return [...items].sort((a, b) => {
      if (a.id === highlight) return -1;
      if (b.id === highlight) return 1;
      return 0;
    });
  }, [items, highlight]);

  async function approve(item) {
    setBusyId(`approve-${item.id}`);
    setNotice("");
    try {
      const result = await apiFetch(`/v1/content/${item.id}/approve`, { method: "POST" });
      setNotice(
        `Approved “${item.title}” (v${result.content?.approval_version ?? "?"}). Ready to schedule on Calendar.`
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="warning">{sorted.length} pending</Badge>
        <Button variant="secondary" size="sm" onClick={() => router.push("/content")}>
          Content studio
        </Button>
        <Button variant="ghost" size="sm" onClick={() => router.push("/calendar")}>
          Calendar
        </Button>
      </div>

      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading && !error && sorted.length === 0 ? (
        <EmptyState
          title="Nothing pending review"
          description="Generate an image or video in Content Studio — it will appear here for preview."
        />
      ) : null}

      {!loading && !error && sorted.length > 0 ? (
        <div className="grid gap-5">
          {sorted.map((item) => {
            const asset = item.preview_asset;
            const url = mediaUrl(asset?.url);
            const variants = item.media?.variants || [];
            const highlighted = highlight && item.id === highlight;

            return (
              <article
                key={item.id}
                id={`review-${item.id}`}
                className={`surface-card overflow-hidden ${
                  highlighted ? "ring-2 ring-brand-gold/50" : ""
                }`}
              >
                <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="border-b border-line bg-stone/20 lg:border-b-0 lg:border-r">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={`${item.title} preview`}
                        className="max-h-[28rem] w-full object-contain bg-ivory"
                      />
                    ) : (
                      <div className="flex min-h-[16rem] items-center justify-center px-6 text-sm text-muted">
                        No preview media yet — open Content Studio to generate.
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-4 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="ops-section-title">{item.title}</h2>
                        <p className="mt-2 text-sm text-muted">{item.body}</p>
                      </div>
                      <Badge tone="warning">{item.status}</Badge>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge tone="neutral">{item.channel || "channel"}</Badge>
                      {asset?.kind ? <Badge tone="brand">{asset.kind}</Badge> : null}
                      {asset?.mode ? (
                        <Badge tone={modeTone(asset.mode)}>
                          {creativeModeLabel(asset.mode)}
                        </Badge>
                      ) : null}
                      {item.product_context?.name ? (
                        <Badge tone="neutral">{item.product_context.name}</Badge>
                      ) : null}
                    </div>

                    {asset?.width ? (
                      <p className="text-xs text-muted">
                        {asset.width}×{asset.height}
                        {asset.duration_ms
                          ? ` · ${Math.round(asset.duration_ms / 1000)}s`
                          : ""}
                        {item.updated_at ? ` · updated ${formatDateTime(item.updated_at)}` : ""}
                      </p>
                    ) : null}

                    {item.review_notified_at ? (
                      <p className="text-xs text-brown-dark">
                        Admin notified {formatDateTime(item.review_notified_at)}
                      </p>
                    ) : null}

                    {variants.length > 0 ? (
                      <div>
                        <p className="mb-2 text-xs uppercase tracking-wide text-muted">
                          Platform variants
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {variants.slice(0, 4).map((variant) => {
                            const preview =
                              variant.media_asset?.url || variant.mediaAsset?.url;
                            return (
                              <div
                                key={variant.id || variant.platform_target}
                                className="overflow-hidden rounded-sm border border-line bg-ivory"
                              >
                                {preview ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={mediaUrl(preview)}
                                    alt={variant.platform_target}
                                    className="h-20 w-full object-contain"
                                  />
                                ) : null}
                                <p className="truncate px-2 py-1 text-[10px] text-muted">
                                  {variant.platform_target}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-auto flex flex-wrap gap-2 pt-2">
                      <Button
                        disabled={busyId === `approve-${item.id}`}
                        onClick={() => approve(item)}
                      >
                        Approve
                      </Button>
                      <Button variant="secondary" onClick={() => router.push("/content")}>
                        Edit in studio
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

export default function ContentReviewPage() {
  return (
    <DashboardShell
      title="Content review"
      description="Preview every pending creative before approval."
    >
      <Suspense fallback={<Skeleton className="h-64" />}>
        <ContentReviewInner />
      </Suspense>
    </DashboardShell>
  );
}
