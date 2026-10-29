"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

const STATUS_OPTIONS = [
  "queued",
  "sent",
  "acknowledged",
  "accepted",
  "in_production",
  "ready",
  "shipped",
  "cancelled",
];

function statusTone(status) {
  if (status === "shipped" || status === "ready" || status === "acknowledged") return "success";
  if (status === "cancelled") return "danger";
  if (status === "queued" || status === "sent") return "warning";
  if (status === "in_production" || status === "accepted") return "info";
  return "neutral";
}

export default function ManufacturerPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [contactForm, setContactForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    preferred_channel: "email",
    is_primary: true,
    notes: "",
  });
  const [contactStatus, setContactStatus] = useState("");
  const [actionStatus, setActionStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch("/v1/jewellery-ops/manufacturer"));
    } catch (err) {
      setError(err.message || "Failed to load manufacturer");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveContact(event) {
    event.preventDefault();
    setContactStatus("");
    try {
      const result = await apiFetch("/v1/jewellery-ops/manufacturer/contacts", {
        method: "POST",
        body: contactForm,
      });
      setContactStatus(`Saved ${result.contact?.name || "contact"}`);
      setContactForm({
        name: "",
        company: "",
        email: "",
        phone: "",
        preferred_channel: "email",
        is_primary: false,
        notes: "",
      });
      load();
    } catch (err) {
      setContactStatus(err.message || "Save failed");
    }
  }

  async function ackOrder(id) {
    setBusyId(id);
    setActionStatus("");
    try {
      await apiFetch(`/v1/jewellery-ops/manufacturer/orders/${id}/ack`, {
        method: "POST",
        body: { note: "Admin confirmed manufacturer placement" },
      });
      setActionStatus("Placement confirmed");
      await load();
    } catch (err) {
      setActionStatus(err.message || "Ack failed");
    } finally {
      setBusyId("");
    }
  }

  async function setStatus(id, status) {
    setBusyId(id);
    setActionStatus("");
    try {
      await apiFetch(`/v1/jewellery-ops/manufacturer/orders/${id}/status`, {
        method: "POST",
        body: { status },
      });
      setActionStatus(`Status → ${status}`);
      await load();
    } catch (err) {
      setActionStatus(err.message || "Status update failed");
    } finally {
      setBusyId("");
    }
  }

  async function resendOrder(id) {
    setBusyId(id);
    setActionStatus("");
    try {
      const result = await apiFetch(`/v1/jewellery-ops/manufacturer/orders/${id}/resend`, {
        method: "POST",
        body: {},
      });
      setActionStatus(
        `Resent · ${result.manufacturer_order?.delivery_mode || result.delivery?.delivery_mode || "recorded"}`,
      );
      await load();
    } catch (err) {
      setActionStatus(err.message || "Resend failed");
    } finally {
      setBusyId("");
    }
  }

  return (
    <DashboardShell
      title="Manufacturer"
      description="Contacts directory, paid-order placement, cost/price/profit, and ack/status so you can confirm each job was placed."
      actions={
        <Button size="sm" variant="secondary" onClick={load}>
          Refresh
        </Button>
      }
    >
      {loading ? <Skeleton className="h-40" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && data ? (
        <div className="space-y-5">
          {(data.low_stock || []).length ? (
            <div className="surface-card px-4 py-3 text-sm text-ink">
              Low stock alerts: {(data.low_stock || []).map((r) => r.display_name).join(", ")}
            </div>
          ) : null}

          {actionStatus ? <p className="text-sm text-muted">{actionStatus}</p> : null}

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Manufacturer contacts</h2>
              <p className="mt-1 text-sm text-muted">
                Who receives manufacture jobs — email or WhatsApp. Primary contact is used on paid order send.
              </p>
            </div>
            <div className="divide-y divide-line">
              {(data.contacts || []).length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">No contacts yet.</p>
              ) : null}
              {(data.contacts || []).map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink">
                      {c.name}
                      {c.company ? ` · ${c.company}` : ""}
                    </p>
                    <p className="text-muted">
                      {c.email || "—"} · {c.phone || "—"} · {c.preferred_channel}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.is_primary ? <Badge tone="brand">Primary</Badge> : null}
                    <Badge>{c.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
            <form className="space-y-3 border-t border-line px-5 py-4" onSubmit={saveContact}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Name"
                  required
                  value={contactForm.name}
                  onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                />
                <Input
                  label="Company"
                  value={contactForm.company}
                  onChange={(e) => setContactForm((f) => ({ ...f, company: e.target.value }))}
                />
                <Input
                  label="Email"
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                />
                <Input
                  label="Phone"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block space-y-1.5">
                  <span className="block text-[13px] font-medium text-ink">Preferred channel</span>
                  <select
                    className="rounded-sm border border-line bg-white px-2 py-2 text-sm text-ink"
                    value={contactForm.preferred_channel}
                    onChange={(e) =>
                      setContactForm((f) => ({ ...f, preferred_channel: e.target.value }))
                    }
                  >
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={contactForm.is_primary}
                    onChange={(e) =>
                      setContactForm((f) => ({ ...f, is_primary: e.target.checked }))
                    }
                  />
                  Primary contact
                </label>
                <Button type="submit" size="sm">
                  Add contact
                </Button>
              </div>
              {contactStatus ? <p className="text-sm text-muted">{contactStatus}</p> : null}
            </form>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Materials</h2>
            </div>
            <div className="divide-y divide-line">
              {(data.materials || []).map((m) => (
                <div key={m.id || m.material_key} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink">{m.display_name}</p>
                    <p className="text-muted">
                      Metal {m.metal_price_per_gram}/{m.unit} · making {m.making_charge_per_gram}/{m.unit} · stock{" "}
                      {m.stock_grams ?? "—"}
                    </p>
                  </div>
                  <Badge>{m.material_key}</Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Manufacturer orders</h2>
              <p className="mt-1 text-sm text-muted">
                Confirm placement with Ack, advance status, or resend when credentials are live.
                {data.awaiting_ack ? ` · ${data.awaiting_ack} awaiting confirmation` : ""}
              </p>
            </div>
            <div className="divide-y divide-line">
              {(data.orders || []).length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">No manufacturer orders yet — create a paid order first.</p>
              ) : null}
              {(data.orders || []).map((o) => (
                <div key={o.id} className="space-y-2 px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink">
                        {o.piece} · {o.size || "—"} · {o.metal || "—"}
                      </p>
                      <p className="text-muted">
                        {o.external_ref} · cost {o.cost} · sell {o.sell_price} · profit {o.profit} · engraving{" "}
                        {o.engraving || "—"}
                      </p>
                      <p className="text-muted">
                        Delivery {o.delivery_mode}
                        {o.acked_at ? ` · acked ${new Date(o.acked_at).toLocaleString()}` : ""}
                        {o.sent_at && !o.acked_at ? ` · sent ${new Date(o.sent_at).toLocaleString()}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                      {o.placement_confirmed ? <Badge tone="success">Confirmed</Badge> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!o.placement_confirmed ? (
                      <Button
                        size="sm"
                        disabled={busyId === o.id}
                        onClick={() => ackOrder(o.id)}
                      >
                        Confirm placement
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === o.id}
                      onClick={() => resendOrder(o.id)}
                    >
                      Resend
                    </Button>
                    <label className="flex items-center gap-1.5 text-muted">
                      <span className="sr-only">Status</span>
                      <select
                        className="rounded-sm border border-line bg-white px-2 py-1.5 text-sm text-ink"
                        value={o.status}
                        disabled={busyId === o.id}
                        onChange={(e) => setStatus(o.id, e.target.value)}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
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
