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
  const [handoffEnabled, setHandoffEnabled] = useState(true);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [callNumber, setCallNumber] = useState("");
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
      const hh = data.human_handoff || {};
      setHandoffEnabled(hh.enabled !== false);
      setWhatsappNumber(hh.whatsapp_number || "");
      setCallNumber(hh.call_number || "");
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
      if (data.human_handoff) {
        setHandoffEnabled(data.human_handoff.enabled !== false);
        setWhatsappNumber(data.human_handoff.whatsapp_number || "");
        setCallNumber(data.human_handoff.call_number || "");
      }
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

  async function saveHumanHandoff(e) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const data = await apiFetch("/v1/settings/human-handoff", {
        method: "PUT",
        body: {
          enabled: handoffEnabled,
          whatsapp_number: whatsappNumber.trim(),
          call_number: callNumber.trim(),
        },
      });
      if (data.human_handoff) {
        setHandoffEnabled(data.human_handoff.enabled !== false);
        setWhatsappNumber(data.human_handoff.whatsapp_number || "");
        setCallNumber(data.human_handoff.call_number || "");
      }
      setNotice("Live support contacts saved.");
    } catch (err) {
      setError(err.message || "Failed to save live support contacts");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell
      title="Settings"
      description="Workspace defaults, live support contacts for human handoff, timezone for scheduling displays, and emergency controls."
    >
      {loading ? <Skeleton className="h-40" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading && workspace ? (
        <div className="space-y-5">
          <section className="surface-card p-5">
            <div className="ops-card-header">
              <div className="min-w-0">
                <h2 className="font-display text-2xl">{workspace.name}</h2>
                <p className="mt-1 text-sm text-muted">
                  {workspace.slug} · {workspace.timezone} · {workspace.default_language}
                </p>
              </div>
            </div>
            <div className="ops-actions">
              <Badge tone={workspace.outbound_paused ? "danger" : "success"}>
                Outbound {workspace.outbound_paused ? "paused" : "active"}
              </Badge>
              <Badge tone={workspace.automations_paused ? "danger" : "success"}>
                Automations {workspace.automations_paused ? "paused" : "active"}
              </Badge>
            </div>
          </section>

          <section className="surface-card p-5">
            <div className="ops-card-header">
              <div className="min-w-0">
                <h2 className="font-display text-2xl">Live support handoff</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">
                  When a customer asks to speak with a person (for example on WhatsApp), Support
                  hands off and shares these WhatsApp and/or call numbers for live chat or a call.
                  Leave a field blank to omit that option.
                </p>
              </div>
            </div>
            <form className="mt-4 max-w-xl space-y-4" onSubmit={saveHumanHandoff}>
              <label className="flex items-center gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={handoffEnabled}
                  onChange={(e) => setHandoffEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-line accent-brown"
                />
                Share live contacts when customers ask for a person
              </label>
              <Input
                label="WhatsApp number (live chat)"
                name="whatsapp_number"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="+40 768 407 242"
                hint="E.164 preferred. Included with a wa.me link in the handoff reply."
              />
              <Input
                label="Call number"
                name="call_number"
                value={callNumber}
                onChange={(e) => setCallNumber(e.target.value)}
                placeholder="+49 157 7119 1097"
                hint="Phone number customers can dial for live support."
              />
              <div className="ops-actions">
                <Button type="submit" disabled={busy} size="sm">
                  Save live support contacts
                </Button>
              </div>
            </form>
          </section>

          <section className="surface-card p-5">
            <div className="ops-card-header">
              <div className="min-w-0">
                <h2 className="font-display text-2xl">Timezone & system time</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">
                  Ops UI clocks, calendar “now”, and scheduling displays use the server clock aligned to this
                  IANA timezone. Historical seed message timestamps stay as stored; live surfaces always use current time.
                </p>
              </div>
            </div>
            <p className="mb-4 text-sm text-muted">
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

          <section className="surface-card p-5">
            <div className="ops-card-header">
              <div className="min-w-0">
                <h2 className="font-display text-2xl">AI agents</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">
                  Check AI status on{" "}
                  <Link href="/integrations" className="text-brown-dark underline">
                    Integrations
                  </Link>
                  . Agents stay on local assistance until credentials are connected.
                </p>
              </div>
            </div>
            <div className="ops-actions">
              <Link href="/agents">
                <Button variant="secondary">Open agents</Button>
              </Link>
              <Link href="/agents/training">
                <Button variant="secondary">Training docs</Button>
              </Link>
            </div>
          </section>

          <section className="surface-card p-5">
            <div className="ops-card-header">
              <div className="min-w-0">
                <h2 className="font-display text-2xl">Brand on outbound</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">
                  WhatsApp, email, invoices, receipts, and channel templates include the Triada logo
                  header, address footer, and warm greetings. Logo sourced from{" "}
                  <a
                    href="https://triada-designs.com"
                    className="text-brown-dark underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    triada-designs.com
                  </a>
                  . Edit invoice content in plain text while keeping that brand chrome.
                </p>
              </div>
            </div>
            <div className="ops-actions">
              <Link href="/orders/invoices">
                <Button variant="secondary">Invoice editor</Button>
              </Link>
            </div>
          </section>

          <section className="surface-card p-5">
            <div className="ops-card-header">
              <div className="min-w-0">
                <h2 className="font-display text-2xl">Emergency controls</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">
                  Pause stops eligible Meta/webchat outbound and workflow execution workspace-wide. Resume when ready.
                </p>
              </div>
            </div>
            <div className="ops-actions">
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

          <section className="surface-card p-5">
            <div className="ops-card-header">
              <div className="min-w-0">
                <h2 className="font-display text-2xl">Meta messaging</h2>
                <p className="mt-1 text-sm text-muted">
                  Connect Pages / IG / WABA, webhooks, token health, and simulators from the Meta hub.
                </p>
              </div>
            </div>
            <div className="ops-actions">
              <Link href="/integrations/meta">
                <Button variant="secondary">Open Meta hub</Button>
              </Link>
            </div>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
