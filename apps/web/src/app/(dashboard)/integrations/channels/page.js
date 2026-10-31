"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { connectionLabel } from "@/lib/integrations/brand-labels";

/** Jewellery multi-channel list — Connected / Waiting credentials only. */
const CHANNELS = [
  { key: "webchat", title: "Website / webchat", blurb: "On-site chat widget." },
  { key: "facebook", title: "Facebook", blurb: "Page messaging." },
  { key: "instagram", title: "Instagram", blurb: "IG messaging." },
  { key: "whatsapp", title: "WhatsApp", blurb: "Business messaging." },
  { key: "shopify", title: "Shopify", blurb: "Store catalog and orders." },
  { key: "tiktok", title: "TikTok", blurb: "Short-form commerce channel." },
  { key: "linkedin", title: "LinkedIn", blurb: "Professional outreach." },
  { key: "email", title: "Email", blurb: "Transactional delivery." },
  { key: "telegram", title: "Telegram", blurb: "Bot messaging." },
];

function tone(status) {
  if (status === "healthy" || status === "connected") return "success";
  if (status === "local" || status === "seeded") return "neutral";
  if (status === "error") return "danger";
  if (status === "awaiting_credentials") return "warning";
  if (status === "disconnected") return "neutral";
  return "neutral";
}

export default function ChannelsIntegrationsPage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [sim, setSim] = useState({
    channel: "webchat",
    body: "Hi — interested in a gold hoop pair from Triada Designs",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/integrations/channels/status");
      setStatus(data);
    } catch (err) {
      setError(err.message || "Failed to load channels");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function simulate() {
    setBusy("sim");
    try {
      const result = await apiFetch("/v1/integrations/channels/simulate-inbound", {
        method: "POST",
        body: sim,
      });
      setNotice(
        `Simulated ${sim.channel}. Conversation ${result.messages?.[0]?.conversation?.id || "created"}. AI intent: ${result.ai?.intent || "n/a"}`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function ensureWidget() {
    setBusy("widget");
    try {
      const data = await apiFetch("/v1/integrations/channels/webchat-token", {
        method: "POST",
      });
      setStatus(data);
      setNotice(`Widget token ready: ${data.webchat_widget?.public_token}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell
      title="Sales channels"
      description="Jewellery retail across Facebook, Website, Shopify, TikTok, Instagram, WhatsApp, LinkedIn, Email, and Telegram. Status only."
      actions={
        <div className="ops-actions">
          <Button size="sm" variant="secondary" onClick={load}>
            Re-check status
          </Button>
          <Link href="/templates">
            <Button size="sm">Templates</Button>
          </Link>
          <Link href="/integrations">
            <Button size="sm" variant="secondary">
              All integrations
            </Button>
          </Link>
        </div>
      }
    >
      {loading ? <Skeleton className="h-40" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading && status ? (
        <div className="space-y-6">
          <p className="text-sm text-muted">
            {status.summary || "Each channel shows Connected or Waiting credentials."}
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CHANNELS.map((ch) => {
              const row = status.channels?.[ch.key] || {};
              const connected =
                row.status === "connected" ||
                row.status === "healthy" ||
                row.status === "seeded" ||
                row.status === "local";
              return (
                <section key={ch.key} className="surface-card px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="ops-section-title">{ch.title}</h2>
                    <Badge tone={tone(row.status)}>
                      {row.status_label ||
                        connectionLabel(row.status || "awaiting_credentials", {
                          hasCredentials: connected && row.status !== "awaiting_credentials",
                        })}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">{ch.blurb}</p>
                  {row.hub && row.hub !== "/integrations/channels" ? (
                    <p className="mt-3 text-xs text-muted">
                      Deep ops:{" "}
                      <Link href={row.hub} className="text-brown-dark underline">
                        Open hub
                      </Link>
                    </p>
                  ) : null}
                </section>
              );
            })}
          </div>

          <Card className="p-5">
            <h2 className="ops-section-title">Local inbound simulator</h2>
            <p className="mt-1 text-sm text-muted">
              Exercise jewellery inquiry flows without live provider tokens (Shopify excluded).
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr_auto]">
              <label className="text-sm">
                <span className="mb-1 block text-muted">Channel</span>
                <select
                  className="ops-field px-3 py-2"
                  value={sim.channel}
                  onChange={(e) => setSim((prev) => ({ ...prev, channel: e.target.value }))}
                >
                  {CHANNELS.filter((c) => c.key !== "shopify").map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Message body"
                value={sim.body}
                onChange={(e) => setSim((prev) => ({ ...prev, body: e.target.value }))}
              />
              <div className="flex items-end">
                <Button disabled={busy === "sim"} onClick={simulate}>
                  Simulate inbound
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="ops-section-title">Website chat widget</h2>
            <p className="mt-2 text-sm text-muted">
              Embed <code>/widget/chat.js</code> with the public widget token. Rate-limited endpoint:{" "}
              <code>POST /api/v1/webchat/messages</code>. Chat opens also create CRM leads via the visitor tracker.
            </p>
            <p className="mt-2 text-sm">
              Token: <code>{status.webchat_widget?.public_token || "not issued"}</code>
            </p>
            <Button
              className="mt-3"
              variant="secondary"
              disabled={busy === "widget"}
              onClick={ensureWidget}
            >
              Ensure widget token
            </Button>
          </Card>

          <Card className="p-5">
            <h2 className="ops-section-title">Website visitor leads</h2>
            <p className="mt-2 text-sm text-muted">
              First-party tracker for triada-designs.com (and public ops pages). Creates CRM leads with page,
              referrer, UTM, and email when a form or chat captures one.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-sm bg-shell px-3 py-2 text-[12px] leading-relaxed text-ink">
{`<script
  src="https://dashboard.triada-designs.com/widget/visitor.js"
  data-api="https://dashboard.triada-designs.com/api/v1/visitors/capture"
  data-token="${status.webchat_widget?.public_token || "wc_…"}"
  defer></script>`}
            </pre>
            <p className="mt-2 text-sm text-muted">
              Optional: <code>{`TriadaVisitor.identify({ email })`}</code> from popups. Endpoint:{" "}
              <code>POST /api/v1/visitors/capture</code>.
            </p>
          </Card>
        </div>
      ) : null}
    </DashboardShell>
  );
}
