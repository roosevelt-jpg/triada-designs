"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api-client";

export default function ContactsPage() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = q ? `?q=${encodeURIComponent(q)}` : "";
      const response = await apiFetch(`/v1/contacts${query}`);
      setItems(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardShell
      title="Contacts"
      description="CRM contacts with normalized email/phone and optional Zoho sync."
      actions={
        <div className="w-full max-w-xs">
          <Input
            label="Search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, email, phone"
          />
        </div>
      }
    >
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="No contacts" description="Create a contact from inbox or CRM." />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="surface-card overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line bg-stone/40 text-[13px] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {items.map((contact) => (
                <tr key={contact.id} className="border-b border-line/70">
                  <td className="px-4 py-3 font-medium">{contact.name || "—"}</td>
                  <td className="px-4 py-3 text-muted">{contact.email || "—"}</td>
                  <td className="px-4 py-3 text-muted">{contact.phone || "—"}</td>
                  <td className="px-4 py-3 capitalize">{contact.lifecycle_status}</td>
                  <td className="px-4 py-3 capitalize text-muted">{contact.source || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </DashboardShell>
  );
}
