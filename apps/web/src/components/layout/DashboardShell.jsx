"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Search, Bell, LogOut } from "lucide-react";
import { DASHBOARD_NAV } from "@/lib/constants";
import { apiFetch, getStoredToken, setStoredToken } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

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
      .then((data) => setUser(data))
      .catch(() => {
        setStoredToken(null);
        router.replace("/login");
      });
  }, [router]);

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
    <div className="min-h-screen bg-ivory text-ink">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-[256px] border-r border-line bg-[color-mix(in_srgb,var(--color-brand-ivory)_70%,white)] p-4 transition-transform duration-200 lg:static lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="mb-8 flex items-center justify-between px-2">
            <Link href="/overview" className="font-display text-2xl tracking-tight">
              Triada
            </Link>
            <button
              type="button"
              className="rounded-md border border-line bg-white p-2 lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              ✕
            </button>
          </div>

          <nav className="space-y-6 overflow-y-auto pb-10" aria-label="Dashboard">
            {DASHBOARD_NAV.map((section) => (
              <div key={section.label}>
                <p className="px-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                  {section.label}
                </p>
                <ul className="mt-2 space-y-1">
                  {section.items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "block rounded-md px-3 py-2 text-sm transition-colors duration-150",
                            active
                              ? "bg-sand text-brown-dark"
                              : "text-muted hover:bg-stone hover:text-ink"
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
          <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-3 border-b border-line bg-ivory/90 px-4 backdrop-blur md:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-white lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={18} />
              </button>
              <div className="hidden items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm text-muted md:flex">
                <Search size={16} />
                <span>Search contacts, conversations, content</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-white"
                aria-label="Notifications"
              >
                <Bell size={16} />
              </button>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium">{user?.user?.name || "Loading…"}</p>
                <p className="text-xs text-muted">{user?.role || "—"}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={logout} aria-label="Sign out">
                <LogOut size={16} />
              </Button>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 md:px-6">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="font-display text-3xl md:text-4xl">{title}</h1>
                {description ? (
                  <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
                ) : null}
              </div>
              {actions}
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
