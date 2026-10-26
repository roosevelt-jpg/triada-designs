"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";

export default function IntegrationsPage() {
  const [health, setHealth] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [draftTitle, setDraftTitle] = useState("Quiet materials, considered care");
  const [draftStatus, setDraftStatus] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [anthropicModel, setAnthropicModel] = useState("claude-sonnet-4-20250514");
  const [anthropicStatus, setAnthropicStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, healthData] = await Promise.all([
        apiFetch("/v1/integrations"),
        apiFetch("/v1/integrations/health"),
      ]);
      setIntegrations(list.data || []);
      setHealth(healthData);
      if (healthData?.anthropic?.model) {
        setAnthropicModel(healthData.anthropic.model);
      }
    } catch (err) {
      setError(err.message || "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createDraft(event) {
    event.preventDefault();
    setDraftStatus("");
    try {
      const result = await apiFetch("/v1/integrations/wordpress/drafts", {
        method: "POST",
        body: {
          title: draftTitle,
          excerpt: "Draft prepared from Triada Content Studio for WordPress.",
          content: "<p>Editorial draft awaiting human review before publish.</p>",
        },
      });
      setDraftStatus(`Draft created (${result.source || "wordpress"}): ${result.id}`);
    } catch (err) {
      setDraftStatus(err.message);
    }
  }

  async function saveAnthropic(event) {
    event.preventDefault();
    setAnthropicStatus("");
    try {
      const result = await apiFetch("/v1/integrations/anthropic", {
        method: "POST",
        body: {
          api_key: anthropicKey || undefined,
          model: anthropicModel || undefined,
        },
      });
      setAnthropicKey("");
      setAnthropicStatus(
        result.anthropic?.has_credentials
          ? "Anthropic key stored. Agents use Claude; creative intelligence follows Anthropic path. local_sim until keyed was cleared."
          : result.anthropic?.honesty || "Saved."
      );
      load();
    } catch (err) {
      setAnthropicStatus(err.message);
    }
  }

  async function clearAnthropic() {
    setAnthropicStatus("");
    try {
      await apiFetch("/v1/integrations/anthropic/clear", { method: "POST" });
      setAnthropicStatus("Cleared Integrations-stored Anthropic key (env key unaffected).");
      load();
    } catch (err) {
      setAnthropicStatus(err.message);
    }
  }

  return (
    <DashboardShell
      title="Integrations"
      description="Anthropic (primary AI), WordPress, Zoho, Meta, Shopify, and messaging channels. Local seed / local_sim without credentials; never shown as healthy without tokens."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/integrations/meta">
            <Button size="sm">Meta hub</Button>
          </Link>
          <Link href="/integrations/shopify">
            <Button size="sm" variant="secondary">
              Shopify
            </Button>
          </Link>
          <Link href="/integrations/channels">
            <Button size="sm" variant="secondary">
              Sales channels
            </Button>
          </Link>
          <Link href="/templates">
            <Button size="sm" variant="secondary">
              Templates
            </Button>
          </Link>
        </div>
      }
    >
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="brand">Mode: {health?.mode || "local"}</Badge>
            <Button size="sm" variant="secondary" onClick={load}>
              Re-check health
            </Button>
          </div>

          <section className="surface-card overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="ops-section-title">Anthropic (Claude) — primary AI</h2>
                <p className="mt-1 text-sm text-muted">
                  Paste your API key here for agents and creative intelligence. Without a key the stack stays on
                  local_sim / local heuristic — never reports live Claude success.
                </p>
              </div>
              <Badge
                tone={
                  health?.anthropic?.has_credentials
                    ? "success"
                    : health?.anthropic?.status === "awaiting_credentials"
                      ? "neutral"
                      : "neutral"
                }
              >
                {health?.anthropic?.status || "awaiting_credentials"}
              </Badge>
            </div>
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-muted">{health?.anthropic?.honesty}</p>
              <p className="text-xs text-muted">
                Model: {health?.anthropic?.model || anthropicModel} · Provider default: anthropic
              </p>
              <form className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end" onSubmit={saveAnthropic}>
                <Input
                  label="Anthropic API key"
                  name="anthropic_api_key"
                  type="password"
                  autoComplete="off"
                  placeholder={health?.anthropic?.has_credentials ? "•••• stored — paste to replace" : "sk-ant-…"}
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                />
                <Input
                  label="Model"
                  name="anthropic_model"
                  value={anthropicModel}
                  onChange={(e) => setAnthropicModel(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    Save key
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={clearAnthropic}>
                    Clear
                  </Button>
                </div>
              </form>
              {anthropicStatus ? <p className="text-sm text-muted">{anthropicStatus}</p> : null}
            </div>
          </section>

          {health?.meta ? (
            <section className="surface-card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="ops-section-title">Meta messaging</h2>
                  <p className="mt-1 text-sm text-muted">
                    Facebook, Instagram, and WhatsApp managed from Triada after one-time Meta
                    Developer setup.
                  </p>
                </div>
                <Link href="/integrations/meta">
                  <Button size="sm" variant="secondary">
                    Open Meta hub
                  </Button>
                </Link>
              </div>
              <div className="grid gap-0 md:grid-cols-3 md:divide-x md:divide-line">
                {["facebook", "instagram", "whatsapp"].map((key) => {
                  const ch = health.meta.channels?.[key];
                  return (
                    <div key={key} className="border-t border-line px-5 py-4 md:border-t-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium capitalize text-ink">{key}</p>
                        <Badge
                          tone={
                            ch?.health?.status === "healthy"
                              ? "success"
                              : ch?.health?.status === "error"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {ch?.status || ch?.health?.status || "—"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted">
                        {ch?.health?.message}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="ops-section-title">WordPress</h2>
                  <p className="mt-1 text-sm text-muted">
                    CMS knowledge source and draft publishing path via REST API.
                  </p>
                </div>
                <Badge
                  tone={
                    health?.wordpress?.status === "healthy"
                      ? "success"
                      : health?.wordpress?.status === "seeded" ||
                          health?.wordpress?.status === "local"
                        ? "neutral"
                        : "danger"
                  }
                >
                  {health?.wordpress?.status}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-muted">{health?.wordpress?.message}</p>
              <ul className="mt-4 space-y-2">
                {(health?.wordpress_posts || []).map((post) => (
                  <li
                    key={post.id}
                    className="rounded-md border border-line px-3 py-2.5 text-sm transition-colors duration-150 hover:bg-stone/40"
                  >
                    <p className="font-medium text-ink">{post.title}</p>
                    <p className="text-muted">{post.excerpt}</p>
                  </li>
                ))}
              </ul>
              <form className="mt-5 space-y-3" onSubmit={createDraft}>
                <Input
                  label="Create WordPress draft"
                  name="title"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                />
                <Button type="submit" size="sm">
                  Create draft
                </Button>
                {draftStatus ? <p className="text-sm text-muted">{draftStatus}</p> : null}
              </form>
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="ops-section-title">Zoho CRM</h2>
                  <p className="mt-1 text-sm text-muted">
                    Contact and lead upsert with OAuth refresh-token support.
                  </p>
                </div>
                <Badge
                  tone={
                    health?.zoho?.status === "healthy"
                      ? "success"
                      : health?.zoho?.status === "seeded" || health?.zoho?.status === "local"
                        ? "neutral"
                        : "danger"
                  }
                >
                  {health?.zoho?.status}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-muted">{health?.zoho?.message}</p>
              <ul className="mt-4 space-y-2">
                {(health?.zoho_leads || []).map((lead) => (
                  <li
                    key={lead.id}
                    className="rounded-md border border-line px-3 py-2.5 text-sm transition-colors duration-150 hover:bg-stone/40"
                  >
                    <p className="font-medium text-ink">{lead.name}</p>
                    <p className="text-muted">
                      {lead.email || "—"} · {lead.stage || "—"}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Registered integrations</h2>
            </div>
            <div className="divide-y divide-line">
              {integrations.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 px-5 py-3.5 transition-colors duration-150 hover:bg-stone/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-ink">{item.display_name}</p>
                    <p className="text-sm capitalize text-muted">{item.provider}</p>
                  </div>
                  <Badge
                    tone={
                      item.status === "connected"
                        ? "success"
                        : item.status === "seeded" || item.status === "local"
                          ? "neutral"
                          : item.status === "error"
                            ? "danger"
                            : "neutral"
                    }
                  >
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
