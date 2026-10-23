"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

const CHANNELS = [
  {
    key: "facebook",
    title: "Facebook Messenger",
    blurb: "Pages + Messenger. Paste a Page access token when ready — local simulator works until then.",
  },
  {
    key: "instagram",
    title: "Instagram Messaging",
    blurb: "Professional IG messaging via Meta. Connect the linked account from this dashboard.",
  },
  {
    key: "whatsapp",
    title: "WhatsApp Cloud API",
    blurb: "WABA phone number messaging with 24h window + template eligibility checks.",
  },
];

function healthTone(status) {
  if (status === "healthy" || status === "connected") return "success";
  if (status === "error") return "danger";
  if (status === "awaiting_credentials") return "warning";
  return "neutral";
}

export default function MetaIntegrationsPage() {
  const [status, setStatus] = useState(null);
  const [accounts, setAccounts] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [tokens, setTokens] = useState({
    facebook: "",
    instagram: "",
    whatsapp: "",
  });
  const [sim, setSim] = useState({
    channel: "facebook",
    body: "Hello from the Triada Meta simulator",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/integrations/meta/status");
      setStatus(data);
      const nextAccounts = {};
      await Promise.all(
        CHANNELS.map(async (ch) => {
          const res = await apiFetch(`/v1/integrations/meta/accounts?channel=${ch.key}`);
          nextAccounts[ch.key] = res;
        })
      );
      setAccounts(nextAccounts);
    } catch (err) {
      setError(err.message || "Failed to load Meta control plane");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function connect(channel) {
    setBusy(`connect-${channel}`);
    setNotice("");
    try {
      const data = await apiFetch("/v1/integrations/meta/connect", {
        method: "POST",
        body: {
          channel,
          access_token: tokens[channel] || undefined,
          webhook_subscribed: true,
        },
      });
      setStatus(data);
      setNotice(
        tokens[channel]
          ? `${channel} token stored. Live Graph requires INTEGRATION_MODE=live.`
          : `${channel} connected for dashboard ops (awaiting credentials for live Graph).`
      );
      setTokens((prev) => ({ ...prev, [channel]: "" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function disconnect(channel) {
    setBusy(`disconnect-${channel}`);
    try {
      const data = await apiFetch("/v1/integrations/meta/disconnect", {
        method: "POST",
        body: { channel },
      });
      setStatus(data);
      setNotice(`${channel} disconnected.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function toggleSubscribe(channel, subscribed) {
    setBusy(`sub-${channel}`);
    try {
      await apiFetch("/v1/integrations/meta/webhook/subscribe", {
        method: "POST",
        body: { channel, subscribed },
      });
      await load();
      setNotice(`${channel} webhook ${subscribed ? "subscribed" : "unsubscribed"} in Triada.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function rotateToken() {
    setBusy("rotate");
    try {
      const webhook = await apiFetch("/v1/integrations/meta/verify-token/rotate", {
        method: "POST",
      });
      setStatus((prev) => ({ ...prev, webhook }));
      setNotice("Verify token rotated. Update the Meta Developer webhook verify token once if live.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function testSend(channel) {
    setBusy(`send-${channel}`);
    try {
      const result = await apiFetch("/v1/integrations/meta/test-send", {
        method: "POST",
        body: {
          channel,
          body: `Triada test send (${channel})`,
        },
      });
      setNotice(`Test send ${result.ok ? "ok" : "blocked"} — mode ${result.result?.mode || "n/a"}`);
    } catch (err) {
      setError(err.message || err.data?.message || "Test send failed");
    } finally {
      setBusy("");
    }
  }

  async function simulateInbound(event) {
    event.preventDefault();
    setBusy("simulate");
    setNotice("");
    try {
      const result = await apiFetch("/v1/integrations/meta/simulate-inbound", {
        method: "POST",
        body: sim,
      });
      setNotice(
        `Simulated ${result.channel} inbound — ${result.messages?.length || 0} message(s). Open Inbox to reply.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied to clipboard.");
    } catch {
      setNotice(value);
    }
  }

  return (
    <DashboardShell
      title="Meta messaging"
      description="Manage Facebook, Instagram, and WhatsApp from Triada. One-time Meta Developer App / App Review may still require Meta; day-to-day messaging automation stays here."
      actions={
        <div className="flex items-center gap-4">
          <BrandLogo variant="symbol" className="h-9 w-9" />
          <Link href="/integrations" className="text-sm text-brown-dark underline-offset-2 hover:underline">
            All integrations
          </Link>
        </div>
      }
    >
      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading && status ? (
        <div className="space-y-6">
          <section className="surface-card space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="brand">Mode: {status.mode}</Badge>
              <Badge tone="neutral">Dashboard control plane</Badge>
            </div>
            <p className="max-w-3xl text-sm text-muted">{status.honesty?.day_to_day}</p>
            <p className="max-w-3xl text-sm text-muted">{status.honesty?.one_time_meta_developer_setup}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-line px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-muted">Meta webhook URL</p>
                <p className="mt-1 break-all text-sm">{status.webhook?.meta_webhook_url}</p>
                <Button
                  className="mt-2"
                  variant="secondary"
                  onClick={() => copyText(status.webhook?.meta_webhook_url || "")}
                >
                  Copy URL
                </Button>
              </div>
              <div className="rounded-md border border-line px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-muted">Verify token</p>
                <p className="mt-1 break-all font-mono text-sm">{status.webhook?.verify_token}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => copyText(status.webhook?.verify_token || "")}>
                    Copy token
                  </Button>
                  <Button onClick={rotateToken} disabled={busy === "rotate"}>
                    Rotate verify token
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            {CHANNELS.map((ch) => {
              const info = status.channels?.[ch.key] || {};
              const health = info.health || {};
              const accountList = accounts[ch.key]?.data || [];
              return (
                <Card key={ch.key}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-display text-2xl">{ch.title}</h2>
                      <p className="mt-1 text-sm text-muted">{ch.blurb}</p>
                    </div>
                    <Badge tone={healthTone(info.status || health.status)}>
                      {info.status || health.status || "unknown"}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted">{health.message}</p>
                  <ul className="mt-3 space-y-1 text-sm text-muted">
                    {accountList.map((row) => (
                      <li key={row.id}>
                        {row.name || row.username || row.verified_name || row.id}
                        {row.source ? ` · ${row.source}` : ""}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 space-y-3">
                    <Input
                      label="Access token (paste later)"
                      name={`${ch.key}-token`}
                      type="password"
                      value={tokens[ch.key]}
                      onChange={(e) =>
                        setTokens((prev) => ({ ...prev, [ch.key]: e.target.value }))
                      }
                      placeholder="Optional until credentials are ready"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => connect(ch.key)} disabled={!!busy}>
                        Connect
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          toggleSubscribe(ch.key, !info.webhook_subscribed)
                        }
                        disabled={!!busy}
                      >
                        {info.webhook_subscribed ? "Unsubscribe webhook" : "Subscribe webhook"}
                      </Button>
                      <Button variant="secondary" onClick={() => testSend(ch.key)} disabled={!!busy}>
                        Test send
                      </Button>
                      <Button variant="ghost" onClick={() => disconnect(ch.key)} disabled={!!busy}>
                        Disconnect
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <section className="surface-card p-5">
            <h2 className="font-display text-2xl">Local inbound simulator</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Fully operable without Meta credentials. Creates a real conversation in the unified inbox.
            </p>
            <form className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]" onSubmit={simulateInbound}>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Channel</span>
                <select
                  className="w-full rounded-md border border-line bg-ivory px-3 py-2"
                  value={sim.channel}
                  onChange={(e) => setSim((prev) => ({ ...prev, channel: e.target.value }))}
                >
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </label>
              <Input
                label="Message body"
                name="sim-body"
                value={sim.body}
                onChange={(e) => setSim((prev) => ({ ...prev, body: e.target.value }))}
              />
              <div className="flex items-end">
                <Button type="submit" disabled={busy === "simulate"}>
                  Simulate inbound
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
