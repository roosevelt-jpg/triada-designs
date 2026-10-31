"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Round header profile control. Opens a menu with Settings (and settings
 * destinations) plus sign-out — Settings no longer lives in the sidebar.
 *
 * @param {{
 *   user?: {
 *     user?: { name?: string, email?: string, avatar_url?: string | null },
 *     admin_profile?: { display_name?: string, avatar_url?: string | null },
 *     role?: string,
 *     is_admin?: boolean,
 *     permissions?: Record<string, { view?: boolean, manage?: boolean }>,
 *   } | null,
 *   onLogout: () => void | Promise<void>,
 *   canViewSettings?: boolean,
 * }} props
 */
export function ProfileMenu({ user, onLogout, canViewSettings = true }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const name =
    user?.admin_profile?.display_name || user?.user?.name || "Account";
  const email = user?.user?.email || "";
  const role = user?.role || (user?.is_admin ? "admin" : "—");
  const avatarUrl =
    user?.admin_profile?.avatar_url || user?.user?.avatar_url || null;
  const initials = initialsFromName(name);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    await onLogout();
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-white text-[12px] font-semibold tracking-[0.04em] text-ink shadow-sm transition-[background-color,border-color,transform] duration-150",
          "hover:bg-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20",
          open && "border-line-strong bg-stone",
        )}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span aria-hidden>{initials}</span>
        )}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,16.5rem)] overflow-hidden rounded-sm border border-line bg-white shadow-popover fade-rise"
        >
          <div className="border-b border-line px-3.5 py-3">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-line"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-stone text-[11px] font-semibold text-ink"
                  aria-hidden
                >
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight text-ink">
                  {name}
                </p>
                {email ? (
                  <p className="mt-0.5 truncate text-[11px] text-muted">{email}</p>
                ) : null}
                <p className="mt-1 text-[11px] capitalize text-muted">{role}</p>
              </div>
            </div>
          </div>

          <ul className="py-1.5">
            {canViewSettings ? (
              <>
                <li>
                  <Link
                    role="menuitem"
                    href="/settings"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-ink transition-colors duration-150 hover:bg-ivory"
                  >
                    <Settings size={14} className="shrink-0 text-muted" aria-hidden />
                    Settings
                  </Link>
                </li>
                <li>
                  <Link
                    role="menuitem"
                    href="/settings#profile"
                    onClick={() => setOpen(false)}
                    className="block px-3.5 py-2 pl-10 text-[13px] text-ink transition-colors duration-150 hover:bg-ivory"
                  >
                    Profile photo
                  </Link>
                </li>
                <li>
                  <Link
                    role="menuitem"
                    href="/settings#live-support"
                    onClick={() => setOpen(false)}
                    className="block px-3.5 py-2 pl-10 text-[13px] text-ink transition-colors duration-150 hover:bg-ivory"
                  >
                    Live support handoff
                  </Link>
                </li>
                <li>
                  <Link
                    role="menuitem"
                    href="/settings#timezone"
                    onClick={() => setOpen(false)}
                    className="block px-3.5 py-2 pl-10 text-[13px] text-ink transition-colors duration-150 hover:bg-ivory"
                  >
                    Timezone & system time
                  </Link>
                </li>
                <li>
                  <Link
                    role="menuitem"
                    href="/settings#ai-agents"
                    onClick={() => setOpen(false)}
                    className="block px-3.5 py-2 pl-10 text-[13px] text-ink transition-colors duration-150 hover:bg-ivory"
                  >
                    AI agents
                  </Link>
                </li>
                <li>
                  <Link
                    role="menuitem"
                    href="/settings#brand"
                    onClick={() => setOpen(false)}
                    className="block px-3.5 py-2 pl-10 text-[13px] text-ink transition-colors duration-150 hover:bg-ivory"
                  >
                    Brand on outbound
                  </Link>
                </li>
                <li>
                  <Link
                    role="menuitem"
                    href="/settings#emergency"
                    onClick={() => setOpen(false)}
                    className="block px-3.5 py-2 pl-10 text-[13px] text-ink transition-colors duration-150 hover:bg-ivory"
                  >
                    Emergency controls
                  </Link>
                </li>
                <li>
                  <Link
                    role="menuitem"
                    href="/settings#meta"
                    onClick={() => setOpen(false)}
                    className="block px-3.5 py-2 pl-10 text-[13px] text-ink transition-colors duration-150 hover:bg-ivory"
                  >
                    Meta messaging
                  </Link>
                </li>
              </>
            ) : null}
          </ul>

          <div className="border-t border-line py-1.5">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-ink transition-colors duration-150 hover:bg-ivory"
              onClick={handleLogout}
            >
              <LogOut size={14} className="shrink-0 text-muted" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** @param {string} name */
function initialsFromName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}
