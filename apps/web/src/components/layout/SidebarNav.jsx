"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const STORAGE_KEY = "triada.sidebar.openSections";

/**
 * @param {string} pathname
 * @param {{ href: string }[]} items
 */
function sectionContainsPath(pathname, items) {
  return items.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

/**
 * Prefer the most specific href match so nested routes (e.g. /orders/invoices)
 * do not light up the parent item as well.
 * @param {string} pathname
 * @param {{ href: string }[]} items
 */
function activeHrefForPath(pathname, items) {
  let best = null;
  for (const item of items) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.length) best = item.href;
    }
  }
  return best;
}

/**
 * @param {{
 *   sections: Array<{ id?: string, label: string, items: Array<{ href: string, label: string }> }>,
 *   pathname: string,
 *   onNavigate?: () => void,
 * }} props
 */
export function SidebarNav({ sections, pathname, onNavigate }) {
  const sectionIds = useMemo(
    () => sections.map((section) => section.id || section.label),
    [sections],
  );

  const activeSectionId = useMemo(() => {
    for (const section of sections) {
      if (sectionContainsPath(pathname, section.items)) {
        return section.id || section.label;
      }
    }
    return null;
  }, [sections, pathname]);

  const [openIds, setOpenIds] = useState(() => {
    const seed = new Set();
    if (activeSectionId) seed.add(activeSectionId);
    else if (sectionIds[0]) seed.add(sectionIds[0]);
    return seed;
  });

  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (typeof window === "undefined") return;

    let stored = [];
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      stored = [];
    }

    const next = new Set(
      Array.isArray(stored)
        ? stored.filter((id) => sectionIds.includes(id))
        : [],
    );
    if (activeSectionId) next.add(activeSectionId);
    if (next.size === 0 && sectionIds[0]) next.add(sectionIds[0]);
    setOpenIds(next);
  }, [sectionIds, activeSectionId]);

  useEffect(() => {
    setOpenIds((prev) => {
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (sectionIds.includes(id)) next.add(id);
        else changed = true;
      }
      if (activeSectionId && !next.has(activeSectionId)) {
        next.add(activeSectionId);
        changed = true;
      }
      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [pathname, activeSectionId, sectionIds]);

  useEffect(() => {
    if (!hydrated.current || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.from(openIds)),
      );
    } catch {
      // ignore quota / private mode
    }
  }, [openIds]);

  function toggleSection(id) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3" aria-label="Dashboard">
      {sections.map((section) => {
        const id = section.id || section.label;
        const open = openIds.has(id);
        const panelId = `nav-section-${id}`;
        const activeHref = activeHrefForPath(pathname, section.items);
        const sectionActive = Boolean(activeHref);

        return (
          <div key={id} className="nav-section">
            <button
              type="button"
              className={cn(
                "nav-section-toggle",
                sectionActive && !open && "nav-section-toggle--active",
              )}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => toggleSection(id)}
            >
              <span>{section.label}</span>
              <ChevronDown
                size={14}
                className={cn(
                  "shrink-0 text-muted transition-transform duration-150",
                  open ? "rotate-0" : "-rotate-90",
                )}
                aria-hidden
              />
            </button>
            <ul id={panelId} className="nav-section-items" hidden={!open}>
              {section.items.map((item) => {
                const active = activeHref === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "nav-link block rounded-sm border-l-2 px-2.5 py-[7px] text-[13px] leading-snug transition-[background-color,color,border-color,box-shadow] duration-150",
                        active ? "nav-link--active" : "nav-link--idle",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
