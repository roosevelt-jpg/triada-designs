"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { nowDate, syncSystemTime } from "@/lib/system-time";

function modeTone(mode) {
  if (mode === "live") return "success";
  if (mode === "local_sim" || mode === "local") return "warning";
  return "neutral";
}

export default function ContentPage() {
  const [items, setItems] = useState([]);
  const [publications, setPublications] = useState([]);
  const [creativeStatus, setCreativeStatus] = useState(null);
  const [mediaByItem, setMediaByItem] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [response, pubs, creative] = await Promise.all([
        apiFetch("/v1/content"),
        apiFetch("/v1/publications"),
        apiFetch("/v1/creative/status").catch(() => null),
      ]);
      setItems(response.data || []);
      setPublications(pubs.data || []);
      setCreativeStatus(creative);
    } catch (err) {
      setError(err.message || "Failed to load content");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshMedia(itemId) {
    try {
      const media = await apiFetch(`/v1/content/${itemId}/media`);
      setMediaByItem((prev) => ({ ...prev, [itemId]: media }));
    } catch {
      // non-fatal
    }
  }

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
      await syncSystemTime().catch(() => {});
      const when = new Date(nowDate().getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
      await apiFetch(`/v1/content/${item.id}/schedule`, {
        method: "POST",
        body: { scheduled_for: when },
      });
      setNotice(`Scheduled for ${when} (server/workspace-aligned now + 3 days)`);
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

  async function generateImage(item) {
    setBusyId(`img-${item.id}`);
    setNotice("");
    try {
      const result = await apiFetch(`/v1/content/${item.id}/generate-image`, {
        method: "POST",
        body: {
          product: item.product_context?.name || "Triada Designs jewellery",
          materials: item.product_context?.materials || "gold, refined stones",
        },
      });
      setNotice(
        `Image generated (${result.mode}). Status badge shows local_sim vs live — approval still required before publish.`
      );
      await refreshMedia(item.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function generateVariants(item) {
    setBusyId(`var-${item.id}`);
    setNotice("");
    try {
      const result = await apiFetch(`/v1/content/${item.id}/generate-variants`, {
        method: "POST",
        body: {},
      });
      const count = result.variants?.length || 0;
      setNotice(
        `Generated ${count} platform variants (${result.mode}, engine: ${result.resize_engine || "n/a"}).`
      );
      await refreshMedia(item.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function generateVideo(item) {
    setBusyId(`vid-${item.id}`);
    setNotice("");
    try {
      const result = await apiFetch(`/v1/content/${item.id}/generate-video`, {
        method: "POST",
        body: {
          product: item.product_context?.name || "Triada Designs jewellery",
          storyboard: "Slow push-in on jewellery, soft light shift, calm end frame.",
        },
      });
      setNotice(
        `Short video/animation drafted (${result.mode}). ${
          result.sidecar?.placeholder_mp4
            ? "Local stub includes animated SVG + placeholder mp4."
            : ""
        }`
      );
      await refreshMedia(item.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const imageMode = creativeStatus?.image?.mode || "local_sim";
  const videoMode = creativeStatus?.video?.mode || "local_sim";

  return (
    <DashboardShell
      title="Content studio"
      description="Draft → creative AI (image / variants / short video) → human approval → schedule/publish. Adapters: WordPress + Meta page (local sim without credentials)."
    >
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading && creativeStatus ? (
        <section className="mb-6 surface-card space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="ops-section-title">Creative AI</h2>
            <Badge tone={modeTone(imageMode)}>Image: {imageMode}</Badge>
            <Badge tone={modeTone(videoMode)}>Video: {videoMode}</Badge>
            <Badge tone="neutral">Resize: {creativeStatus.resize_engine}</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted">{creativeStatus.honesty}</p>
          <p className="max-w-3xl text-sm text-muted">
            {creativeStatus.image?.message} {creativeStatus.video?.message}
          </p>
        </section>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState title="No content items" description="Generate or create a draft to begin review." />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => {
            const media = mediaByItem[item.id];
            const assets = media?.assets || [];
            const variants = media?.variants || [];
            return (
              <article key={item.id} className="surface-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="ops-section-title">{item.title}</h3>
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
                  {item.product_context?.name ? ` · ${item.product_context.name}` : ""}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={busyId === `img-${item.id}`}
                    onClick={() => generateImage(item)}
                  >
                    Generate image
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busyId === `var-${item.id}`}
                    onClick={() => generateVariants(item)}
                  >
                    Generate variants
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busyId === `vid-${item.id}`}
                    onClick={() => generateVideo(item)}
                  >
                    Generate short video
                  </Button>
                  <Button variant="ghost" onClick={() => refreshMedia(item.id)}>
                    Refresh media
                  </Button>
                </div>

                {assets.length > 0 || variants.length > 0 ? (
                  <div className="mt-4 space-y-3 border-t border-line pt-4">
                    {assets.slice(0, 4).map((asset) => (
                      <div key={asset.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge tone={modeTone(asset.mode)}>{asset.mode}</Badge>
                        <span className="text-muted">
                          {asset.kind} · {asset.width}×{asset.height}
                          {asset.aspect_ratio ? ` · ${asset.aspect_ratio}` : ""}
                        </span>
                      </div>
                    ))}
                    {variants.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {variants.map((variant) => (
                          <div
                            key={variant.id}
                            className="rounded-sm border border-line bg-stone/40 px-3 py-2 text-xs"
                          >
                            <p className="font-medium text-ink">{variant.platform_target}</p>
                            <p className="text-muted">
                              {variant.width}×{variant.height}
                              {variant.aspect_ratio ? ` · ${variant.aspect_ratio}` : ""}
                            </p>
                            <Badge tone={modeTone(variant.mode)}>{variant.mode}</Badge>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

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
            );
          })}
        </div>
      ) : null}

      {!loading ? (
        <div className="mt-8 surface-card p-5">
          <h2 className="ops-section-title">Publication logs</h2>
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
