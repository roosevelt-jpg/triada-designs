import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-stone/60">
      <div className="page-shell grid gap-8 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="font-display text-3xl text-ink">Triada Designs</p>
          <p className="mt-3 max-w-md text-sm text-muted">
            Thoughtfully selected products and services through a personal,
            design-led customer experience.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-ink">Explore</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>
              <Link href="/#collection">Collection</Link>
            </li>
            <li>
              <Link href="/#services">Services</Link>
            </li>
            <li>
              <Link href="/login">Operations platform</Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium text-ink">Policies</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>Shipping and delivery</li>
            <li>Returns and refunds</li>
            <li>Privacy</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line/80">
        <div className="page-shell flex flex-col gap-2 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Triada Designs</p>
          <p>Human approval required before every public social post.</p>
        </div>
      </div>
    </footer>
  );
}
