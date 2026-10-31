"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  metaGraphMediaHint,
  validateMetaGraphMedia,
} from "@/lib/media/meta-graph-media-rules";
import { normalizeProductMediaUrlList } from "@/lib/commerce/product-specs";

/**
 * Multi-image direct file upload for Products (no URL paste).
 *
 * @param {{
 *   label?: string,
 *   hint?: string,
 *   values?: string[],
 *   folder?: string,
 *   disabled?: boolean,
 *   className?: string,
 *   onChange?: (urls: string[]) => void,
 * }} props
 */
export function ProductPhotosField({
  label = "Product photos",
  hint,
  values = [],
  folder = "products",
  disabled = false,
  className,
  onChange,
}) {
  const inputId = useId();
  const fileRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const photos = normalizeProductMediaUrlList(values);

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

  async function uploadOne(file) {
    const pre = validateMetaGraphMedia({
      mime_type: file.type,
      filename: file.name,
      size_bytes: file.size,
      kind: "image",
      allowed_kinds: ["image"],
    });
    if (!pre.ok) {
      throw new Error(pre.message || `${file.name} does not meet media rules.`);
    }
    const media_base64 = await readAsBase64(file);
    const result = await apiFetch("/v1/media/upload", {
      method: "POST",
      body: {
        filename: file.name,
        mime_type: file.type || pre.mime_type,
        media_type: "image",
        media_base64,
        purpose: "whatsapp",
        folder,
      },
    });
    if (!result?.ok || !result.url) {
      throw new Error(result?.message || `Upload failed for ${file.name}.`);
    }
    return String(result.media_url || result.url);
  }

  async function onPick(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    setError("");
    setBusy(true);
    try {
      /** @type {string[]} */
      const added = [];
      for (const file of files) {
        added.push(await uploadOne(file));
      }
      onChange?.(normalizeProductMediaUrlList([...photos, ...added]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function removeAt(index) {
    const next = photos.filter((_, i) => i !== index);
    onChange?.(next);
  }

  function moveToFront(index) {
    if (index <= 0) return;
    const next = [...photos];
    const [item] = next.splice(index, 1);
    next.unshift(item);
    onChange?.(next);
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
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          disabled={disabled || busy}
          onChange={onPick}
        />
        <Button
          type="button"
          size="sm"
          disabled={disabled || busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Uploading…" : photos.length ? "Add photos" : "Upload photos"}
        </Button>
        {photos.length ? (
          <span className="text-sm text-muted">
            {photos.length} photo{photos.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {photos.length ? (
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((url, index) => (
            <li
              key={`${url}-${index}`}
              className="group relative overflow-hidden border border-line bg-[color-mix(in_srgb,var(--line)_40%,transparent)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url.startsWith("//") ? `https:${url}` : url}
                alt=""
                className="aspect-square w-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-black/55 p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                {index > 0 ? (
                  <button
                    type="button"
                    className="flex-1 px-1 py-0.5 text-[10px] uppercase tracking-wide text-white"
                    onClick={() => moveToFront(index)}
                    disabled={disabled || busy}
                  >
                    Cover
                  </button>
                ) : (
                  <span className="flex-1 px-1 py-0.5 text-center text-[10px] uppercase tracking-wide text-gold">
                    Cover
                  </span>
                )}
                <button
                  type="button"
                  className="px-1 py-0.5 text-[10px] uppercase tracking-wide text-white"
                  onClick={() => removeAt(index)}
                  disabled={disabled || busy}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <span className="block text-sm text-danger">{error}</span> : null}
      {!error ? (
        <span className="block text-sm text-muted">
          {hint ||
            `${metaGraphMediaHint("image")} First photo is the cover; all sync to Shopify.`}
        </span>
      ) : null}
    </div>
  );
}
