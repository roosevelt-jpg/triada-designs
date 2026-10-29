"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

const LINKS = [
  { href: "/inbox", label: "Unified inbox" },
  { href: "/orders", label: "Orders & invoices" },
  { href: "/orders/invoices", label: "Invoice editor" },
  { href: "/manufacturer", label: "Manufacturer" },
  { href: "/outreach", label: "Outreach CRM" },
  { href: "/popups", label: "Pop-ups & markets" },
  { href: "/ugc", label: "UGC & tags" },
  { href: "/automations", label: "Workflows" },
  { href: "/integrations", label: "Integrations" },
];

export default function JewelleryOpsPage() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("What ring sizes do you have? Also materials and make time?");
  const [botResult, setBotResult] = useState(null);
  const [giftWho, setGiftWho] = useState("sister");
  const [giftOccasion, setGiftOccasion] = useState("birthday");
  const [giftBudget, setGiftBudget] = useState("400-900");
  const [giftResult, setGiftResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/jewellery-ops/overview");
      setOverview(data);
    } catch (err) {
      setError(err.message || "Failed to load jewellery ops");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runAnswerBot(event) {
    event.preventDefault();
    setBotResult(null);
    try {
      const result = await apiFetch("/v1/jewellery-ops/answer-bot", {
        method: "POST",
        body: { message, dry_run: true },
      });
      setBotResult(result);
    } catch (err) {
      setBotResult({ ok: false, error: err.message });
    }
  }

  async function runGiftFinder(event) {
    event.preventDefault();
    setGiftResult(null);
    try {
      const result = await apiFetch("/v1/jewellery-ops/gift-finder", {
        method: "POST",
        body: { who: giftWho, occasion: giftOccasion, budget: giftBudget },
      });
      setGiftResult(result);
    } catch (err) {
      setGiftResult({ ok: false, error: err.message });
    }
  }

  return (
    <DashboardShell
      title="Jewellery ops"
      description="Triada Dubai automations: answer-bot, gift finder, custom pieces, orders, invoices, alerts, waitlist, after-sale, UGC, outreach, pop-ups, manufacturer, content."
      actions={
        <Button size="sm" variant="secondary" onClick={load}>
          Refresh
        </Button>
      }
    >
      {loading ? <Skeleton className="h-40" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error && overview ? (
        <div className="space-y-5">
          <div className="ops-actions">
            {Object.entries(overview.automations || {}).map(([key, val]) => (
              <Badge key={key} tone={val ? "success" : "neutral"}>
                {key.replaceAll("_", " ")}
              </Badge>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(overview.counts || {}).map(([key, val]) => (
              <div key={key} className="surface-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted">{key.replaceAll("_", " ")}</p>
                <p className="mt-1 font-display text-2xl text-ink">{val}</p>
              </div>
            ))}
          </div>

          <div className="ops-actions">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                <Button size="sm" variant="secondary">
                  {link.label}
                </Button>
              </Link>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="ops-section-title">Answer-bot (dry run)</h2>
              <p className="mt-1 text-sm text-muted">
                Sizes, materials, care, shipping, price list, ~7-day make — handoff when unsure.
              </p>
              <form className="mt-4 space-y-3" onSubmit={runAnswerBot}>
                <Input label="Customer message" value={message} onChange={(e) => setMessage(e.target.value)} />
                <Button type="submit" size="sm">
                  Run answer-bot
                </Button>
              </form>
              {botResult ? (
                <pre className="mt-3 max-h-56 overflow-auto border border-line bg-stone/40 p-3 text-xs text-ink">
                  {JSON.stringify(botResult, null, 2)}
                </pre>
              ) : null}
            </Card>

            <Card>
              <h2 className="ops-section-title">Gift finder</h2>
              <p className="mt-1 text-sm text-muted">Who / occasion / budget → 2–3 pieces with photo & link.</p>
              <form className="mt-4 space-y-3" onSubmit={runGiftFinder}>
                <Input label="Who" value={giftWho} onChange={(e) => setGiftWho(e.target.value)} />
                <Input label="Occasion" value={giftOccasion} onChange={(e) => setGiftOccasion(e.target.value)} />
                <Input label="Budget" value={giftBudget} onChange={(e) => setGiftBudget(e.target.value)} />
                <Button type="submit" size="sm">
                  Suggest gifts
                </Button>
              </form>
              {giftResult ? (
                <ul className="mt-3 space-y-2">
                  {(giftResult.suggestions || []).map((s) => (
                    <li key={s.sku || s.title} className="flex gap-3 border border-line px-3 py-2 text-sm">
                      {s.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.photo_url}
                          alt=""
                          className="h-14 w-14 shrink-0 object-cover"
                        />
                      ) : null}
                      <div>
                        <p className="font-medium text-ink">
                          {s.title} · {s.price} {s.currency}
                        </p>
                        <p className="text-muted">{s.reason}</p>
                        {s.product_url ? (
                          <a
                            className="text-brown-dark underline"
                            href={s.product_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View piece
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                  {giftResult.ok === false ? (
                    <li className="text-sm text-muted">{giftResult.error || "Gift finder failed."}</li>
                  ) : null}
                  {giftResult.ok !== false && !(giftResult.suggestions || []).length ? (
                    <li className="text-sm text-muted">{giftResult.prompt || "No matching pieces yet."}</li>
                  ) : null}
                </ul>
              ) : null}
            </Card>
          </div>

          <Card>
            <h2 className="ops-section-title">Hard rules (from policy)</h2>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {Object.entries(overview.policies || {}).map(([k, v]) => (
                <li key={k}>
                  <span className="font-medium text-ink">{k.replaceAll("_", " ")}:</span> {String(v)}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </DashboardShell>
  );
}
