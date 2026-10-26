"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";
import { getSystemTimeState, nowDate, syncSystemTime } from "@/lib/system-time";

const COMMON_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
];

export default function SettingsPage() {
  const [workspace, setWorkspace] = useState(null);
  const [timezone, setTimezone] = useState("UTC");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [systemNow, setSystemNow] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data] = await Promise.all([
        apiFetch("/v1/settings"),
        syncSystemTime().catch(() => getSystemTimeState()),
      ]);
      setWorkspace(data.workspace);
      setTimezone(data.workspace?.timezone || "UTC");
      setSystemNow(formatDateTime(nowDate()));
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
      if (data.workspace?.timezone) setTimezone(data.workspace.timezone);
      await syncSystemTime().catch(() => {});
      setSystemNow(formatDateTime(nowDate()));
      setNotice("Settings updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveTimezone(e) {
    e.preventDefault();
    await patch({ timezone: timezone.trim() || "UTC" });
  }

  return (
    <DashboardShell
      title="Settings"
      description="Workspace defaults, timezone for scheduling displays, and emergency controls for outbound messaging and automations."
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
            <h2 className="font-display text-2xl">Timezone & system time</h2>
            <p className="max-w-2xl text-sm text-muted">
              Ops UI clocks, calendar “now”, and scheduling displays use the server clock aligned to this
              IANA timezone via <code className="text-ink">GET /api/v1/system/time</code>. Historical
              seed message timestamps stay as stored; live surfaces always use current time.
            </p>
            <p className="text-sm text-muted">
              Current workspace time: <span className="font-medium text-ink">{systemNow || "…"}</span>
            </p>
            <form className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end" onSubmit={saveTimezone}>
              <div className="min-w-0 flex-1">
                <Input
                  label="Workspace timezone"
                  name="timezone"
                  list="triada-timezones"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  hint="Example: America/Los_Angeles. Affects header clock and date formatting."
                />
                <datalist id="triada-timezones">
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz} />
                  ))}
                </datalist>
              </div>
              <Button type="submit" disabled={busy} size="sm">
                Save timezone
              </Button>
            </form>
          </section>

          <section className="surface-card space-y-4 p-5">
            <h2 className="font-display text-2xl">AI agents (Anthropic)</h2>
            <p className="max-w-2xl text-sm text-muted">
              Paste your Anthropic API key on{" "}
              <Link href="/integrations" className="text-brown-dark underline">
                Integrations
              </Link>{" "}
              (or set <code className="text-ink">ANTHROPIC_API_KEY</code> in{" "}
              <code className="text-ink">apps/api/.env</code>). Without a key, agents stay on the local heuristic
              with status awaiting credentials — never fake live Claude success.
            </p>
            <Link href="/agents">
              <Button variant="secondary">Open agents</Button>
            </Link>
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
