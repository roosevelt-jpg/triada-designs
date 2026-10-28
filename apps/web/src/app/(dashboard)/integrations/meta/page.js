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
import { connectionLabel } from "@/lib/integrations/brand-labels";

const CHANNELS = [
  {
    key: "facebook",
    title: "Facebook Messenger",
    blurb: "Pages + Messenger. Status from host Meta credentials on Vercel.",
  },
  {
    key: "instagram",
    title: "Instagram Messaging",
    blurb: "Professional IG messaging via Meta. Day-to-day ops stay in this hub.",
  },
  {
    key: "whatsapp",
    title: "WhatsApp Cloud API",
    blurb: "WABA phone messaging with 24h window and template eligibility checks.",
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
  const [sim, setSim] = useState({
    channel: "facebook",
    body: "Hello from the Triada Meta simulator",
  });
  const [waTemplates, setWaTemplates] = useState(null);
  const [waForm, setWaForm] = useState({
    name: "jewellery_piece_ready",
    body: "Hi {{1}}, your Triada Designs jewellery piece is ready to view. Reply INTERESTED to continue.",
    category: "MARKETING",
  });
  const [waEditId, setWaEditId] = useState("");
  const [waEditForm, setWaEditForm] = useState({
    name: "",
    body: "",
    category: "MARKETING",
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
      const wa = await apiFetch("/v1/integrations/whatsapp/templates").catch(() => null);
      setWaTemplates(wa);
    } catch (err) {
      setError(err.message || "Failed to load Meta control plane");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  async function syncWaTemplates() {
    setBusy("wa-sync");
    setNotice("");
    try {
      const result = await apiFetch("/v1/integrations/whatsapp/templates/sync", { method: "POST" });
      setNotice(`Synced ${result.synced || 0} WhatsApp templates (${result.mode}).`);
      const wa = await apiFetch("/v1/integrations/whatsapp/templates");
      setWaTemplates(wa);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function seedWaAutomationTemplates(force = false) {
    setBusy(force ? "wa-seed-force" : "wa-seed");
    setNotice("");
    setError("");
    try {
      const result = await apiFetch("/v1/integrations/whatsapp/templates/seed", {
        method: "POST",
        body: { submit: true, force },
      });
      setNotice(
        result.message ||
          `Seeded ${result.seeded || 0} automation templates · submitted ${result.submitted || 0} (${result.mode}).`,
      );
      if (result.failed > 0) {
        setError(
          `${result.failed} template(s) failed Meta submit` +
            (result.failed_detail?.[0]?.error
              ? `: ${result.failed_detail[0].error}`
              : ""),
        );
      }
      const wa = await apiFetch("/v1/integrations/whatsapp/templates");
      setWaTemplates(wa);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function createWaTemplate(e) {
    e.preventDefault();
    setBusy("wa-create");
    setNotice("");
    try {
      const result = await apiFetch("/v1/integrations/whatsapp/templates", {
        method: "POST",
        body: waForm,
      });
      if (!result.ok) {
        setError(result.error || "Template submit failed");
      } else {
        setNotice(`WhatsApp template submitted (${result.mode}). Status: ${result.template?.status}.`);
      }
      const wa = await apiFetch("/v1/integrations/whatsapp/templates");
      setWaTemplates(wa);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function beginEditWaTemplate(tpl) {
    setWaEditId(tpl.id);
    setWaEditForm({
      name: tpl.name || "",
      body: tpl.body || "",
      category: (tpl.category || "marketing").toUpperCase(),
    });
  }

  async function saveWaTemplate(e) {
    e.preventDefault();
    if (!waEditId) return;
    setBusy("wa-edit");
    setNotice("");
    try {
      const result = await apiFetch(`/v1/integrations/whatsapp/templates/${waEditId}`, {
        method: "PATCH",
        body: waEditForm,
      });
      if (!result.ok) {
        setError(result.error || "Template update failed");
      } else {
        setNotice(`WhatsApp template updated / re-submitted (${result.mode}). Status: ${result.template?.status}.`);
        setWaEditId("");
      }
      const wa = await apiFetch("/v1/integrations/whatsapp/templates");
      setWaTemplates(wa);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell
      title="Meta messaging"
      description="Facebook, Instagram, and WhatsApp status from host credentials on Vercel. Day-to-day messaging ops stay here — API keys are never entered in the dashboard."
      actions={
        <div className="flex items-center gap-4">
          <BrandLogo variant="symbol" className="h-9 w-9" />
          <Button size="sm" variant="secondary" onClick={load}>
            Re-check status
          </Button>
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
              <Badge tone={status.connected || status.mode === "live" ? "success" : "brand"}>
                {status.connected || status.mode === "live" ? "Live" : "Local"}
              </Badge>
              <Badge tone="neutral">Dashboard control plane</Badge>
            </div>
            {status.honesty?.day_to_day ? (
              <p className="max-w-3xl text-sm text-muted">{status.honesty.day_to_day}</p>
            ) : (
              <p className="max-w-3xl text-sm text-muted">
                Day-to-day Facebook, Instagram, and WhatsApp messaging stays in Triada after
                one-time Meta Developer setup.
              </p>
            )}
            {status.honesty?.one_time_meta_developer_setup ? (
              <p className="max-w-3xl text-sm text-muted">
                {status.honesty.one_time_meta_developer_setup}
              </p>
            ) : null}
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
                      {info.status_label ||
                        health.status_label ||
                        connectionLabel(info.status || health.status)}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    {info.status === "connected" || health.status === "healthy"
                      ? health.message || "Ready for dashboard messaging ops."
                      : "Waiting credentials on Vercel."}
                  </p>
                  {accountList.length ? (
                    <ul className="mt-3 space-y-1 text-sm text-muted">
                      {accountList.map((row) => (
                        <li key={row.id}>
                          {row.name || row.username || row.verified_name || "Linked account"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
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
                  </div>
                </Card>
              );
            })}
          </div>

          <section className="surface-card space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl">WhatsApp Cloud templates</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">
                  Seed campaign templates from the Triada automation doc (orders, abandonment,
                  waitlist, VIP, after-sale, UGC), edit here, then submit to Meta for approval.
                  Live submit uses host WhatsApp credentials on Vercel; otherwise Triada uses the
                  local jewellery catalog.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={healthTone(waTemplates?.status?.status)}>
                  {waTemplates?.status?.mode === "live_ready" ||
                  waTemplates?.status?.mode === "live"
                    ? "Live Meta Graph"
                    : "Local sim"}
                </Badge>
                <Button
                  onClick={() => seedWaAutomationTemplates(false)}
                  disabled={busy === "wa-seed" || busy === "wa-seed-force"}
                >
                  {busy === "wa-seed" ? "Seeding…" : "Seed automation templates"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => seedWaAutomationTemplates(true)}
                  disabled={busy === "wa-seed" || busy === "wa-seed-force"}
                >
                  {busy === "wa-seed-force" ? "Re-seeding…" : "Re-seed & submit"}
                </Button>
                <Button onClick={syncWaTemplates} disabled={busy === "wa-sync"}>
                  Sync approval status
                </Button>
                <Link
                  href="/templates?platform=whatsapp"
                  className="text-sm text-brown-dark underline-offset-2 hover:underline"
                >
                  Open templates library
                </Link>
              </div>
            </div>
            <p className="text-sm text-muted">{waTemplates?.status?.message}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {(waTemplates?.data || []).slice(0, 16).map((tpl) => (
                <div key={tpl.id} className="rounded-md border border-line px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-ink">{tpl.name}</p>
                    <Badge
                      tone={healthTone(
                        tpl.status === "approved" || tpl.status === "published"
                          ? "healthy"
                          : tpl.status === "rejected"
                            ? "error"
                            : tpl.status === "pending_approval" ||
                                String(tpl.status || "").toUpperCase() === "PENDING"
                              ? "awaiting_credentials"
                              : "awaiting_credentials",
                      )}
                    >
                      {tpl.status === "approved" || tpl.status === "published"
                        ? "Approved"
                        : tpl.status === "rejected"
                          ? "Rejected"
                          : tpl.status === "pending_approval" ||
                              String(tpl.status || "").toUpperCase() === "PENDING"
                            ? "Pending Meta"
                            : "Draft"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted line-clamp-3">{tpl.body}</p>
                  <p className="mt-2 text-xs uppercase tracking-wide text-muted">
                    {tpl.category}
                    {tpl.metadata?.campaign_type
                      ? ` · ${tpl.metadata.campaign_type}`
                      : ""}{" "}
                    ·{" "}
                    {tpl.publish_mode === "live"
                      ? "Live Graph"
                      : tpl.publish_mode === "local_sim"
                        ? "Local sim"
                        : "Draft"}
                  </p>
                  <div className="mt-3">
                    <Button variant="ghost" onClick={() => beginEditWaTemplate(tpl)}>
                      Edit / re-submit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {waEditId ? (
              <form className="grid gap-3 border border-line bg-stone/30 p-4 md:grid-cols-2" onSubmit={saveWaTemplate}>
                <p className="md:col-span-2 text-sm font-medium text-ink">Edit WhatsApp Cloud template</p>
                <Input
                  label="Template name"
                  name="wa-edit-name"
                  value={waEditForm.name}
                  onChange={(e) => setWaEditForm((prev) => ({ ...prev, name: e.target.value }))}
                />
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Category</span>
                  <select
                    className="w-full rounded-md border border-line bg-ivory px-3 py-2"
                    value={waEditForm.category}
                    onChange={(e) => setWaEditForm((prev) => ({ ...prev, category: e.target.value }))}
                  >
                    <option value="MARKETING">MARKETING</option>
                    <option value="UTILITY">UTILITY</option>
                    <option value="AUTHENTICATION">AUTHENTICATION</option>
                  </select>
                </label>
                <div className="md:col-span-2">
                  <Input
                    label="Body"
                    name="wa-edit-body"
                    value={waEditForm.body}
                    onChange={(e) => setWaEditForm((prev) => ({ ...prev, body: e.target.value }))}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={busy === "wa-edit"}>
                    Save / re-submit
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setWaEditId("")}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
            <form className="grid gap-3 border-t border-line pt-4 md:grid-cols-2" onSubmit={createWaTemplate}>
              <Input
                label="Template name"
                name="wa-name"
                value={waForm.name}
                onChange={(e) => setWaForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <label className="text-sm">
                <span className="mb-1 block text-muted">Category</span>
                <select
                  className="w-full rounded-md border border-line bg-ivory px-3 py-2"
                  value={waForm.category}
                  onChange={(e) => setWaForm((prev) => ({ ...prev, category: e.target.value }))}
                >
                  <option value="MARKETING">MARKETING</option>
                  <option value="UTILITY">UTILITY</option>
                  <option value="AUTHENTICATION">AUTHENTICATION</option>
                </select>
              </label>
              <div className="md:col-span-2">
                <Input
                  label="Body"
                  name="wa-body"
                  value={waForm.body}
                  onChange={(e) => setWaForm((prev) => ({ ...prev, body: e.target.value }))}
                />
              </div>
              <div>
                <Button type="submit" disabled={busy === "wa-create"}>
                  Create & submit to Meta
                </Button>
              </div>
            </form>
          </section>

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
