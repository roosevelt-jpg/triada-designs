"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

const ALL_WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

function mediaUrl(url) {
  if (!url) return null;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? url : `/${url}`;
}

export default function QuoteInspirationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settings, setSettings] = useState(null);
  const [history, setHistory] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [nextSendAt, setNextSendAt] = useState(null);
  const [recipientsAvailable, setRecipientsAvailable] = useState(0);
  const [theme, setTheme] = useState("");
  const [language, setLanguage] = useState("en");
  const [latestCard, setLatestCard] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/content/inspiration");
      setSettings(data.settings || null);
      setHistory(data.history || []);
      setQuotes(data.quotes || []);
      setNextSendAt(data.next_send_at || null);
      setRecipientsAvailable(data.recipients_available || 0);
      setTheme(data.settings?.theme || "quiet luxury jewellery");
      setLanguage(data.settings?.language || "en");
      const latest = (data.history || [])[0];
      if (latest?.card_url) setLatestCard(latest);
    } catch (err) {
      setError(err.message || "Failed to load inspiration engine");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const weekdaySet = useMemo(
    () => new Set((settings?.weekdays || []).map(Number)),
    [settings],
  );

  async function saveSettings(patch) {
    setBusy("settings");
    setNotice("");
    try {
      const result = await apiFetch("/v1/content/inspiration/settings", {
        method: "POST",
        body: patch,
      });
      setSettings(result.settings);
      setNextSendAt(result.next_send_at || null);
      setNotice("Weekday schedule saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function toggleWeekday(day) {
    if (!settings) return;
    const next = new Set(settings.weekdays || []);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    const weekdays = [...next].sort((a, b) => a - b);
    saveSettings({ weekdays: weekdays.length ? weekdays : [1, 3, 5] });
  }

  async function generate() {
    setBusy("generate");
    setError("");
    setNotice("");
    try {
      const result = await apiFetch("/v1/content/inspiration/generate", {
        method: "POST",
        body: { theme, language },
      });
      setLatestCard({
        quote: result.quote?.quote,
        attribution: result.quote?.attribution,
        caption: result.quote?.caption,
        card_url: result.quote?.card_url,
        status: result.content?.status,
        content_id: result.content?.id,
        training_docs: result.training_docs,
      });
      setNotice(result.message || "Quote card ready for preview.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function approveLatest() {
    const id = latestCard?.content_id || history[0]?.content_id;
    if (!id) return;
    setBusy("approve");
    try {
      await apiFetch(`/v1/content/${id}/approve`, { method: "POST" });
      if (nextSendAt) {
        await apiFetch(`/v1/content/${id}/schedule`, {
          method: "POST",
          body: { scheduled_for: nextSendAt },
        });
      }
      setNotice("Approved and scheduled for the next selected weekday.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function broadcastNow() {
    const id = latestCard?.content_id || history[0]?.content_id;
    setBusy("broadcast");
    setError("");
    try {
      const result = await apiFetch("/v1/content/inspiration/broadcast", {
        method: "POST",
        body: { content_id: id || undefined },
      });
      if (!result.ok) {
        setError(result.message || result.error || "Broadcast blocked");
      } else {
        setNotice(
          `Broadcast sent to ${result.broadcast?.sent || 0} of ${result.broadcast?.attempted || 0} recipients.`,
        );
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell
      title="Quote & Inspiration"
      description="Design quote cards, pick weekdays, broadcast to your WhatsApp campaign list."
    >
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading && settings ? (
        <div className="space-y-6">
          <section className="surface-card space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="ops-section-title">Weekday broadcast</h2>
                <p className="mt-1 text-sm text-muted">
                  Selected days · {settings.send_hour_utc}:
                  {String(settings.send_minute_utc || 0).padStart(2, "0")} UTC
                  {nextSendAt ? ` · next ${formatDateTime(nextSendAt)}` : ""}
                </p>
              </div>
              <Badge tone={settings.enabled ? "success" : "warning"}>
                {settings.enabled ? "Enabled" : "Paused"}
              </Badge>
            </div>

            <div className="ops-actions">
              {ALL_WEEKDAYS.map((day) => {
                const on = weekdaySet.has(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleWeekday(day.value)}
                    className={`h-10 min-w-[3rem] rounded-md border px-3 text-sm font-medium transition-colors ${
                      on
                        ? "border-black bg-black text-gold"
                        : "border-line bg-white text-ink hover:bg-stone"
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm text-muted">
                Hour (UTC)
                <input
                  type="number"
                  min={0}
                  max={23}
                  className="ops-field mt-1 block h-10 w-20 px-2"
                  value={settings.send_hour_utc}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      send_hour_utc: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy === "settings"}
                onClick={() =>
                  saveSettings({
                    send_hour_utc: settings.send_hour_utc,
                    enabled: settings.enabled,
                    theme,
                    language,
                    recipient_limit: settings.recipient_limit,
                  })
                }
              >
                Save schedule
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy === "settings"}
                onClick={() => saveSettings({ enabled: !settings.enabled })}
              >
                {settings.enabled ? "Pause" : "Enable"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/calendar")}
              >
                Open calendar
              </Button>
            </div>

            <p className="text-sm text-muted">
              Campaign list:{" "}
              <span className="text-ink">{settings.campaign_key}</span> ·{" "}
              {recipientsAvailable} WhatsApp-ready contacts · limit{" "}
              {settings.recipient_limit}
            </p>
          </section>

          <section className="surface-card space-y-4 p-5">
            <h2 className="ops-section-title">Generate quote card</h2>
            <p className="text-sm text-muted">
              Learns tone and niche from Training docs. Preview before you approve.
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="min-w-[16rem] flex-1 text-sm text-muted">
                Theme
                <input
                  className="ops-field mt-1 block h-11 px-3"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="quiet luxury jewellery"
                />
              </label>
              <label className="text-sm text-muted">
                Language
                <select
                  className="ops-field mt-1 block h-11 px-3"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {[
                    "en",
                    "ar",
                    "ro",
                    "de",
                    "fr",
                    "ru",
                    "es",
                    "pt",
                  ].map((code) => (
                    <option key={code} value={code}>
                      {code.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="ops-actions">
              <Button disabled={busy === "generate"} onClick={generate}>
                Generate quote card
              </Button>
              <Button
                variant="secondary"
                disabled={busy === "approve" || !latestCard}
                onClick={approveLatest}
              >
                Approve & schedule
              </Button>
              <Button
                variant="secondary"
                disabled={busy === "broadcast"}
                onClick={broadcastNow}
              >
                Broadcast now
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push("/content/review")}
              >
                Review queue
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push("/agents/training")}
              >
                Training docs
              </Button>
            </div>

            {latestCard?.card_url ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="overflow-hidden rounded-sm border border-line bg-stone/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(latestCard.card_url)}
                    alt="Quote card preview"
                    className="max-h-[28rem] w-full object-contain"
                  />
                </div>
                <div className="space-y-3 text-sm">
                  <p className="font-display text-xl text-ink">
                    “{latestCard.quote}”
                  </p>
                  <p className="text-muted">— {latestCard.attribution}</p>
                  <p className="text-muted">{latestCard.caption}</p>
                  {latestCard.status ? (
                    <Badge tone="brand">{latestCard.status}</Badge>
                  ) : null}
                  {latestCard.training_docs?.length ? (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted">
                        Learned from
                      </p>
                      <ul className="mt-1 space-y-1">
                        {latestCard.training_docs.map((d) => (
                          <li key={d.id}>
                            {d.title}{" "}
                            <span className="text-muted">({d.category})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <EmptyState
                title="No card yet"
                description="Generate a quote card to preview the design."
              />
            )}
          </section>

          <section className="surface-card space-y-3 p-5">
            <h2 className="ops-section-title">Recent inspiration</h2>
            {history.length === 0 && quotes.length === 0 ? (
              <EmptyState
                title="No history"
                description="Generated cards appear here after the first run."
              />
            ) : (
              <ul className="divide-y divide-line">
                {(history.length ? history : quotes).slice(0, 12).map((row) => (
                  <li
                    key={row.id || row.content_id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ink">
                        {row.quote || row.body || row.title}
                      </p>
                      <p className="text-xs text-muted">
                        {row.theme || "inspiration"}
                        {row.scheduled_for
                          ? ` · ${formatDateTime(row.scheduled_for)}`
                          : ""}
                      </p>
                    </div>
                    <Badge tone="neutral">{row.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
