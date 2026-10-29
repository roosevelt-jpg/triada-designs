"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ContentPreviewModal } from "@/components/content/ContentPreviewModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { DatePicker } from "@/components/ui/DatePicker";
import { apiFetch } from "@/lib/api-client";
import { toIntlDateTimeValue } from "@/lib/date-format";
import { creativeModeLabel } from "@/lib/integrations/brand-labels";
import { formatDateTime } from "@/lib/formatters";
import { nowDate, syncSystemTime } from "@/lib/system-time";

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
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? url : `/${url}`;
}

export default function ContentPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [publications, setPublications] = useState([]);
  const [creativeStatus, setCreativeStatus] = useState(null);
  const [mediaByItem, setMediaByItem] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");
  const [scheduleDrafts, setScheduleDrafts] = useState({});
  const [preview, setPreview] = useState(null);

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
      setPreview(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function openPreview(item, asset, extraNotice = "", variants = []) {
    setPreview({
      item,
      asset: asset || null,
      variants: Array.isArray(variants) ? variants : [],
    });
    if (extraNotice) setNotice(extraNotice);
  }

  function previewExisting(item) {
    const media = mediaByItem[item.id];
    const assets = media?.assets || [];
    const asset =
      assets.find((a) => a.kind === "video") ||
      assets.find((a) => a.kind === "animation") ||
      assets.find((a) => a.kind === "image") ||
      assets[0] ||
      null;
    openPreview(item, asset, "", media?.variants || []);
  }

  function proposedFor(item) {
    return (
      item?.proposed_scheduled_for ||
      item?.publish_metadata?.proposed_scheduled_for ||
      null
    );
  }

  function schedulePickerValue(item) {
    if (scheduleDrafts[item.id]) return scheduleDrafts[item.id];
    if (item.scheduled_for) return toIntlDateTimeValue(new Date(item.scheduled_for));
    const proposal = proposedFor(item);
    if (proposal) return toIntlDateTimeValue(new Date(proposal));
    return toIntlDateTimeValue(new Date(nowDate().getTime() + 3 * 24 * 60 * 60 * 1000));
  }

  async function schedule(item, { explicitDraft = null, overrideProposal = false } = {}) {
    setBusyId(`schedule-${item.id}`);
    try {
      await syncSystemTime().catch(() => {});
      const draft = explicitDraft || schedulePickerValue(item);
      if (!draft) {
        setError("Choose a go-live date before scheduling.");
        return;
      }
      const when = new Date(draft).toISOString();
      await apiFetch(`/v1/content/${item.id}/schedule`, {
        method: "POST",
        body: { scheduled_for: when },
      });
      setNotice(
        overrideProposal
          ? `Your date overrides the AI proposal — goes live ${formatDateTime(when)}.`
          : `Scheduled by you for ${formatDateTime(when)}. Cancel or change anytime on Calendar.`
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function cancelSchedule(item) {
    if (
      !window.confirm(
        `Cancel the scheduled go-live for “${item.title}”? It stays approved until you set a new date.`
      )
    ) {
      return;
    }
    setBusyId(`cancel-${item.id}`);
    try {
      await apiFetch(`/v1/content/${item.id}/cancel-schedule`, { method: "POST" });
      setNotice(`Cancelled schedule for “${item.title}”. Still approved.`);
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
          share_all: adapter === "all_channels",
          approval_version: item.approval_version,
        },
      });
      if (!result.ok) {
        setError(result.error || "Publish blocked");
      } else {
        const fan = result.subscriber_fanout;
        const fanNote =
          fan && !fan.skipped
            ? ` · Subscribers emailed ${fan.channels?.email?.sent ?? 0}, WhatsApp ${fan.channels?.whatsapp?.sent ?? 0}, Telegram ${fan.channels?.telegram?.sent ?? 0}`
            : "";
        setNotice(
          adapter === "all_channels"
            ? `Shared on all channels (${result.result?.mode || "local"})${fanNote}.`
            : `Published via ${adapter} (${result.result?.mode || "local"})${fanNote}.`,
        );
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
      const nextItem = result.content || { ...item, status: "in_review" };
      const media = await refreshMedia(item.id);
      openPreview(
        nextItem,
        result.asset,
        `Image ready for preview (${creativeModeLabel(result.mode)}).`,
        media?.variants || result.variants || []
      );
      await load();
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
      const nextItem = result.content || { ...item, status: "in_review" };
      const media = await refreshMedia(item.id);
      openPreview(
        nextItem,
        result.asset || result.variants?.[0]?.media_asset,
        `Generated ${count} platform variants (${creativeModeLabel(result.mode)}). Preview before approval.`,
        media?.variants || result.variants || []
      );
      await load();
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
          storyboard:
            "0-1s jewellery hook close-up; mid soft Gulf light + desire beat; end calm CTA frame.",
        },
      });
      const nextItem = result.content || { ...item, status: "in_review" };
      const media = await refreshMedia(item.id);
      openPreview(
        nextItem,
        result.asset,
        `Short video ready for preview (${result.mode_label || creativeModeLabel(result.mode) || "ready"}).`,
        media?.variants || []
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
      const nextItem = result.content || { ...item, status: "in_review" };
      const media = await refreshMedia(item.id);
      openPreview(
        nextItem,
        result.asset,
        `UGC video ready for preview (${result.mode_label || creativeModeLabel(result.mode) || "ready"}).`,
        media?.variants || []
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function bodyStoryboardUgc(product) {
    return `Viral UGC vertical of ${product}: first-second hook close-up, natural Gulf desk light, authentic voiceover, soft conversion CTA — no fake badges.`;
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
      const nextItem = result.content || { ...item, status: "in_review" };
      const media = await refreshMedia(item.id);
      openPreview(
        nextItem,
        result.asset,
        `Animation ready for preview (${creativeModeLabel(result.mode)}).`,
        media?.variants || []
      );
      await load();
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
      const variantCount = result.variants?.length || 0;
      const nextItem = result.content || { ...item, status: "in_review" };
      const media = await refreshMedia(item.id);
      openPreview(
        nextItem,
        result.asset,
        `Full creative pack ready (${creativeModeLabel(result.mode)}): preview before approval · ${variantCount} variants.`,
        media?.variants || result.variants || []
      );
      await load();
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
      description="You approve and set go-live — AI never auto-publishes."
    >
      <ContentPreviewModal
        open={Boolean(preview)}
        item={preview?.item || null}
        asset={preview?.asset || null}
        variants={preview?.variants || []}
        busy={Boolean(busyId && String(busyId).startsWith("approve-"))}
        onClose={() => setPreview(null)}
        onApprove={() => preview?.item?.id && approve(preview.item.id)}
        onOpenReview={() => {
          const id = preview?.item?.id;
          setPreview(null);
          router.push(id ? `/content/review?highlight=${encodeURIComponent(id)}` : "/content/review");
        }}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => router.push("/content/review")}>
          Open review queue
        </Button>
        <Button variant="secondary" size="sm" onClick={() => router.push("/content/inspiration")}>
          Quote & Inspiration
        </Button>
      </div>

      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading ? (
        <section className="mb-6 border border-brown/25 bg-brown/5 px-5 py-4">
          <p className="font-medium text-ink">Admin controls the calendar</p>
          <p className="mt-1 text-sm text-muted">
            After you approve, you choose the go-live datetime, reschedule, or cancel. AI may
            propose a slot — only your confirmed date goes on the calendar.
          </p>
        </section>
      ) : null}

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
                  <button
                    type="button"
                    className="mt-4 w-full overflow-hidden rounded-sm border border-line bg-stone/30 text-left transition-colors hover:border-champagne"
                    onClick={() => previewExisting(item)}
                    aria-label={`Preview ${item.title}`}
                  >
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
                      <span className="text-brown-dark">Preview</span>
                    </div>
                  </button>
                ) : (
                  <p className="mt-4 text-sm text-muted">No creative image yet — generate pack below.</p>
                )}

                <div className="mt-4 ops-actions">
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

                <div className="mt-4 ops-actions">
                  {item.status === "in_review" || item.status === "draft" ? (
                    <Button
                      disabled={busyId === `approve-${item.id}`}
                      onClick={() => previewExisting(item)}
                    >
                      Preview & approve
                    </Button>
                  ) : null}
                  {item.status === "approved" ? (
                    <>
                      {proposedFor(item) ? (
                        <Badge tone="warning">
                          AI proposed {formatDateTime(proposedFor(item))}
                        </Badge>
                      ) : null}
                      <DatePicker
                        mode="datetime"
                        label="Your go-live time"
                        className="min-w-[12rem]"
                        value={schedulePickerValue(item)}
                        onChange={(next) =>
                          setScheduleDrafts((prev) => ({ ...prev, [item.id]: next }))
                        }
                      />
                      {proposedFor(item) ? (
                        <Button
                          variant="secondary"
                          disabled={busyId === `schedule-${item.id}`}
                          onClick={() => {
                            const draft = toIntlDateTimeValue(new Date(proposedFor(item)));
                            setScheduleDrafts((prev) => ({ ...prev, [item.id]: draft }));
                            schedule(item, { explicitDraft: draft });
                          }}
                        >
                          Use AI date
                        </Button>
                      ) : null}
                      <Button
                        variant="secondary"
                        disabled={busyId === `schedule-${item.id}`}
                        onClick={() =>
                          schedule(item, { overrideProposal: Boolean(proposedFor(item)) })
                        }
                      >
                        {proposedFor(item) ? "Override & schedule" : "Schedule on calendar"}
                      </Button>
                      <Button
                        disabled={busyId === `publish-${item.id}-all_channels`}
                        onClick={() => publish(item, "all_channels")}
                      >
                        Share all channels
                      </Button>
                      <Button
                        variant="secondary"
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
                      <p className="w-full text-sm text-muted">
                        Scheduled by you · {formatDateTime(item.scheduled_for)}
                      </p>
                      <DatePicker
                        mode="datetime"
                        label="Reschedule"
                        className="min-w-[12rem]"
                        value={schedulePickerValue(item)}
                        onChange={(next) =>
                          setScheduleDrafts((prev) => ({ ...prev, [item.id]: next }))
                        }
                      />
                      <Button
                        variant="secondary"
                        disabled={busyId === `schedule-${item.id}`}
                        onClick={() => schedule(item)}
                      >
                        Save new date
                      </Button>
                      <Button
                        variant="danger"
                        disabled={busyId === `cancel-${item.id}`}
                        onClick={() => cancelSchedule(item)}
                      >
                        Cancel schedule
                      </Button>
                      <Button
                        disabled={busyId === `publish-${item.id}-all_channels`}
                        onClick={() => publish(item, "all_channels")}
                      >
                        Share all channels
                      </Button>
                      <Button
                        variant="secondary"
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
