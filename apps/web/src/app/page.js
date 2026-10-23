import Link from "next/link";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Button } from "@/components/ui/Button";

const products = [
  {
    name: "Gentle Daily Cleanser",
    detail: "Mild, fragrance-conscious cleansing for sensitive skin.",
    price: "$38",
  },
  {
    name: "Barrier Recovery Cream",
    detail: "Rich evening cream for dryness and comfort.",
    price: "$54",
  },
  {
    name: "Warm Ritual Set",
    detail: "A considered pairing for everyday care.",
    price: "From $86",
  },
];

const values = [
  {
    title: "Verified product facts",
    copy: "Answers draw from approved catalog data—not invented claims.",
  },
  {
    title: "Human control for publishing",
    copy: "Every public social post requires explicit human approval.",
  },
  {
    title: "Personal conversations",
    copy: "AI assists 24/7, then hands off when a person should take over.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <section className="relative isolate min-h-[88vh] overflow-hidden border-b border-line">
          <div
            aria-hidden="true"
            className="soft-pan absolute inset-0 bg-[linear-gradient(125deg,#70563f_0%,#9a7958_28%,#c7ae8a_52%,#e8ded0_78%,#faf8f4_100%)]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_18%_30%,rgba(250,248,244,0.55),transparent_42%),linear-gradient(180deg,rgba(41,38,34,0.18),rgba(41,38,34,0.42))]"
          />

          <div className="page-shell relative flex min-h-[88vh] items-end pb-16 pt-28 md:items-center md:pb-24 md:pt-24">
            <div className="fade-rise max-w-xl text-white">
              <p className="font-display text-5xl leading-[1.05] md:text-6xl lg:text-[4.25rem]">
                Triada Designs
              </p>
              <h1 className="mt-5 max-w-lg font-sans text-xl font-medium leading-snug text-white/95 md:text-2xl">
                Quiet rituals. Considered products. Personal care.
              </h1>
              <p className="mt-4 max-w-md text-base text-white/80">
                Thoughtfully selected products and services through a personal,
                design-led customer experience.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/#collection"
                  className="inline-flex h-12 items-center justify-center rounded-md bg-white px-5 text-base font-medium text-ink transition-colors hover:bg-ivory"
                >
                  Explore the collection
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-white/55 bg-transparent px-5 text-base font-medium text-white transition-colors hover:bg-white/10"
                >
                  Open operations
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="collection" className="page-shell py-20 md:py-24">
          <div className="fade-rise-delay max-w-2xl">
            <h2 className="font-display text-4xl text-ink md:text-5xl">
              Featured collection
            </h2>
            <p className="mt-3 text-muted">
              Real product information only. Availability snapshots are labeled as
              such until Shopify confirms live inventory.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {products.map((product) => (
              <article
                key={product.name}
                className="group overflow-hidden rounded-xl border border-line bg-white shadow-card"
              >
                <div className="aspect-[4/5] bg-[linear-gradient(160deg,#e8ded0,#faf8f4_55%,#c7ae8a)] transition-transform duration-300 group-hover:scale-[1.02]" />
                <div className="space-y-2 p-5">
                  <h3 className="font-display text-2xl">{product.name}</h3>
                  <p className="text-sm text-muted">{product.detail}</p>
                  <p className="text-sm font-medium tabular-nums">{product.price}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="story" className="border-y border-line bg-stone/50">
          <div className="page-shell grid gap-10 py-20 md:grid-cols-2 md:items-center md:py-24">
            <div className="aspect-[5/4] rounded-xl bg-[linear-gradient(145deg,#70563f,#9a7958_40%,#e8ded0)]" />
            <div>
              <h2 className="font-display text-4xl md:text-5xl">
                Design-led, human-centered
              </h2>
              <p className="mt-4 text-muted">
                Triada Designs brings together thoughtfully selected products and
                services. The digital experience should feel calm, tactile, and
                trustworthy—never loud, never fabricated.
              </p>
              <p className="mt-4 text-muted">
                Our operations platform connects inbox, CRM, knowledge, and
                content workflows so teams can respond with clarity and publish
                with care.
              </p>
            </div>
          </div>
        </section>

        <section id="services" className="page-shell py-20 md:py-24">
          <h2 className="font-display text-4xl md:text-5xl">How we help</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {values.map((item) => (
              <div key={item.title} className="border-t border-champagne pt-5">
                <h3 className="font-display text-2xl">{item.title}</h3>
                <p className="mt-3 text-sm text-muted">{item.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="contact" className="border-t border-line bg-[linear-gradient(180deg,#faf8f4,#e8ded0)]">
          <div className="page-shell flex flex-col items-start gap-5 py-20 md:flex-row md:items-end md:justify-between md:py-24">
            <div className="max-w-xl">
              <h2 className="font-display text-4xl md:text-5xl">
                Tell us what you’re looking for
              </h2>
              <p className="mt-3 text-muted">
                We’ll help you find the right option—or connect you with a person
                when that’s better.
              </p>
            </div>
            <Link href="/login">
              <Button size="lg">Start a conversation</Button>
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
