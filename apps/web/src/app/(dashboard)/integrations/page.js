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
import {
  aiStatusSummary,
  connectionLabel,
} from "@/lib/integrations/brand-labels";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

/** Friendly options — values stay API model ids; UI never labels with raw ids. */
const ANTHROPIC_MODEL_OPTIONS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet" },
  { value: "claude-opus-4-20250514", label: "Claude Opus" },
  { value: "claude-haiku-4-20250514", label: "Claude Haiku" },
];

function toneForStatus(status, hasCredentials) {
  if (hasCredentials || status === "live" || status === "connected" || status === "healthy") {
    return "success";
  }
  if (status === "awaiting_credentials") return "warning";
  if (status === "error") return "danger";
  return "neutral";
}

export default function IntegrationsPage() {
  const [health, setHealth] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [draftTitle, setDraftTitle] = useState("Quiet materials, considered care");
  const [draftStatus, setDraftStatus] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [anthropicModel, setAnthropicModel] = useState(DEFAULT_ANTHROPIC_MODEL);
  const [anthropicStatus, setAnthropicStatus] = useState("");
  const [zohoClientId, setZohoClientId] = useState("");
  const [zohoClientSecret, setZohoClientSecret] = useState("");
  const [zohoRefreshToken, setZohoRefreshToken] = useState("");
  const [zohoOrgId, setZohoOrgId] = useState("");
  const [zohoStatus, setZohoStatus] = useState("");

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
      setDraftStatus(`Draft created: ${result.id}`);
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
          ? "Claude connected. Agents and creative intelligence will use this key."
          : result.anthropic?.summary || result.anthropic?.honesty || "Saved."
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
      setAnthropicStatus("Stored Claude key cleared.");
      load();
    } catch (err) {
      setAnthropicStatus(err.message);
    }
  }

  async function saveZoho(event) {
    event.preventDefault();
    setZohoStatus("");
    try {
      const result = await apiFetch("/v1/integrations/zoho", {
        method: "POST",
        body: {
          client_id: zohoClientId || undefined,
          client_secret: zohoClientSecret || undefined,
          refresh_token: zohoRefreshToken || undefined,
          organization_id: zohoOrgId || undefined,
        },
      });
      setZohoClientId("");
      setZohoClientSecret("");
      setZohoRefreshToken("");
      setZohoStatus(
        result.zoho?.has_credentials
          ? result.zoho?.has_books_org
            ? "Zoho CRM and Books organization saved."
            : "Zoho CRM saved. Add a Books organization ID for invoices when ready."
          : result.zoho?.summary || result.zoho?.honesty || "Saved."
      );
      load();
    } catch (err) {
      setZohoStatus(err.message);
    }
  }

  async function clearZoho() {
    setZohoStatus("");
    try {
      await apiFetch("/v1/integrations/zoho/clear", { method: "POST" });
      setZohoOrgId("");
      setZohoStatus("Stored Zoho credentials cleared.");
      load();
    } catch (err) {
      setZohoStatus(err.message);
    }
  }

  const llmLabel =
    health?.llm?.status_label ||
    connectionLabel(health?.llm?.status, {
      live: health?.llm?.status === "live",
      hasCredentials: health?.llm?.has_credentials,
    });
  const anthropicLabel =
    health?.anthropic?.status_label ||
    connectionLabel(health?.anthropic?.status, {
      hasCredentials: health?.anthropic?.has_credentials,
    });

  return (
    <DashboardShell
      title="Integrations"
      description="Connect Claude, Meta, Shopify, email, and sales channels. Status reflects credentials on this host — never shown as healthy without tokens."
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
            <Badge tone={health?.mode === "live" ? "success" : "brand"}>
              {health?.mode_label || (health?.mode === "live" ? "Live" : "Local")}
            </Badge>
            <Button size="sm" variant="secondary" onClick={load}>
              Re-check health
            </Button>
          </div>

          {health?.llm ? (
            <section className="surface-card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="ops-section-title">AI</h2>
                  <p className="mt-1 text-sm text-muted">
                    Claude is primary for agents. Gemini powers creative tools when keyed on the host.
                  </p>
                </div>
                <Badge
                  tone={toneForStatus(health.llm.status, health.llm.has_credentials)}
                >
                  {llmLabel}
                </Badge>
              </div>
              <div className="space-y-1 px-5 py-4 text-sm text-muted">
                <p>{health.llm.summary || aiStatusSummary(health.llm)}</p>
              </div>
            </section>
          ) : null}

          <section className="surface-card overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="ops-section-title">Claude — primary AI</h2>
                <p className="mt-1 text-sm text-muted">
                  Paste your API key for agents and creative intelligence. Without a key, Triada stays on local
                  assistance and never reports live Claude success.
                </p>
              </div>
              <Badge
                tone={toneForStatus(
                  health?.anthropic?.status,
                  health?.anthropic?.has_credentials,
                )}
              >
                {anthropicLabel}
              </Badge>
            </div>
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-muted">
                {health?.anthropic?.summary ||
                  (health?.anthropic?.has_credentials
                    ? "Claude is connected."
                    : "Add your Claude API key to enable live agents.")}
              </p>
              <form className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end" onSubmit={saveAnthropic}>
                <Input
                  label="Claude API key"
                  name="anthropic_api_key"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    health?.anthropic?.has_credentials
                      ? "•••• stored — paste to replace"
                      : "Paste API key"
                  }
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                />
                <label className="block space-y-1.5">
                  <span className="block text-[13px] font-medium text-ink">Model preference</span>
                  <select
                    name="anthropic_model"
                    className="h-11 w-full rounded-sm border border-line bg-white px-3 text-sm text-ink transition-colors duration-150 focus:border-brown focus:outline-none"
                    value={
                      ANTHROPIC_MODEL_OPTIONS.some((o) => o.value === anthropicModel)
                        ? anthropicModel
                        : DEFAULT_ANTHROPIC_MODEL
                    }
                    onChange={(e) => setAnthropicModel(e.target.value)}
                  >
                    {ANTHROPIC_MODEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
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

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                key: "gemini",
                title: "Gemini",
                row: health?.gemini,
                fallback: "Creative AI on this host.",
              },
              {
                key: "resend",
                title: "Email",
                row: health?.resend,
                fallback: "Transactional email delivery.",
              },
              {
                key: "supabase",
                title: "Supabase",
                row: health?.supabase,
                fallback: "Auth and data for the ops dashboard.",
              },
            ].map((card) => (
              <section key={card.key} className="surface-card px-5 py-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="ops-section-title">{card.title}</h2>
                  <Badge
                    tone={toneForStatus(card.row?.status, card.row?.has_credentials)}
                  >
                    {card.row?.status_label ||
                      connectionLabel(card.row?.status, {
                        hasCredentials: card.row?.has_credentials,
                      })}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {card.row?.summary || card.fallback}
                </p>
              </section>
            ))}
          </div>

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
                          tone={toneForStatus(
                            ch?.health?.status || ch?.status,
                            ch?.status === "connected",
                          )}
                        >
                          {ch?.status_label ||
                            ch?.health?.status_label ||
                            connectionLabel(ch?.status || ch?.health?.status)}
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
                <Badge tone={toneForStatus(health?.wordpress?.status)}>
                  {health?.wordpress?.status_label ||
                    connectionLabel(health?.wordpress?.status)}
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
                  <h2 className="ops-section-title">Zoho CRM + Books</h2>
                  <p className="mt-1 text-sm text-muted">
                    CRM for contacts and leads. Zoho Books for invoice PDF and UAE e-invoice.
                  </p>
                </div>
                <Badge tone={toneForStatus(health?.zoho?.status, health?.zoho?.credentials?.has_credentials)}>
                  {health?.zoho?.status_label || connectionLabel(health?.zoho?.status)}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-muted">{health?.zoho?.message}</p>
              <p className="mt-1 text-xs text-muted">
                Books: {health?.zoho_books?.message || health?.zoho?.books?.message || "—"}
              </p>
              <form className="mt-4 grid gap-3" onSubmit={saveZoho}>
                <Input
                  label="Client ID"
                  name="zoho_client_id"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    health?.zoho?.credentials?.has_credentials
                      ? "•••• stored — paste to replace"
                      : "Zoho API console client ID"
                  }
                  value={zohoClientId}
                  onChange={(e) => setZohoClientId(e.target.value)}
                />
                <Input
                  label="Client secret"
                  name="zoho_client_secret"
                  type="password"
                  autoComplete="off"
                  placeholder="Client secret"
                  value={zohoClientSecret}
                  onChange={(e) => setZohoClientSecret(e.target.value)}
                />
                <Input
                  label="Refresh token"
                  name="zoho_refresh_token"
                  type="password"
                  autoComplete="off"
                  placeholder="OAuth refresh token (CRM + Books scopes)"
                  value={zohoRefreshToken}
                  onChange={(e) => setZohoRefreshToken(e.target.value)}
                />
                <Input
                  label="Books organization ID"
                  name="zoho_organization_id"
                  placeholder="Required for invoice PDF / UAE e-invoice"
                  value={zohoOrgId}
                  onChange={(e) => setZohoOrgId(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm">
                    Save Zoho
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={clearZoho}>
                    Clear
                  </Button>
                </div>
                {zohoStatus ? <p className="text-sm text-muted">{zohoStatus}</p> : null}
              </form>
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
                  </div>
                  <Badge tone={toneForStatus(item.status)}>
                    {item.status_label || connectionLabel(item.status)}
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
