"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PUBLIC_SITE_URL } from "@/lib/constants";
import { apiFetch, getStoredToken, setStoredToken } from "@/lib/api-client";

const JewelleryOrbit = dynamic(
  () =>
    import("@/components/brand/JewelleryOrbit").then((m) => m.JewelleryOrbit),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[280px] items-end bg-[linear-gradient(155deg,#1c1916,#5e4a35_48%,#c7ae8a)] p-8">
        <p className="font-display text-2xl text-white/90">Triada Designs</p>
      </div>
    ),
  }
);

const LogoBubbles = dynamic(
  () =>
    import("@/components/brand/LogoBubbles").then((m) => m.LogoBubbles),
  { ssr: false }
);

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
    <div className="auth-stage relative min-h-screen overflow-hidden">
      <LogoBubbles className="z-[1] opacity-70" />

      <div className="relative z-[2] mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="auth-panel grid overflow-hidden md:min-h-[600px] md:grid-cols-[1.1fr_0.9fr]">
          <aside className="relative min-h-[220px] overflow-hidden bg-[#1c1916] md:min-h-full">
            <JewelleryOrbit className="absolute inset-0" />
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-[#1c1916]/90 via-[#1c1916]/40 to-transparent px-6 pb-20 pt-7 md:px-9 md:pt-9">
              <BrandLogo
                variant="light"
                className="h-12 w-auto max-w-[min(300px,72vw)] md:h-14 fade-rise"
              />
              <p className="mt-4 max-w-sm font-display text-[1.65rem] leading-snug tracking-[-0.02em] text-white/92 md:text-[1.85rem] fade-rise-delay">
                Where aesthetics meet spirit
              </p>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/55">
                Jewellery sales and marketing operations — staff access only.
              </p>
            </div>
          </aside>

          <div className="flex flex-col justify-center bg-white p-7 sm:p-9 md:p-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brown-dark">
              Admin · Operations
            </p>
            <h1 className="mt-2 font-display text-3xl font-medium tracking-[-0.025em] text-ink sm:text-[2.35rem]">
              Sign in
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
              Continue to the Triada Designs atelier workspace. Public browsing
              stays on{" "}
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
              {error ? (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              <Button className="w-full" disabled={loading} type="submit">
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <p className="mt-8 text-xs leading-relaxed text-muted">
              Unified inbox, content approvals, jewellery automations, and
              channel status.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
