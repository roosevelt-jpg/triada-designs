"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api-client";
import { creativeModeLabel } from "@/lib/integrations/brand-labels";
import { formatDateTime } from "@/lib/formatters";
import { nowDate, syncSystemTime } from "@/lib/system-time";

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function modeTone(mode) {
  const label = creativeModeLabel(mode);
  if (label === "Live AI" || mode === "live" || mode === "gemini" || mode === "anthropic") {
    return "success";
  }
  if (mode === "local_sim" || mode === "local" || mode === "local_seed") return "warning";
  return "neutral";
}

function mediaUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return url.startsWith("/") ? url : `/${url}`;
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
  const [scheduleDrafts, setScheduleDrafts] = useState({});

  const refreshMedia = useCallback(async (itemId) => {
    try {
      const media = await apiFetch(`/v1/content/${itemId}/media`);
      setMediaByItem((prev) => ({ ...prev, [itemId]: media }));
      return media;
    } catch {
      return null;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [response, pubs, creative] = await Promise.all([
        apiFetch("/v1/content"),
        apiFetch("/v1/publications"),
        apiFetch("/v1/creative/status").catch(() => null),
      ]);
      const list = response.data || [];
      setItems(list);
      setPublications(pubs.data || []);
      setCreativeStatus(creative);
      await Promise.all(list.map((item) => refreshMedia(item.id)));
    } catch (err) {
      setError(err.message || "Failed to load content");
    } finally {
      setLoading(false);
    }
  }, [refreshMedia]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(id) {
    setBusyId(`approve-${id}`);
    try {
      const result = await apiFetch(`/v1/content/${id}/approve`, { method: "POST" });
      setNotice(
        `Approved (v${result.content?.approval_version ?? "?"}). Ready to schedule.`
      );
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
      const draft = scheduleDrafts[item.id];
      const when = draft
        ? new Date(draft).toISOString()
        : new Date(nowDate().getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
      await apiFetch(`/v1/content/${item.id}/schedule`, {
        method: "POST",
        body: { scheduled_for: when },
      });
      setNotice(
        `Scheduled for ${formatDateTime(when)}. Appears on Calendar.`
      );
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
        `Image generated (${creativeModeLabel(result.mode)}). Approval is still required before publish.`
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
        `Generated ${count} platform variants (${creativeModeLabel(result.mode)}).`
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
        `Short video drafted (${result.mode_label || creativeModeLabel(result.mode) || "ready"}). Open Calendar to approve and schedule.`
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function generateUgcVideo(item) {
    setBusyId(`ugc-${item.id}`);
    setNotice("");
    try {
      const result = await apiFetch(`/v1/content/${item.id}/generate-ugc-video`, {
        method: "POST",
        body: {
          product: item.product_context?.name || "Triada Designs jewellery",
          style: "ugc",
          storyboard:
            bodyStoryboardUgc(item.product_context?.name || "jewellery"),
          duration_ms: 8000,
        },
      });
      setNotice(
        `UGC video queued for approval (${result.mode_label || creativeModeLabel(result.mode) || "ready"}). Open Calendar to approve and schedule.`
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function bodyStoryboardUgc(product) {
    return `Handheld UGC vertical of ${product}: natural desk light, authentic voiceover, soft end frame — no fake badges.`;
  }

  async function generateAnimation(item) {
    setBusyId(`anim-${item.id}`);
    setNotice("");
    try {
      const result = await apiFetch(`/v1/content/${item.id}/generate-animation`, {
        method: "POST",
        body: {
          product: item.product_context?.name || "Triada Designs jewellery",
          storyboard: "Subtle jewellery motion loop for feed and stories.",
        },
      });
      setNotice(`Marketing animation drafted (${result.mode}).`);
      await refreshMedia(item.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function ensureCreative(item) {
    setBusyId(`pack-${item.id}`);
    setNotice("");
    try {
      const result = await apiFetch(`/v1/content/${item.id}/ensure-creative`, {
        method: "POST",
        body: {
          force: true,
          with_video: true,
          with_animation: true,
          product: item.product_context?.name || "Triada Designs jewellery",
        },
      });
      const variantCount = result.variants?.variants?.length || result.variants?.length || 0;
      setNotice(
        `Full creative pack ready (${creativeModeLabel(result.mode)}): image + ${variantCount} variants + video + animation.`
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
      description="Generate, approve, schedule, and publish."
    >
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading && creativeStatus ? (
        <section className="mb-6 surface-card space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="ops-section-title">Creative AI</h2>
            <Badge tone={modeTone(imageMode)}>
              Image: {creativeStatus.image?.mode_label || creativeModeLabel(imageMode)}
            </Badge>
            <Badge tone={modeTone(videoMode)}>
              Video: {creativeStatus.video?.mode_label || creativeModeLabel(videoMode)}
            </Badge>
          </div>
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
            const sourceImages = assets.filter(
              (a) => a.kind === "image" && !a.metadata?.platform_target
            );
            const videos = assets.filter((a) => a.kind === "video");
            const animations = assets.filter((a) => a.kind === "animation");
            const hero = sourceImages[0] || assets.find((a) => a.kind === "image");

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

                {hero?.url ? (
                  <div className="mt-4 overflow-hidden rounded-sm border border-line bg-stone/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mediaUrl(hero.url)}
                      alt={`${item.title} creative`}
                      className="max-h-56 w-full object-contain"
                    />
                    <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-xs">
                      <Badge tone={modeTone(hero.mode)}>{hero.mode}</Badge>
                      <span className="text-muted">
                        {hero.kind} · {hero.width}×{hero.height}
                        {hero.aspect_ratio ? ` · ${hero.aspect_ratio}` : ""}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted">No creative image yet — generate pack below.</p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    disabled={busyId === `pack-${item.id}`}
                    onClick={() => ensureCreative(item)}
                  >
                    Generate full creative
                  </Button>
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
                  <Button
                    disabled={busyId === `ugc-${item.id}`}
                    onClick={() => generateUgcVideo(item)}
                  >
                    Generate UGC video
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busyId === `anim-${item.id}`}
                    onClick={() => generateAnimation(item)}
                  >
                    Generate animation
                  </Button>
                  <Button variant="ghost" onClick={() => refreshMedia(item.id)}>
                    Refresh media
                  </Button>
                </div>

                {variants.length > 0 || videos.length > 0 || animations.length > 0 ? (
                  <div className="mt-4 space-y-3 border-t border-line pt-4">
                    {variants.length > 0 ? (
                      <div>
                        <p className="mb-2 text-xs uppercase tracking-wide text-muted">
                          Platform variants ({variants.length})
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {variants.map((variant) => {
                            const preview = variant.media_asset?.url || variant.mediaAsset?.url;
                            return (
                              <div
                                key={variant.id}
                                className="overflow-hidden rounded-sm border border-line bg-stone/40"
                              >
                                {preview ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={mediaUrl(preview)}
                                    alt={variant.platform_target}
                                    className="h-28 w-full object-contain bg-ivory"
                                  />
                                ) : null}
                                <div className="space-y-1 px-3 py-2 text-xs">
                                  <p className="font-medium text-ink">{variant.platform_target}</p>
                                  <p className="text-muted">
                                    {variant.width}×{variant.height}
                                    {variant.aspect_ratio ? ` · ${variant.aspect_ratio}` : ""}
                                  </p>
                                  <Badge tone={modeTone(variant.mode)}>{variant.mode}</Badge>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {(videos.length > 0 || animations.length > 0) ? (
                      <div className="flex flex-wrap gap-3">
                        {videos.map((asset) => (
                          <div key={asset.id} className="min-w-[140px] flex-1 rounded-sm border border-line p-2 text-xs">
                            <Badge tone={modeTone(asset.mode)}>{asset.mode}</Badge>
                            <p className="mt-1 text-muted">
                              video · {asset.width}×{asset.height}
                              {asset.duration_ms ? ` · ${Math.round(asset.duration_ms / 1000)}s` : ""}
                            </p>
                            {asset.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={mediaUrl(asset.url)}
                                alt="video storyboard"
                                className="mt-2 h-20 w-full object-contain"
                              />
                            ) : null}
                          </div>
                        ))}
                        {animations.map((asset) => (
                          <div key={asset.id} className="min-w-[140px] flex-1 rounded-sm border border-line p-2 text-xs">
                            <Badge tone={modeTone(asset.mode)}>{asset.mode}</Badge>
                            <p className="mt-1 text-muted">
                              animation · {asset.width}×{asset.height}
                            </p>
                            {asset.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={mediaUrl(asset.url)}
                                alt="animation preview"
                                className="mt-2 h-20 w-full object-contain"
                              />
                            ) : null}
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
                      <Input
                        type="datetime-local"
                        label="Calendar date"
                        className="min-w-[12rem]"
                        value={
                          scheduleDrafts[item.id] ||
                          toLocalInputValue(
                            new Date(nowDate().getTime() + 3 * 24 * 60 * 60 * 1000)
                          )
                        }
                        onChange={(e) =>
                          setScheduleDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                      />
                      <Button
                        variant="secondary"
                        disabled={busyId === `schedule-${item.id}`}
                        onClick={() => schedule(item)}
                      >
                        Schedule on calendar
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
