"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

const DEFAULT_FORM = {
  template_name: "promo_product_spotlight",
  language: "en",
  body: "",
  promo_url: "",
  media_url: "",
  media_type: "image",
  send_mode: "template",
  limit: "25",
  insert_bestsellers: true,
};

export default function CampaignsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState([]);
  const [bestsellers, setBestsellers] = useState([]);
  const [quoteInspiration, setQuoteInspiration] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [draftMeta, setDraftMeta] = useState(null);
  const [sendResult, setSendResult] = useState(null);
  const [flash, setFlash] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [campaigns, best] = await Promise.all([
        apiFetch("/v1/campaigns"),
        apiFetch("/v1/products/bestsellers?limit=5").catch(() => ({ data: [] })),
      ]);
      setGroups(campaigns.data || []);
      setBestsellers(best.data || []);
      setQuoteInspiration(campaigns.quote_inspiration || null);
    } catch (err) {
      setError(err.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function draftWithBestsellers(event) {
    event.preventDefault();
    setBusy("draft");
    setFlash("");
    setDraftMeta(null);
    try {
      const result = await apiFetch("/v1/integrations/whatsapp/campaign-draft", {
        method: "POST",
        body: {
          objective: "bestseller_promo",
          insert_bestsellers: true,
          bestseller_count: 3,
          body: form.body || undefined,
          promo_url: form.promo_url || undefined,
          language: form.language || "en",
        },
      });
      setForm((prev) => ({
        ...prev,
        body: result.body || prev.body,
        promo_url: result.promo_url || prev.promo_url,
        media_url: result.media?.media_url || prev.media_url,
        media_type: result.media?.media_type || prev.media_type || "image",
        template_name: result.suggested_template || prev.template_name,
        insert_bestsellers: true,
      }));
      setDraftMeta(result);
      setFlash("Draft ready with best-seller product links.");
    } catch (err) {
      setFlash(err.message || "Draft failed");
    } finally {
      setBusy("");
    }
  }

  async function sendBroadcast(event) {
    event.preventDefault();
    setBusy("send");
    setFlash("");
    setSendResult(null);
    try {
      const result = await apiFetch("/v1/integrations/whatsapp/campaign-send", {
        method: "POST",
        body: {
          template_name: form.template_name || undefined,
          language: form.language || "en",
          body: form.body || undefined,
          promo_url: form.promo_url || undefined,
          media_url: form.media_url || undefined,
          media_type: form.media_type || "image",
          send_mode: form.send_mode || "template",
          insert_bestsellers: Boolean(form.insert_bestsellers),
          bestseller_count: 3,
          limit: Number(form.limit) || 25,
        },
      });
      setSendResult(result);
      setFlash(
        result.ok
          ? `Broadcast sent to ${result.sent}/${result.attempted} recipients.`
          : `Broadcast finished with ${result.failed} failed.`,
      );
    } catch (err) {
      setFlash(err.message || "Broadcast failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell
      title="Campaigns"
      description="WhatsApp broadcasts with product links, plus content grouped by objective."
    >
      {loading ? <Skeleton className="h-28" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && quoteInspiration ? (
        <section className="mb-6 surface-card space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">Inspiration list broadcast</h2>
              <p className="mt-1 text-sm text-muted">
                Campaign key{" "}
                <span className="text-ink">{quoteInspiration.campaign_key}</span>
                {" · "}
                {quoteInspiration.recipients_available || 0} WhatsApp-ready contacts
                {" · "}
                {(quoteInspiration.weekday_labels || []).join(", ") || "weekdays unset"}
                {quoteInspiration.next_send_at
                  ? ` · next ${formatDateTime(quoteInspiration.next_send_at)}`
                  : ""}
              </p>
            </div>
            <Badge tone={quoteInspiration.enabled ? "success" : "warning"}>
              {quoteInspiration.enabled ? "Active" : "Paused"}
            </Badge>
          </div>
          <Button size="sm" onClick={() => router.push("/content/inspiration")}>
            Open Quote & Inspiration
          </Button>
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="surface-card mb-6 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">WhatsApp broadcast</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted">
                Body supports product and promo URLs. AI can insert best-seller links and attach
                image or video from the catalog.
              </p>
            </div>
            {bestsellers.length ? (
              <Badge tone="brand">{bestsellers.length} best-sellers</Badge>
            ) : null}
          </div>

          {bestsellers.length ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {bestsellers.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="rounded-md border border-line bg-ivory px-3 py-1.5 text-left text-sm hover:border-gold"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        promo_url: p.promo_url || p.product_url || prev.promo_url,
                        media_url:
                          p.metadata?.photo_url && !prev.media_url
                            ? p.metadata.photo_url
                            : prev.media_url,
                      }))
                    }
                  >
                    <span className="font-medium text-ink">{p.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {p.promo_url || p.product_url}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <form className="mt-5 grid gap-3 md:grid-cols-2" onSubmit={sendBroadcast}>
            <Input
              label="Template name"
              name="template_name"
              value={form.template_name}
              onChange={(e) => updateField("template_name", e.target.value)}
            />
            <label className="text-sm">
              <span className="mb-1 block text-muted">Send mode</span>
              <select
                className="w-full rounded-md border border-line bg-ivory px-3 py-2"
                value={form.send_mode}
                onChange={(e) => updateField("send_mode", e.target.value)}
              >
                <option value="template">Template blast</option>
                <option value="session">Session media + caption</option>
              </select>
            </label>
            <Input
              label="Promo / product URL"
              name="promo_url"
              value={form.promo_url}
              onChange={(e) => updateField("promo_url", e.target.value)}
              placeholder="https://…/products/…"
            />
            <Input
              label="Recipient limit"
              name="limit"
              value={form.limit}
              onChange={(e) => updateField("limit", e.target.value)}
            />
            <label className="md:col-span-2 text-sm">
              <span className="mb-1 block text-muted">Broadcast body</span>
              <textarea
                className="min-h-[120px] w-full rounded-md border border-line bg-ivory px-3 py-2 text-sm"
                name="body"
                value={form.body}
                onChange={(e) => updateField("body", e.target.value)}
                placeholder="Warm greetings… Shop: {{product_url}}"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Media type</span>
              <select
                className="w-full rounded-md border border-line bg-ivory px-3 py-2"
                value={form.media_type}
                onChange={(e) => updateField("media_type", e.target.value)}
              >
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </label>
            <Input
              label="Media URL (image or video)"
              name="media_url"
              value={form.media_url}
              onChange={(e) => updateField("media_url", e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={Boolean(form.insert_bestsellers)}
                onChange={(e) => updateField("insert_bestsellers", e.target.checked)}
              />
              Insert best-selling product links into body
            </label>
            <div className="flex flex-wrap items-center gap-2 md:col-span-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy === "draft"}
                onClick={draftWithBestsellers}
              >
                {busy === "draft" ? "Drafting…" : "AI insert best-sellers"}
              </Button>
              <Button type="submit" disabled={busy === "send"}>
                {busy === "send" ? "Sending…" : "Send broadcast"}
              </Button>
              {flash ? <span className="text-sm text-muted">{flash}</span> : null}
            </div>
          </form>

          {draftMeta?.products?.length ? (
            <div className="mt-4 border-t border-line pt-4 text-sm">
              <p className="font-medium text-ink">Draft products</p>
              <ul className="mt-2 space-y-1 text-muted">
                {draftMeta.products.map((p) => (
                  <li key={p.id}>
                    {p.title} —{" "}
                    <a className="underline" href={p.promo_url} target="_blank" rel="noreferrer">
                      {p.promo_url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {sendResult ? (
            <div className="mt-4 border-t border-line pt-4 text-sm">
              <p className="font-medium text-ink">
                Last send · {sendResult.sent}/{sendResult.attempted} ·{" "}
                {sendResult.media_attached ? "media attached" : "no media"}
              </p>
              {sendResult.product_urls?.length ? (
                <p className="mt-1 text-muted">
                  URLs: {sendResult.product_urls.join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {!loading && !error && groups.length === 0 ? (
        <EmptyState
          title="No campaign content yet"
          description="Create content items to organize by objective, or send a WhatsApp broadcast above."
        />
      ) : null}
      {!loading && groups.length > 0 ? (
        <div className="space-y-4">
          <h2 className="font-display text-xl">Content by objective</h2>
          {groups.map((group) => (
            <section key={group.objective} className="surface-card p-5">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-2xl capitalize">{group.objective}</h3>
                <Badge tone="neutral">{group.count}</Badge>
              </div>
              <ul className="mt-3 space-y-2">
                {(group.items || []).map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm"
                  >
                    <span>{item.title}</span>
                    <span className="flex gap-2">
                      <Badge tone="brand">{item.channel || "—"}</Badge>
                      <Badge tone="neutral">{item.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
