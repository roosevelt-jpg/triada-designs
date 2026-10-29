"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  META_WHATSAPP_IMAGE_VIDEO_ACCEPT,
  metaGraphMediaHint,
  validateMetaGraphMedia,
} from "@/lib/media/meta-graph-media-rules";

/**
 * Direct file upload for image/video fields (no URL paste).
 * Enforces Meta / WhatsApp Graph format & size rules by default.
 *
 * @param {{
 *   label?: string,
 *   hint?: string,
 *   value?: string,
 *   mediaType?: string,
 *   purpose?: "whatsapp"|"meta"|"general",
 *   folder?: string,
 *   accept?: string,
 *   disabled?: boolean,
 *   required?: boolean,
 *   className?: string,
 *   onUploaded?: (payload: {
 *     url: string,
 *     media_url: string,
 *     media_type: string,
 *     mime_type: string,
 *     filename: string,
 *     size_bytes: number,
 *     storage?: string,
 *   }) => void,
 *   onClear?: () => void,
 *   onMediaTypeChange?: (mediaType: string) => void,
 * }} props
 */
export function MediaUploadField({
  label = "Media file",
  hint,
  value = "",
  mediaType = "",
  purpose = "whatsapp",
  folder = "uploads",
  accept = META_WHATSAPP_IMAGE_VIDEO_ACCEPT,
  disabled = false,
  required = false,
  className,
  onUploaded,
  onClear,
  onMediaTypeChange,
}) {
  const inputId = useId();
  const fileRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localName, setLocalName] = useState("");

  const previewIsImage =
    Boolean(value) &&
    (String(mediaType).toLowerCase() === "image" ||
      /^data:image\//i.test(value) ||
      /\.(jpe?g|png)(\?|$)/i.test(value));
  const previewIsVideo =
    Boolean(value) &&
    (String(mediaType).toLowerCase() === "video" ||
      /^data:video\//i.test(value) ||
      /\.(mp4|3gp)(\?|$)/i.test(value));

  async function readAsBase64(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function onPick(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    const pre = validateMetaGraphMedia({
      mime_type: file.type,
      filename: file.name,
      size_bytes: file.size,
      kind: mediaType || null,
      allowed_kinds:
        mediaType === "image" ? ["image"] : mediaType === "video" ? ["video"] : ["image", "video"],
    });
    if (!pre.ok) {
      setError(pre.message || "File does not meet Meta Graph media rules.");
      return;
    }

    setBusy(true);
    try {
      const media_base64 = await readAsBase64(file);
      const result = await apiFetch("/v1/media/upload", {
        method: "POST",
        body: {
          filename: file.name,
          mime_type: file.type || pre.mime_type,
          media_type: pre.kind || mediaType || undefined,
          media_base64,
          purpose,
          folder,
        },
      });
      if (!result?.ok || !result.url) {
        setError(result?.message || "Upload failed.");
        return;
      }
      setLocalName(file.name);
      if (onMediaTypeChange && result.media_type) {
        onMediaTypeChange(String(result.media_type));
      }
      onUploaded?.({
        url: result.url,
        media_url: result.media_url || result.url,
        media_type: String(result.media_type || pre.kind || "image"),
        mime_type: String(result.mime_type || pre.mime_type),
        filename: String(result.filename || file.name),
        size_bytes: Number(result.size_bytes || file.size) || file.size,
        storage: result.storage,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setError("");
    setLocalName("");
    onClear?.();
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <span className="block text-[13px] font-medium text-ink">{label}</span>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled || busy}
          required={required && !value}
          onChange={onPick}
        />
        <Button
          type="button"
          size="sm"
          disabled={disabled || busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Uploading…" : value ? "Replace file" : "Upload file"}
        </Button>
        {value ? (
          <Button type="button" size="sm" variant="secondary" disabled={disabled || busy} onClick={clear}>
            Remove
          </Button>
        ) : null}
        {localName || value ? (
          <span className="max-w-[16rem] truncate text-sm text-muted">
            {localName || (String(value).startsWith("data:") ? "Uploaded media" : "Media ready")}
          </span>
        ) : null}
      </div>

      {previewIsImage && value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          className="mt-1 max-h-40 max-w-full border border-line object-contain"
        />
      ) : null}
      {previewIsVideo && value && !String(value).startsWith("data:") ? (
        <video
          src={value}
          controls
          className="mt-1 max-h-40 max-w-full border border-line"
        />
      ) : null}

      {error ? <span className="block text-sm text-danger">{error}</span> : null}
      {!error ? (
        <span className="block text-sm text-muted">
          {hint || metaGraphMediaHint(mediaType === "image" ? "image" : mediaType === "video" ? "video" : "image_video")}
        </span>
      ) : null}
    </div>
  );
}
