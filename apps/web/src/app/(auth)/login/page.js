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
      <div className="flex h-full min-h-[280px] items-end bg-[linear-gradient(145deg,#3a2f26,#9a7958_55%,#c7ae8a)] p-8">
        <p className="font-display text-2xl text-white/90">Triada Designs</p>
      </div>
    ),
  }
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
    <div className="relative min-h-screen overflow-hidden bg-ivory">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(199,174,138,0.28),transparent_50%),radial-gradient(ellipse_at_10%_80%,rgba(154,121,88,0.12),transparent_45%),linear-gradient(165deg,#faf8f4_0%,#efe6d8_55%,#e8ded0_100%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23292622' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid overflow-hidden rounded-xl border border-line bg-white/90 shadow-popover backdrop-blur-sm md:min-h-[620px] md:grid-cols-[1.15fr_0.85fr]">
          <aside className="relative min-h-[240px] overflow-hidden bg-[#2a2218] md:min-h-full">
            <JewelleryOrbit className="absolute inset-0" />
            <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 bg-gradient-to-b from-[#2a2218]/85 via-[#2a2218]/35 to-transparent px-6 pb-16 pt-6 md:px-8 md:pt-8">
              <BrandLogo
                variant="light"
                className="h-11 w-auto max-w-[min(280px,70vw)] md:h-14"
              />
              <p className="mt-3 max-w-sm font-display text-xl leading-snug text-white/90 md:text-2xl">
                Where aesthetics meet spirit
              </p>
            </div>
          </aside>

          <div className="flex flex-col justify-center p-7 sm:p-9 md:p-10">
            <div className="md:hidden">
              <BrandLogo variant="primary" className="h-9 w-auto max-w-[200px]" />
            </div>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted md:mt-0">
              Admin · Operations
            </p>
            <h1 className="mt-2 font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">
              Sign in
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
              Jewellery sales and marketing operations for Triada Designs.
              Staff access only — the public site stays on{" "}
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

            <p className="mt-8 text-xs text-muted">
              Unified inbox, jewellery automations, content approvals, and
              channel integrations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
