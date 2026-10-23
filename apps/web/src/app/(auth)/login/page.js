"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PUBLIC_SITE_URL } from "@/lib/constants";
import { apiFetch, getStoredToken, setStoredToken } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getStoredToken()) {
      router.replace("/overview");
    }
  }, [router]);

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await apiFetch("/v1/auth/login", {
        method: "POST",
        auth: false,
        body: { email, password, device_name: "web" },
      });
      setStoredToken(data.token);
      router.replace("/overview");
    } catch (err) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ivory">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(199,174,138,0.35),transparent_40%),linear-gradient(160deg,#faf8f4,#e8ded0)]" />
      <div className="page-shell relative flex min-h-screen items-center justify-center py-16">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-xl border border-line bg-white shadow-popover md:grid-cols-[1.1fr_0.9fr]">
          <div className="hidden bg-[linear-gradient(150deg,#70563f,#9a7958_45%,#c7ae8a)] p-10 text-white md:flex md:flex-col md:justify-between">
            <div>
              <BrandLogo variant="light" className="h-12 w-auto max-w-[240px]" />
              <p className="mt-4 text-sm uppercase tracking-[0.16em] text-white/70">
                Admin · Operations
              </p>
              <p className="mt-4 max-w-sm text-sm text-white/85">
                Sign in to the AI sales and marketing operations platform.
                Unified inbox, CRM, content approvals, WordPress, and Zoho.
              </p>
            </div>
            <p className="text-sm text-white/75">
              Staff access only. Public site remains on triada-designs.com.
            </p>
          </div>

          <div className="p-8 md:p-10">
            <div className="md:hidden">
              <BrandLogo variant="primary" className="h-10 w-auto" />
            </div>
            <h1 className="mt-4 font-sans text-xl font-medium">
              Admin sign in
            </h1>
            <p className="mt-2 text-sm text-muted">
              Workspace administrators and operators only. Public site remains
              on{" "}
              <a
                href={PUBLIC_SITE_URL}
                className="text-brown-dark underline-offset-2 hover:underline"
                rel="noreferrer"
              >
                triada-designs.com
              </a>
              .
            </p>

            <form className="mt-8 space-y-4" onSubmit={onSubmit}>
              <Input
                label="Email"
                type="email"
                name="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Password"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button className="w-full" disabled={loading} type="submit">
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
