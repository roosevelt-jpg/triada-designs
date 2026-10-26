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

export default function OutreachPage() {
  const [prospects, setProspects] = useState([]);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState("Al Quoz Atelier");
  const [name, setName] = useState("Layla");
  const [email, setEmail] = useState("layla@example.com");
  const [segment, setSegment] = useState("boutique");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [p, m] = await Promise.all([
        apiFetch("/v1/jewellery-ops/outreach/prospects"),
        apiFetch("/v1/jewellery-ops/outreach/messages"),
      ]);
      setProspects(p.data || []);
      setMessages(m.data || []);
    } catch (err) {
      setError(err.message || "Failed to load outreach");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addProspect(event) {
    event.preventDefault();
    setStatus("");
    try {
      const created = await apiFetch("/v1/jewellery-ops/outreach/prospects", {
        method: "POST",
        body: {
          company_name: company,
          contact_name: name,
          email,
          segment,
          preferred_channel: "email",
          consent_recorded: true,
        },
      });
      const draft = await apiFetch(`/v1/jewellery-ops/outreach/prospects/${created.prospect.id}/draft`, {
        method: "POST",
        body: { channel: "email" },
      });
      setStatus(`Prospect + draft awaiting approval (${draft.message?.id})`);
      load();
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function approve(messageId) {
    await apiFetch(`/v1/jewellery-ops/outreach/messages/${messageId}/approve`, { method: "POST" });
    load();
  }

  return (
    <DashboardShell
      title="Outreach CRM"
      description="Boutiques, stylists, interior, corporate — email / Instagram / LinkedIn only. Templates need human approve. No bulk WhatsApp."
    >
      {loading ? <Skeleton className="h-32" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error ? (
        <div className="space-y-5">
          <Card>
            <h2 className="ops-section-title">Add prospect + draft</h2>
            <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={addProspect}>
              <Input label="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
              <Input label="Contact" value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input label="Segment" value={segment} onChange={(e) => setSegment(e.target.value)} />
              <Button type="submit" size="sm">
                Create & draft email
              </Button>
            </form>
            {status ? <p className="mt-2 text-sm text-muted">{status}</p> : null}
          </Card>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Prospects</h2>
            </div>
            <div className="divide-y divide-line">
              {prospects.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink">
                      {p.company_name} · {p.contact_name}
                    </p>
                    <p className="text-muted">
                      {p.segment} · {p.preferred_channel} · consent {p.consent_recorded ? "yes" : "no"}
                    </p>
                  </div>
                  <Badge>{p.status}</Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Messages (approve before send)</h2>
            </div>
            <div className="divide-y divide-line">
              {messages.map((m) => (
                <div key={m.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                  <div className="max-w-xl">
                    <p className="font-medium text-ink">
                      {m.channel} · {m.subject}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-muted">{m.body}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{m.status}</Badge>
                    {m.status === "awaiting_approval" ? (
                      <Button size="sm" onClick={() => approve(m.id)}>
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
