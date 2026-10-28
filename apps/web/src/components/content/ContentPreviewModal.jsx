"use client";

import { useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { creativeModeLabel } from "@/lib/integrations/brand-labels";

function mediaUrl(url) {
  if (!url) return null;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? url : `/${url}`;
}

/**
 * Preview-before-approval modal shown after image/video generation,
 * and when reopening pending creatives from Content Studio.
 * Approval happens here (or on /content/review) — not from the card list.
 *
 * @param {{
 *   open: boolean,
 *   item: object|null,
 *   asset: object|null,
 *   variants?: object[],
 *   busy?: boolean,
 *   onClose: () => void,
 *   onApprove: () => void,
 *   onOpenReview: () => void,
 * }} props
 */
export function ContentPreviewModal({
  open,
  item,
  asset,
  variants = [],
  busy = false,
  onClose,
  onApprove,
  onOpenReview,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || !item) return null;

  const url = mediaUrl(asset?.url);
  const kind = asset?.kind || "image";
  const modeLabel = creativeModeLabel(asset?.mode || "local_sim");
  const canApprove = item.status === "in_review" || item.status === "draft";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="content-preview-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-md border border-line bg-ivory shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Preview before approval</p>
            <h2 id="content-preview-title" className="ops-section-title mt-1">
              {item.title}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
            aria-label="Close preview"
          >
            Close
          </Button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="overflow-hidden rounded-sm border border-line bg-stone/30">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={`${item.title} ${kind} preview`}
                className="max-h-[28rem] w-full object-contain bg-ivory"
              />
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-muted">
                Preview media is not available yet — generate creative first.
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-xs">
              <Badge tone="warning">{item.status || "in_review"}</Badge>
              <Badge tone="neutral">{kind}</Badge>
              <Badge tone="brand">{modeLabel}</Badge>
              {asset?.width && asset?.height ? (
                <span className="text-muted">
                  {asset.width}×{asset.height}
                  {asset.duration_ms ? ` · ${Math.round(asset.duration_ms / 1000)}s` : ""}
                </span>
              ) : null}
            </div>
          </div>

          {variants.length > 0 ? (
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted">
                Platform variants
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {variants.slice(0, 4).map((variant) => {
                  const preview = variant.media_asset?.url || variant.mediaAsset?.url;
                  return (
                    <div
                      key={variant.id || variant.platform_target}
                      className="overflow-hidden rounded-sm border border-line bg-white"
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

          {item.body ? <p className="text-sm text-muted">{item.body}</p> : null}

          <p className="text-sm text-brown-dark">
            {canApprove
              ? "Review this creative before approving. Approved items can be scheduled on the calendar."
              : "This item is already past pending review."}
          </p>

          <div className="flex flex-wrap gap-2">
            {canApprove ? (
              <Button disabled={busy || !url} onClick={onApprove}>
                Approve
              </Button>
            ) : null}
            <Button variant="secondary" disabled={busy} onClick={onOpenReview}>
              Open review queue
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              {canApprove ? "Keep pending" : "Close"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
