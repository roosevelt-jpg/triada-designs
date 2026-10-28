"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Menu, Search, LogOut, X } from "lucide-react";
import { DASHBOARD_NAV } from "@/lib/constants";
import { apiFetch, getStoredToken, setStoredToken } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { WorkspaceClock } from "@/components/layout/WorkspaceClock";
import { syncSystemTime } from "@/lib/system-time";
import {
  areaKeyForPath,
  canAccess,
  filterNavByPermissions,
} from "@/lib/team/permissions";

/** @param {{ children: import("react").ReactNode, title: string, description?: string, actions?: import("react").ReactNode }} props */
export function DashboardShell({ children, title, description, actions }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    apiFetch("/v1/auth/me")
      .then((data) => {
        setUser(data);
        syncSystemTime().catch(() => {});
      })
      .catch(() => {
        setStoredToken(null);
        router.replace("/login");
      });
  }, [router]);

  const navSections = useMemo(
    () =>
      filterNavByPermissions(DASHBOARD_NAV, user?.permissions, {
        isAdmin: Boolean(user?.is_admin || user?.role === "admin"),
      }),
    [user],
  );

  useEffect(() => {
    if (!user) return;
    if (user.is_admin || user.role === "admin") return;
    const area = areaKeyForPath(pathname);
    if (!area) return;
    if (!canAccess(user.permissions, area, "view")) {
      const fallback =
        navSections[0]?.items?.[0]?.href || "/overview";
      if (pathname !== fallback) router.replace(fallback);
    }
  }, [user, pathname, navSections, router]);

  async function logout() {
    try {
      await apiFetch("/v1/auth/logout", { method: "POST" });
    } catch {
      // ignore network errors on logout
    }
    setStoredToken(null);
    router.replace("/login");
  }

  return (
    <div className="ops-atmosphere relative min-h-screen text-ink">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-70 soft-pan"
        aria-hidden
      >
        <div className="ops-atmosphere-glow" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1680px]">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line/80 bg-white/92 backdrop-blur-md transition-transform duration-200 lg:static lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-[68px] items-center justify-between gap-2 border-b border-line px-4">
            <Link
              href="/overview"
              className="inline-flex min-w-0 items-center gap-2"
              aria-label="Triada Designs overview"
            >
              <BrandLogo variant="primary" className="h-8 w-auto max-w-[148px]" />
            </Link>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-muted transition-colors duration-150 hover:bg-stone lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Dashboard">
            {navSections.map((section) => (
              <div key={section.label}>
                <p className="nav-category-band">{section.label}</p>
                <ul className="mt-1.5 space-y-0.5">
                  {section.items.map((item) => {
                    const active =
                      pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "block rounded-md px-2.5 py-2 text-[13.5px] transition-colors duration-150",
                            active
                              ? "bg-sand font-medium text-brown-dark shadow-[inset_0_0_0_1px_rgba(154,121,88,0.18)]"
                              : "font-normal text-ink/80 hover:bg-ivory hover:text-ink"
                          )}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="border-t border-line px-4 py-3">
            <p className="truncate text-sm font-medium text-ink">
              {user?.user?.name || "…"}
            </p>
            <p className="truncate text-xs capitalize text-muted">{user?.role || "—"}</p>
          </div>
        </aside>

        {open ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-ink/25 lg:hidden"
            aria-label="Close overlay"
            onClick={() => setOpen(false)}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-3 border-b border-line/80 bg-ivory/85 px-4 backdrop-blur-md md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-white transition-colors duration-150 hover:bg-stone lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={18} />
              </button>
              <div className="hidden min-w-[220px] max-w-md flex-1 items-center gap-2 rounded-md border border-line bg-white/90 px-3 py-2 text-sm text-muted md:flex">
                <Search size={15} className="shrink-0 text-champagne" aria-hidden />
                <span className="truncate">Search contacts, conversations, content</span>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <WorkspaceClock />
              <NotificationBell />
              <div className="hidden text-right md:block">
                <p className="text-sm font-medium leading-tight">
                  {user?.user?.name || "Loading…"}
                </p>
                <p className="text-xs capitalize text-muted">{user?.role || "—"}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={logout} aria-label="Sign out">
                <LogOut size={16} />
              </Button>
            </div>
          </header>

          <main className="flex-1 px-4 py-5 md:px-6 md:py-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 fade-rise">
                <div className="mb-2 h-px w-16 bg-gradient-to-r from-champagne via-brown to-transparent animate-pulse-soft" />
                <h1 className="font-display text-[1.85rem] leading-tight tracking-[-0.02em] text-ink md:text-[2.15rem]">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              {actions ? <div className="shrink-0 fade-rise-delay">{actions}</div> : null}
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
