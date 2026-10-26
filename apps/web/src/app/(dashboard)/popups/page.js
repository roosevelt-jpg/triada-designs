"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

export default function PopupsPage() {
  const [markets, setMarkets] = useState([]);
  const [apps, setApps] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("Al Quoz Design Weekend");
  const [venue, setVenue] = useState("Al Quoz");
  const [deadline, setDeadline] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [m, a] = await Promise.all([
        apiFetch("/v1/jewellery-ops/popups"),
        apiFetch("/v1/jewellery-ops/popup-applications"),
      ]);
      setMarkets(m.data || []);
      setApps(a.data || []);
    } catch (err) {
      setError(err.message || "Failed to load pop-ups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    setDeadline(d.toISOString().slice(0, 10));
    load();
  }, [load]);

  async function addMarket(event) {
    event.preventDefault();
    setStatus("");
    try {
      await apiFetch("/v1/jewellery-ops/popups", {
        method: "POST",
        body: {
          name,
          venue,
          city: "Dubai",
          market_type: "designer_space",
          application_deadline: deadline,
          fee_aed: 2500,
          contact_email: "markets@example.com",
          contact_name: "Programme team",
        },
      });
      const scan = await apiFetch("/v1/jewellery-ops/popups/scan-alerts", { method: "POST" });
      setStatus(`Saved. Alerts fired: ${scan.alerted || 0}`);
      load();
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function draftApp(marketId) {
    await apiFetch(`/v1/jewellery-ops/popups/${marketId}/draft-application`, { method: "POST" });
    load();
  }

  async function approveApp(applicationId) {
    await apiFetch(`/v1/jewellery-ops/popup-applications/${applicationId}/approve`, { method: "POST" });
    load();
  }

  return (
    <DashboardShell
      title="Pop-ups & markets"
      description="Dubai / UAE pop-ups, designer spaces, festivals — deadlines, fees, alerts, draft application emails for approve."
    >
      {loading ? <Skeleton className="h-32" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error ? (
        <div className="space-y-5">
          <Card>
            <h2 className="ops-section-title">Add market</h2>
            <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={addMarket}>
              <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
              <Input label="Application deadline" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              <Button type="submit" size="sm">
                Save & scan alerts
              </Button>
            </form>
            {status ? <p className="mt-2 text-sm text-muted">{status}</p> : null}
          </Card>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Markets</h2>
            </div>
            <div className="divide-y divide-line">
              {markets.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink">{m.name}</p>
                    <p className="text-muted">
                      {m.venue} · {m.city} · fee {m.fee_aed ?? "—"} AED · deadline {m.application_deadline || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{m.status}</Badge>
                    <Button size="sm" variant="secondary" onClick={() => draftApp(m.id)}>
                      Draft application
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Applications</h2>
            </div>
            <div className="divide-y divide-line">
              {apps.map((a) => (
                <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                  <div className="max-w-xl">
                    <p className="font-medium text-ink">{a.subject}</p>
                    <p className="mt-1 whitespace-pre-wrap text-muted">{a.body}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{a.status}</Badge>
                    {a.status === "awaiting_approval" ? (
                      <Button size="sm" onClick={() => approveApp(a.id)}>
                        Approve & send
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
