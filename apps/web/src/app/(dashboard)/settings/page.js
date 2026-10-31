"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { TimezoneSelect } from "@/components/ui/TimezoneSelect";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";
import {
  DEFAULT_TIMEZONE,
  normalizePreferredTimezone,
} from "@/lib/locale/preferred-timezone";
import { getSystemTimeState, nowDate, syncSystemTime } from "@/lib/system-time";

export default function SettingsPage() {
  const [workspace, setWorkspace] = useState(null);
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [handoffEnabled, setHandoffEnabled] = useState(true);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [callNumber, setCallNumber] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [opsEmail, setOpsEmail] = useState("");
  const [phones, setPhones] = useState("");
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
      setTimezone(
        normalizePreferredTimezone(data.workspace?.timezone, DEFAULT_TIMEZONE),
      );
      const hh = data.human_handoff || {};
      setHandoffEnabled(hh.enabled !== false);
      setWhatsappNumber(hh.whatsapp_number || "");
      setCallNumber(hh.call_number || "");
      const bc = data.brand_contact || {};
      setAddressLine(bc.address_line || "");
      setOpsEmail(bc.ops_email || "");
      setPhones(bc.phones || "");
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
    await patch({
      timezone: normalizePreferredTimezone(timezone, DEFAULT_TIMEZONE),
    });
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

  async function saveBrandContact(e) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const data = await apiFetch("/v1/settings/brand-contact", {
        method: "PUT",
        body: {
          address_line: addressLine.trim(),
          ops_email: opsEmail.trim(),
          phones: phones.trim(),
        },
      });
      if (data.brand_contact) {
        setAddressLine(data.brand_contact.address_line || "");
        setOpsEmail(data.brand_contact.ops_email || "");
        setPhones(data.brand_contact.phones || "");
      }
      setNotice("Brand address and contact saved for invoices and AI replies.");
    } catch (err) {
      setError(err.message || "Failed to save brand address");
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
          <section id="workspace" className="surface-card scroll-mt-24 p-5">
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

          <section id="live-support" className="surface-card scroll-mt-24 p-5">
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

          <section id="timezone" className="surface-card scroll-mt-24 p-5">
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
                <TimezoneSelect
                  label="Workspace timezone"
                  name="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  hint="Affects header clock, calendar “now”, and date formatting."
                />
              </div>
              <Button type="submit" disabled={busy} size="sm">
                Save timezone
              </Button>
            </form>
          </section>

          <section id="ai-agents" className="surface-card scroll-mt-24 p-5">
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

          <section id="brand" className="surface-card scroll-mt-24 p-5">
            <div className="ops-card-header">
              <div className="min-w-0">
                <h2 className="font-display text-2xl">Brand address & contact</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">
                  Shared footer for AI replies on Instagram, Messenger, WhatsApp and other channels,
                  plus blank invoice address fields. Logo and warm greetings stay branded from{" "}
                  <a
                    href="https://triada-designs.com"
                    className="text-brown-dark underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    triada-designs.com
                  </a>
                  . Saving an invoice with a custom address also updates this contact.
                </p>
              </div>
            </div>
            <form className="mt-4 max-w-xl space-y-4" onSubmit={saveBrandContact}>
              <label className="block text-sm text-ink">
                <span className="mb-1.5 block font-medium">Address line</span>
                <textarea
                  name="address_line"
                  rows={2}
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  className="ops-field w-full"
                  placeholder="Street, city, postal code, country"
                />
              </label>
              <Input
                label="Ops email"
                name="ops_email"
                type="email"
                value={opsEmail}
                onChange={(e) => setOpsEmail(e.target.value)}
                placeholder="info@triada-designs.com"
              />
              <Input
                label="Phones"
                name="phones"
                value={phones}
                onChange={(e) => setPhones(e.target.value)}
                placeholder="+40 … · +49 …"
                hint="Use · between numbers. Shown in AI reply and invoice footers."
              />
              <div className="ops-actions">
                <Button type="submit" disabled={busy} size="sm">
                  Save brand address
                </Button>
                <Link href="/orders/invoices">
                  <Button type="button" variant="secondary" size="sm">
                    Invoice editor
                  </Button>
                </Link>
              </div>
            </form>
          </section>

          <section id="emergency" className="surface-card scroll-mt-24 p-5">
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

          <section id="meta" className="surface-card scroll-mt-24 p-5">
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
