"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  PlacesLocationPicker,
  emptyPlacesLocation,
} from "@/components/popups/PlacesLocationPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { connectionLabel } from "@/lib/integrations/brand-labels";

export default function PopupsPage() {
  const [markets, setMarkets] = useState([]);
  const [apps, setApps] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("Al Quoz Design Weekend");
  const [deadline, setDeadline] = useState("");
  const [status, setStatus] = useState("");
  const [location, setLocation] = useState(() => ({
    ...emptyPlacesLocation(),
    city: "Dubai",
    country: "United Arab Emirates",
  }));
  const [places, setPlaces] = useState({
    connected: false,
    browser_key: "",
    status_label: "Waiting credentials",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [m, a, placesCfg] = await Promise.all([
        apiFetch("/v1/jewellery-ops/popups"),
        apiFetch("/v1/jewellery-ops/popup-applications"),
        apiFetch("/v1/integrations/google-places").catch(() => null),
      ]);
      setMarkets(m.data || []);
      setApps(a.data || []);
      if (placesCfg) {
        setPlaces({
          connected: Boolean(placesCfg.has_credentials || placesCfg.status === "connected"),
          browser_key: placesCfg.browser_key || "",
          status_label:
            placesCfg.status_label ||
            connectionLabel(placesCfg.status, {
              hasCredentials: placesCfg.has_credentials,
            }),
        });
      }
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
    if (places.connected) {
      if (!location.country || !location.city) {
        setStatus("Pick a country and city from Google Places Autocomplete.");
        return;
      }
      if (location.lat == null || location.lng == null) {
        setStatus("Set a precise map pin (lat/lng) before saving.");
        return;
      }
    }
    try {
      await apiFetch("/v1/jewellery-ops/popups", {
        method: "POST",
        body: {
          name,
          venue: location.venue || location.formatted_address || location.town || location.city,
          country: location.country || null,
          city: location.city || "Dubai",
          town: location.town || null,
          emirate: location.city || "Dubai",
          market_type: "designer_space",
          application_deadline: deadline,
          fee_aed: 2500,
          contact_email: "markets@example.com",
          contact_name: "Programme team",
          place_id: location.place_id || null,
          formatted_address: location.formatted_address || null,
          lat: location.lat,
          lng: location.lng,
          latitude: location.lat,
          longitude: location.lng,
          metadata: {
            location_source: "google_places",
            place_id: location.place_id || null,
            country: location.country || null,
            town: location.town || null,
            lat: location.lat,
            lng: location.lng,
          },
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
    await apiFetch(`/v1/jewellery-ops/popup-applications/${applicationId}/approve`, {
      method: "POST",
    });
    load();
  }

  function locationLine(m) {
    const parts = [
      m.venue,
      m.town,
      m.city,
      m.country,
      m.lat != null && m.lng != null
        ? `${Number(m.lat).toFixed(4)}, ${Number(m.lng).toFixed(4)}`
        : null,
    ].filter(Boolean);
    return parts.join(" · ") || "—";
  }

  return (
    <DashboardShell
      title="Pop-ups & markets"
      description="Dubai / UAE pop-ups, designer spaces, festivals — location via Google Places (country, city/town + map pin), deadlines, fees, alerts, draft applications."
      actions={
        <Link href="/integrations">
          <Button size="sm" variant="secondary">
            Integrations
          </Button>
        </Link>
      }
    >
      {loading ? <Skeleton className="h-32" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error ? (
        <div className="space-y-5">
          <Card>
            <h2 className="ops-section-title">Add market</h2>
            <form className="mt-3 space-y-4" onSubmit={addMarket}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
                <Input
                  label="Application deadline"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>

              <PlacesLocationPicker
                apiKey={places.browser_key}
                connected={places.connected}
                value={location}
                onChange={setLocation}
              />

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
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-ink">{m.name}</p>
                    <p className="text-muted">
                      {locationLine(m)} · fee {m.fee_aed ?? "—"} AED · deadline{" "}
                      {m.application_deadline || "—"}
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
                <div
                  key={a.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm"
                >
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
