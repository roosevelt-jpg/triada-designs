"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch, setStoredToken } from "@/lib/api-client";

const LogoBubbles = dynamic(
  () =>
    import("@/components/brand/LogoBubbles").then((m) => m.LogoBubbles),
  { ssr: false },
);

export default function AcceptInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = String(params?.token || "");

  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Missing invitation token.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch(`/v1/invites/${encodeURIComponent(token)}`, {
          auth: false,
        });
        if (cancelled) return;
        setInvite(data);
        setName(data.name || "");
      } catch (err) {
        if (!cancelled) setError(err.message || "Invitation not found.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    if (password !== password2) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      const data = await apiFetch(
        `/v1/invites/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
          auth: false,
          body: {
            name,
            phone,
            role_title: roleTitle,
            password,
          },
        },
      );
      if (data.login?.token) {
        setStoredToken(data.login.token);
        router.replace("/overview");
        return;
      }
      router.replace("/login");
    } catch (err) {
      setError(err.message || "Unable to complete invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ivory">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(199,174,138,0.28),transparent_50%),radial-gradient(ellipse_at_10%_80%,rgba(154,121,88,0.12),transparent_45%),linear-gradient(165deg,#faf8f4_0%,#efe6d8_55%,#e8ded0_100%)]" />
      <LogoBubbles className="z-[1]" />

      <div className="relative z-[2] mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
        <div className="rounded-xl border border-line bg-white/90 p-6 shadow-popover backdrop-blur-sm sm:p-8">
          <BrandLogo variant="primary" className="mb-5 h-9 w-auto" />
          <h1 className="font-display text-2xl tracking-[-0.02em] text-ink">
            Complete your profile
          </h1>
          <p className="mt-2 text-sm text-muted">
            Warm greetings from Triada Designs — set your password and join the ops
            workspace.
          </p>

          {loading ? (
            <p className="mt-6 text-sm text-muted">Loading invitation…</p>
          ) : null}

          {error && !invite ? (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-danger">{error}</p>
              <Link href="/login" className="text-sm text-brown underline">
                Back to sign in
              </Link>
            </div>
          ) : null}

          {invite ? (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <p className="rounded-md border border-line bg-sand/50 px-3 py-2 text-sm text-ink">
                Invited as <strong>{invite.role?.name || invite.role_slug}</strong> ·{" "}
                {invite.email}
              </p>
              <Input
                label="Full name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                label="Phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+40 …"
              />
              <Input
                label="Role title"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="e.g. Studio manager"
                hint="Your job title — separate from dashboard access role."
              />
              <Input
                label="Password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                hint="At least 8 characters."
              />
              <Input
                label="Confirm password"
                type="password"
                required
                minLength={8}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Activating…" : "Activate account"}
              </Button>
              <p className="text-center text-xs text-muted">
                Already activated?{" "}
                <Link href="/login" className="text-brown underline">
                  Sign in
                </Link>
              </p>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
