"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

export default function SettingsPage() {
  const [workspace, setWorkspace] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/settings");
      setWorkspace(data.workspace);
    } catch (err) {
      setError(err.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(flags) {
    setBusy(true);
    setNotice("");
    try {
      const data = await apiFetch("/v1/settings", {
        method: "PATCH",
        body: flags,
      });
      setWorkspace(data.workspace);
      setNotice("Settings updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell
      title="Settings"
      description="Workspace defaults and emergency controls for outbound messaging and automations — including Meta channels."
    >
      {loading ? <Skeleton className="h-40" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading && workspace ? (
        <div className="space-y-6">
          <section className="surface-card space-y-3 p-5">
            <h2 className="font-display text-2xl">{workspace.name}</h2>
            <p className="text-sm text-muted">
              {workspace.slug} · {workspace.timezone} · {workspace.default_language}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge tone={workspace.outbound_paused ? "danger" : "success"}>
                Outbound {workspace.outbound_paused ? "paused" : "active"}
              </Badge>
              <Badge tone={workspace.automations_paused ? "danger" : "success"}>
                Automations {workspace.automations_paused ? "paused" : "active"}
              </Badge>
            </div>
          </section>

          <section className="surface-card space-y-4 p-5">
            <h2 className="font-display text-2xl">Emergency controls</h2>
            <p className="max-w-2xl text-sm text-muted">
              Pause stops eligible Meta/webchat outbound and workflow execution workspace-wide. Resume when ready.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={() => patch({ outbound_paused: !workspace.outbound_paused })}
              >
                {workspace.outbound_paused ? "Resume outbound" : "Pause outbound"}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => patch({ automations_paused: !workspace.automations_paused })}
              >
                {workspace.automations_paused ? "Resume automations" : "Pause automations"}
              </Button>
            </div>
          </section>

          <section className="surface-card space-y-3 p-5">
            <h2 className="font-display text-2xl">Meta messaging</h2>
            <p className="text-sm text-muted">
              Connect Pages / IG / WABA, webhooks, token health, and simulators from the Meta hub.
            </p>
            <Link href="/integrations/meta">
              <Button variant="secondary">Open Meta hub</Button>
            </Link>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
