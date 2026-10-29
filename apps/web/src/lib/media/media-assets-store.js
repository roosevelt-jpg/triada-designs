/**
 * Direct media file uploads → Supabase Storage (bucket: media-assets).
 * Local mock falls back to data URLs under .triada-local when Supabase is unset.
 * Enforces Meta / WhatsApp Graph format & size rules when purpose is meta/whatsapp.
 * Never logs secrets or credentials.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  metaGraphMediaHint,
  validateMetaGraphMedia,
} from "@/lib/media/meta-graph-media-rules";

export const MEDIA_ASSETS_BUCKET = "media-assets";
const WORKSPACE_ID = "triada-ops";

/**
 * @param {string} [raw]
 */
function sanitizeFilename(raw) {
  const base = String(raw || "upload.bin")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120);
  return base || "upload.bin";
}

/**
 * @param {string} [data]
 * @returns {Buffer | null}
 */
function bufferFromBase64(data) {
  const raw = String(data || "").replace(/^data:[^;]+;base64,/, "").trim();
  if (!raw) return null;
  try {
    return Buffer.from(raw, "base64");
  } catch {
    return null;
  }
}

/**
 * @param {Buffer} bytes
 * @param {string} mime
 */
function toDataUrl(bytes, mime) {
  return `data:${mime || "application/octet-stream"};base64,${bytes.toString("base64")}`;
}

/**
 * Upload admin media for dashboard image/video fields.
 * @param {{
 *   filename?: string|null,
 *   mime_type?: string|null,
 *   media_type?: string|null,
 *   media_base64?: string|null,
 *   purpose?: "whatsapp"|"meta"|"general"|string|null,
 *   folder?: string|null,
 * }} input
 */
export async function uploadMediaAsset(input = {}) {
  const filename = sanitizeFilename(input.filename || "triada-media.bin");
  const purpose = String(input.purpose || "whatsapp").trim().toLowerCase() || "whatsapp";
  const enforceGraph = purpose === "whatsapp" || purpose === "meta" || purpose === "graph";

  const bytes = bufferFromBase64(input.media_base64);
  if (!bytes || !bytes.length) {
    return {
      ok: false,
      error: "media_bytes_required",
      message: "Upload a file (no image URL paste).",
      hint: metaGraphMediaHint("image_video"),
    };
  }

  const graph = validateMetaGraphMedia({
    mime_type: input.mime_type,
    filename,
    size_bytes: bytes.length,
    kind: input.media_type || null,
    allowed_kinds:
      String(input.media_type || "").toLowerCase() === "image"
        ? ["image"]
        : String(input.media_type || "").toLowerCase() === "video"
          ? ["video"]
          : ["image", "video"],
  });

  if (enforceGraph && !graph.ok) {
    return {
      ok: false,
      error: graph.error,
      message: graph.message,
      mime_type: graph.mime_type,
      media_type: graph.kind,
      size_bytes: bytes.length,
      hint: metaGraphMediaHint("image_video"),
      graph,
    };
  }

  const mime = graph.mime_type || String(input.mime_type || "application/octet-stream");
  const kind = graph.kind || String(input.media_type || "image");
  const folder = String(input.folder || purpose || "uploads")
    .replace(/[^a-z0-9/_-]/gi, "")
    .replace(/^\/+|\/+$/g, "") || "uploads";
  const id = `media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `${WORKSPACE_ID}/${folder}/${id}-${filename}`;

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const up = await supabase.storage.from(MEDIA_ASSETS_BUCKET).upload(storagePath, bytes, {
        upsert: false,
        contentType: mime,
        cacheControl: "3600",
      });

      if (!up.error) {
        const { data: pub } = supabase.storage
          .from(MEDIA_ASSETS_BUCKET)
          .getPublicUrl(storagePath);
        let url = pub?.publicUrl || null;

        if (!url) {
          const signed = await supabase.storage
            .from(MEDIA_ASSETS_BUCKET)
            .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
          url = signed?.data?.signedUrl || null;
        }

        if (url) {
          try {
            await supabase.from("media_assets").upsert({
              id,
              workspace_id: WORKSPACE_ID,
              filename,
              mime_type: mime,
              media_type: kind,
              size_bytes: bytes.length,
              storage_path: storagePath,
              public_url: url,
              purpose,
              metadata: {},
              created_at: new Date().toISOString(),
            });
          } catch {
            /* optional index table */
          }

          return {
            ok: true,
            url,
            media_url: url,
            mime_type: mime,
            media_type: kind,
            filename,
            size_bytes: bytes.length,
            storage: "supabase",
            storage_path: storagePath,
            bucket: MEDIA_ASSETS_BUCKET,
            purpose,
            graph: { ok: true, kind, mime_type: mime, max_bytes: graph.max_bytes },
            hint: metaGraphMediaHint(kind === "video" ? "video" : "image"),
          };
        }
      }
      // Fall through to local mock if bucket missing / RLS; surface soft note without secrets.
    }
  }

  // Local mock: persist bytes + return data URL (admin preview / Meta fetch from same process).
  try {
    const dir = path.join(getLocalDataDir(), "media-assets", folder);
    await mkdir(dir, { recursive: true });
    const localName = `${id}-${filename}`;
    await writeFile(path.join(dir, localName), bytes);
  } catch {
    /* data URL still returned */
  }

  const dataUrl = toDataUrl(bytes, mime);
  return {
    ok: true,
    url: dataUrl,
    media_url: dataUrl,
    mime_type: mime,
    media_type: kind,
    filename,
    size_bytes: bytes.length,
    storage: "local_mock",
    storage_path: null,
    bucket: null,
    purpose,
    graph: { ok: true, kind, mime_type: mime, max_bytes: graph.max_bytes },
    hint: metaGraphMediaHint(kind === "video" ? "video" : "image"),
  };
}
