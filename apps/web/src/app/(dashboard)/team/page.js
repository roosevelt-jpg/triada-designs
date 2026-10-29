"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";
import { PERMISSION_AREAS } from "@/lib/team/permissions";

export default function TeamPage() {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [roles, setRoles] = useState([]);
  const [areas, setAreas] = useState(PERMISSION_AREAS);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("members");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("role-viewer");
  const [lastAcceptUrl, setLastAcceptUrl] = useState("");

  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [roleDraft, setRoleDraft] = useState(null);
  const [newRoleName, setNewRoleName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/team");
      setMembers(data.data || []);
      setInvites(data.invites || []);
      setRoles(data.roles || []);
      if (Array.isArray(data.permission_areas) && data.permission_areas.length) {
        setAreas(data.permission_areas);
      }
      const firstRole = (data.roles || [])[0];
      const viewer = (data.roles || []).find((r) => r.slug === "viewer");
      setSelectedRoleId((prev) => prev || firstRole?.id || "");
      setInviteRoleId((prev) => {
        if (prev && (data.roles || []).some((r) => r.id === prev)) return prev;
        return viewer?.id || firstRole?.id || "role-viewer";
      });
    } catch (err) {
      setError(err.message || "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) || null,
    [roles, selectedRoleId],
  );

  useEffect(() => {
    if (!selectedRole) {
      setRoleDraft(null);
      return;
    }
    setRoleDraft({
      name: selectedRole.name,
      description: selectedRole.description || "",
      permissions: structuredClone(selectedRole.permissions || {}),
    });
  }, [selectedRole]);

  async function sendInvite(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    setError("");
    setLastAcceptUrl("");
    try {
      const data = await apiFetch("/v1/team/invites", {
        method: "POST",
        body: {
          email: inviteEmail,
          name: inviteName,
          role_id: inviteRoleId,
        },
      });
      setNotice(data.message || "Invitation sent.");
      if (data.accept_url) setLastAcceptUrl(data.accept_url);
      setInviteEmail("");
      setInviteName("");
      await load();
      setTab("invites");
    } catch (err) {
      setError(err.message || "Unable to send invite.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(inviteId) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/v1/team/invites/${inviteId}`, { method: "DELETE" });
      setNotice("Invitation revoked.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeMemberRole(memberId, roleId) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/v1/team/members/${memberId}`, {
        method: "PATCH",
        body: { role_id: roleId },
      });
      setNotice("Member role updated.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeMemberStatus(memberId, status) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/v1/team/members/${memberId}`, {
        method: "PATCH",
        body: { status },
      });
      setNotice(`Member marked ${status}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function togglePerm(areaKey, level) {
    if (!roleDraft) return;
    setRoleDraft((prev) => {
      const next = structuredClone(prev);
      const row = next.permissions[areaKey] || { view: false, manage: false };
      if (level === "manage") {
        const manage = !row.manage;
        next.permissions[areaKey] = { view: manage || row.view, manage };
      } else {
        const view = !row.view;
        next.permissions[areaKey] = {
          view,
          manage: view ? row.manage : false,
        };
      }
      return next;
    });
  }

  async function saveRolePermissions() {
    if (!selectedRole || !roleDraft) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/v1/team/roles/${selectedRole.id}`, {
        method: "PATCH",
        body: {
          name: roleDraft.name,
          description: roleDraft.description,
          permissions: roleDraft.permissions,
        },
      });
      setNotice("Role permissions saved.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createCustomRole(event) {
    event.preventDefault();
    if (!newRoleName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch("/v1/team/roles", {
        method: "POST",
        body: {
          name: newRoleName.trim(),
          description: "Custom role",
          permissions: roleDraft?.permissions || {},
        },
      });
      setNewRoleName("");
      setNotice("Role created.");
      await load();
      if (data.data?.id) setSelectedRoleId(data.data.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    { id: "members", label: "Members" },
    { id: "invite", label: "Invite" },
    { id: "invites", label: "Pending invites" },
    { id: "roles", label: "Roles & permissions" },
  ];

  return (
    <DashboardShell
      title="Team"
      description="Invite teammates, complete profiles via branded email, and control what each role can see and manage."
    >
      <div className="ops-actions mb-5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "inline-flex h-9 items-center justify-center rounded-md bg-black px-3.5 text-sm font-medium text-gold"
                : "inline-flex h-9 items-center justify-center rounded-md border border-line-strong bg-field px-3.5 text-sm text-ink hover:bg-stone"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice ? (
        <p className="mb-4 rounded-md border border-line bg-sand/60 px-4 py-3 text-sm text-ink">
          {notice}
          {lastAcceptUrl ? (
            <>
              {" "}
              <span className="text-muted">Local accept link:</span>{" "}
              <a className="text-brown underline break-all" href={lastAcceptUrl}>
                {lastAcceptUrl}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {loading ? <Skeleton className="h-28" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error && tab === "members" ? (
        members.length === 0 ? (
          <EmptyState
            title="No members"
            description="Invite staff with the Invite tab."
          />
        ) : (
          <div className="surface-card divide-y divide-line overflow-hidden">
            {members
              .filter((m) => m.status !== "replaced")
              .map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{member.name || "—"}</p>
                    <p className="text-sm text-muted">{member.email}</p>
                    <p className="text-xs text-muted">
                      {member.role_title ? `${member.role_title} · ` : ""}
                      Last login: {formatDateTime(member.last_login_at) || "—"}
                    </p>
                  </div>
                  <div className="ops-actions">
                    <Badge tone="brand">{member.role?.name || "Role"}</Badge>
                    <Badge tone={member.status === "active" ? "neutral" : "danger"}>
                      {member.status}
                    </Badge>
                    <select
                      className="ops-field h-10 w-auto px-2"
                      value={member.role?.id || ""}
                      disabled={busy}
                      onChange={(e) => changeMemberRole(member.id, e.target.value)}
                      aria-label={`Role for ${member.email}`}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    {member.status === "active" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => changeMemberStatus(member.id, "disabled")}
                      >
                        Disable
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => changeMemberStatus(member.id, "active")}
                      >
                        Enable
                      </Button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )
      ) : null}

      {!loading && !error && tab === "invite" ? (
        <form
          onSubmit={sendInvite}
          className="surface-card max-w-xl space-y-4 p-5"
        >
          <p className="text-sm text-muted">
            Sends a branded Triada invitation via Resend. The invitee sets a password and
            completes their profile before signing in.
          </p>
          <Input
            label="Email"
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="teammate@example.com"
          />
          <Input
            label="Name (optional)"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Full name"
          />
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-ink">Role</span>
            <select
              className="ops-field h-11 px-3"
              value={inviteRoleId}
              onChange={(e) => setInviteRoleId(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={busy || !inviteEmail}>
            {busy ? "Sending…" : "Send invitation"}
          </Button>
        </form>
      ) : null}

      {!loading && !error && tab === "invites" ? (
        invites.length === 0 ? (
          <EmptyState
            title="No pending invites"
            description="New invitations appear here until accepted or revoked."
          />
        ) : (
          <div className="surface-card divide-y divide-line overflow-hidden">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{invite.name || invite.email}</p>
                  <p className="text-sm text-muted">{invite.email}</p>
                  <p className="text-xs text-muted">
                    Role: {invite.role_slug} · Expires{" "}
                    {formatDateTime(invite.expires_at) || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="brand">pending</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => revoke(invite.id)}
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}

      {!loading && !error && tab === "roles" ? (
        <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
          <div className="surface-card space-y-2 p-3">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoleId(r.id)}
                className={
                  selectedRoleId === r.id
                    ? "block w-full rounded-md bg-sand px-3 py-2 text-left text-sm font-medium text-brown-dark"
                    : "block w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-ivory"
                }
              >
                {r.name}
                {r.is_system ? (
                  <span className="ml-2 text-[11px] uppercase tracking-wide text-muted">
                    system
                  </span>
                ) : null}
              </button>
            ))}
            <form onSubmit={createCustomRole} className="space-y-2 border-t border-line pt-3">
              <Input
                label="New role"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g. Studio"
              />
              <Button type="submit" size="sm" disabled={busy || !newRoleName.trim()}>
                Create role
              </Button>
            </form>
          </div>

          {roleDraft ? (
            <div className="surface-card space-y-4 p-5">
              <Input
                label="Role name"
                value={roleDraft.name}
                onChange={(e) =>
                  setRoleDraft((p) => ({ ...p, name: e.target.value }))
                }
              />
              <Input
                label="Description"
                value={roleDraft.description}
                onChange={(e) =>
                  setRoleDraft((p) => ({ ...p, description: e.target.value }))
                }
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th className="py-2 font-medium">Area</th>
                      <th className="py-2 font-medium">View</th>
                      <th className="py-2 font-medium">Manage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {areas.map((area) => {
                      const row = roleDraft.permissions?.[area.key] || {
                        view: false,
                        manage: false,
                      };
                      return (
                        <tr key={area.key} className="border-b border-line/70">
                          <td className="py-2.5 pr-3">
                            <p className="font-medium text-ink">{area.label}</p>
                            <p className="text-xs text-muted">{area.description}</p>
                          </td>
                          <td className="py-2.5">
                            <input
                              type="checkbox"
                              checked={Boolean(row.view)}
                              onChange={() => togglePerm(area.key, "view")}
                              aria-label={`${area.label} view`}
                            />
                          </td>
                          <td className="py-2.5">
                            <input
                              type="checkbox"
                              checked={Boolean(row.manage)}
                              onChange={() => togglePerm(area.key, "manage")}
                              aria-label={`${area.label} manage`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button type="button" disabled={busy} onClick={saveRolePermissions}>
                Save permissions
              </Button>
            </div>
          ) : (
            <EmptyState title="Select a role" description="Choose a role to edit permissions." />
          )}
        </div>
      ) : null}
    </DashboardShell>
  );
}
