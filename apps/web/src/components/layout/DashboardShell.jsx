"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import { DASHBOARD_NAV } from "@/lib/constants";
import { apiFetch, getStoredToken, setStoredToken } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { WorkspaceClock } from "@/components/layout/WorkspaceClock";
import { syncSystemTime } from "@/lib/system-time";
import {
  areaKeyForPath,
  canAccess,
  filterNavByPermissions,
} from "@/lib/team/permissions";

/**
 * @param {{
 *   children: import("react").ReactNode,
 *   title: string,
 *   description?: string,
 *   actions?: import("react").ReactNode,
 *   contentClassName?: string,
 * }} props
 */
export function DashboardShell({
  children,
  title,
  description,
  actions,
  contentClassName,
}) {
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
      <div className="relative mx-auto flex min-h-screen max-w-[1680px]">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-line bg-[var(--surface-sidebar)] transition-transform duration-200 lg:static lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-[60px] items-center justify-between gap-2 border-b border-line px-4">
            <Link
              href="/overview"
              className="inline-flex min-w-0 items-center gap-2"
              aria-label="Triada Designs overview"
            >
              <BrandLogo variant="primary" className="h-8 w-auto max-w-[148px]" />
            </Link>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-line bg-white text-muted transition-colors duration-150 hover:bg-stone lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
          </div>

          <SidebarNav
            sections={navSections}
            pathname={pathname}
            onNavigate={() => setOpen(false)}
          />
        </aside>

        {open ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-ink/20 lg:hidden"
            aria-label="Close overlay"
            onClick={() => setOpen(false)}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between gap-3 border-b border-line bg-[var(--surface-header)] px-4 md:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-line bg-white transition-colors duration-150 hover:bg-stone lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={18} />
              </button>
              <div className="hidden min-w-0 md:block">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brown-dark">
                  Triada Designs
                </p>
                <p className="truncate text-sm text-muted">Operations</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <WorkspaceClock />
              <NotificationBell />
              <div className="hidden h-8 w-px bg-line sm:block" aria-hidden />
              <ProfileMenu
                user={user}
                onLogout={logout}
                canViewSettings={
                  Boolean(user?.is_admin || user?.role === "admin") ||
                  canAccess(user?.permissions, "settings", "view")
                }
              />
            </div>
          </header>

          <main
            className={cn(
              "flex flex-1 flex-col px-4 py-6 md:px-7 md:py-8",
              contentClassName,
            )}
          >
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 fade-rise">
                <span className="ops-rule-accent mb-3" aria-hidden />
                <h1 className="font-display text-[2rem] leading-[1.12] tracking-[-0.028em] text-ink md:text-[2.4rem]">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-2 max-w-xl text-[0.9375rem] leading-relaxed text-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              {actions ? (
                <div className="ops-actions shrink-0 fade-rise-delay">{actions}</div>
              ) : null}
            </div>
            <div className="ops-divider mb-6" role="presentation" />
            <div className="ops-reveal flex min-h-0 flex-1 flex-col">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
