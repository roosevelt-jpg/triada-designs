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

function tone(status) {
  if (status === "healthy" || status === "connected") return "success";
  if (status === "error") return "danger";
  if (status === "awaiting_credentials") return "warning";
  return "neutral";
}

export default function ShopifyIntegrationsPage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/integrations/shopify/status");
      setStatus(data);
      if (data.shop_domain) setShopDomain(data.shop_domain);
    } catch (err) {
      setError(err.message || "Failed to load Shopify status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function connect() {
    setBusy("connect");
    setNotice("");
    try {
      const data = await apiFetch("/v1/integrations/shopify/connect", {
        method: "POST",
        body: {
          shop_domain: shopDomain || undefined,
          access_token: accessToken || undefined,
        },
      });
      setStatus(data);
      setAccessToken("");
      setNotice(
        accessToken
          ? "Token stored encrypted. Status stays awaiting_credentials until INTEGRATION_MODE=live."
          : "Shopify record saved as awaiting_credentials (no token pasted)."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      const data = await apiFetch("/v1/integrations/shopify/disconnect", { method: "POST" });
      setStatus(data);
      setNotice("Shopify disconnected.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function syncNow(syncType) {
    setBusy(`sync-${syncType}`);
    setNotice("");
    try {
      const result = await apiFetch("/v1/integrations/shopify/sync", {
        method: "POST",
        body: { sync_type: syncType },
      });
      setStatus(result.status);
      setNotice(
        `Sync ${result.run?.status || "done"} (${result.run?.mode || "local"}): ${result.run?.records_upserted ?? 0} records.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell
      title="Shopify"
      description="OAuth/connect scaffolding, product/order sync, and local simulator. Never shown as healthy without live tokens."
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
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl">Connection</h2>
              <Badge tone={tone(status.status)}>{status.status}</Badge>
              <Badge tone="neutral">{status.mode}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted">{status.honesty}</p>
            <p className="mt-1 text-sm text-muted">{status.health?.message}</p>
            <p className="mt-2 text-xs text-muted">
              Products in workspace: {status.product_count ?? 0} · Token present:{" "}
              {status.has_access_token ? "yes" : "no"}
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Input
                label="Shop domain"
                placeholder="your-shop.myshopify.com"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
              />
              <Input
                label="Admin API access token (paste when ready)"
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={busy === "connect"} onClick={connect}>
                {busy === "connect" ? "Saving…" : "Connect / save"}
              </Button>
              <Button variant="secondary" disabled={busy === "disconnect"} onClick={disconnect}>
                Disconnect
              </Button>
              <Button variant="secondary" disabled={!!busy} onClick={() => syncNow("products")}>
                {busy === "sync-products" ? "Syncing…" : "Sync products now"}
              </Button>
              <Button variant="secondary" disabled={!!busy} onClick={() => syncNow("orders")}>
                {busy === "sync-orders" ? "Syncing…" : "Sync orders now"}
              </Button>
            </div>
            {status.oauth?.authorize_url_scaffold ? (
              <p className="mt-3 break-all text-xs text-muted">
                OAuth authorize scaffold: {status.oauth.authorize_url_scaffold}
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted">
                Set SHOPIFY_CLIENT_ID / REDIRECT_URI to enable OAuth URL scaffolding.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-2xl">Recent sync runs</h2>
            <div className="mt-3 divide-y divide-line">
              {(status.recent_sync_runs || []).length === 0 ? (
                <p className="text-sm text-muted">No sync runs yet. Use Sync products now (local simulator).</p>
              ) : (
                status.recent_sync_runs.map((run) => (
                  <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span>
                      {run.sync_type} · {run.mode} · upserted {run.records_upserted}
                    </span>
                    <Badge tone={run.status === "completed" ? "success" : "warning"}>{run.status}</Badge>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </DashboardShell>
  );
}
