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

const CHANNELS = [
  { key: "telegram", title: "Telegram", hint: "Bot token" },
  { key: "tiktok", title: "TikTok", hint: "Access token (when eligible)" },
  { key: "email", title: "Email", hint: "Provider API key" },
  { key: "webchat", title: "Webchat", hint: "Widget token (seeded locally)" },
];

function tone(status) {
  if (status === "healthy" || status === "connected" || status === "seeded") return "success";
  if (status === "error") return "danger";
  if (status === "awaiting_credentials") return "warning";
  return "neutral";
}

export default function ChannelsIntegrationsPage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [tokens, setTokens] = useState({});
  const [sim, setSim] = useState({ channel: "telegram", body: "Hello from the local channel simulator" });

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

  async function connect(channel) {
    setBusy(`connect-${channel}`);
    try {
      const data = await apiFetch("/v1/integrations/channels/connect", {
        method: "POST",
        body: {
          channel,
          access_token: tokens[channel] || undefined,
          bot_token: channel === "telegram" ? tokens[channel] || undefined : undefined,
          api_key: channel === "email" ? tokens[channel] || undefined : undefined,
        },
      });
      setStatus(data);
      setTokens((prev) => ({ ...prev, [channel]: "" }));
      setNotice(`${channel} saved. Status remains local/awaiting_credentials until live tokens.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

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
      const data = await apiFetch("/v1/integrations/channels/webchat-token", { method: "POST" });
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
      title="Messaging channels"
      description="Telegram, TikTok, Email, and website live chat. Local simulators until provider credentials exist."
      actions={
        <Link href="/integrations">
          <Button variant="secondary">All integrations</Button>
        </Link>
      }
    >
      {loading ? <Skeleton className="h-40" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading && status ? (
        <div className="space-y-6">
          <p className="text-sm text-muted">{status.honesty}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {CHANNELS.map((ch) => {
              const row = status.channels?.[ch.key] || {};
              return (
                <Card key={ch.key} className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-2xl">{ch.title}</h2>
                    <Badge tone={tone(row.status)}>{row.status || "disconnected"}</Badge>
                    <Badge tone="neutral">{row.mode || "local"}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted">Webhook: {row.webhook_path}</p>
                  <div className="mt-3">
                    <Input
                      label={ch.hint}
                      type="password"
                      value={tokens[ch.key] || ""}
                      onChange={(e) => setTokens((prev) => ({ ...prev, [ch.key]: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                  <Button
                    className="mt-3"
                    disabled={busy === `connect-${ch.key}`}
                    onClick={() => connect(ch.key)}
                  >
                    Connect / save
                  </Button>
                </Card>
              );
            })}
          </div>

          <Card className="p-5">
            <h2 className="font-display text-2xl">Local inbound simulator</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-[160px_1fr_auto]">
              <label className="text-sm">
                <span className="mb-1 block text-muted">Channel</span>
                <select
                  className="w-full rounded-md border border-line bg-white px-3 py-2"
                  value={sim.channel}
                  onChange={(e) => setSim((prev) => ({ ...prev, channel: e.target.value }))}
                >
                  {CHANNELS.map((c) => (
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
            <h2 className="font-display text-2xl">Webchat widget</h2>
            <p className="mt-2 text-sm text-muted">
              Embed <code>/widget/chat.js</code> with public token. Rate-limited public endpoint:{" "}
              <code>POST /api/v1/webchat/messages</code>.
            </p>
            <p className="mt-2 text-sm">
              Token: <code>{status.webchat_widget?.public_token || "not issued"}</code>
            </p>
            <Button className="mt-3" variant="secondary" disabled={busy === "widget"} onClick={ensureWidget}>
              Ensure widget token
            </Button>
          </Card>
        </div>
      ) : null}
    </DashboardShell>
  );
}
