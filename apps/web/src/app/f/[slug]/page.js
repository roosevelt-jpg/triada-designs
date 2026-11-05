"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { PUBLIC_SITE_URL } from "@/lib/constants";

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  whatsapp: "",
  address: "",
  product: "",
  collection_wants: "",
};

/**
 * Public branded waitlist / product-interest form.
 * Short URL: /f/[slug]
 */
export default function PublicWaitlistFormPage() {
  const params = useParams();
  const slug = String(params?.slug || "").trim();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formMeta, setFormMeta] = useState(null);
  const [brand, setBrand] = useState(null);
  const [fields, setFields] = useState(EMPTY);
  const [done, setDone] = useState(null);

  const load = useCallback(async () => {
    if (!slug) {
      setError("This form is unavailable.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/public/waitlist/${encodeURIComponent(slug)}`, {
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "This form is unavailable.");
      }
      setFormMeta(data.form || null);
      setBrand(data.brand || null);
      setFields((prev) => ({
        ...prev,
        product: data.form?.product_label || "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load form.");
      setFormMeta(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  function updateField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/public/waitlist/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: fields.name.trim(),
          email: fields.email.trim(),
          phone: fields.phone.trim(),
          whatsapp: fields.whatsapp.trim() || fields.phone.trim(),
          address: fields.address.trim(),
          product: fields.product.trim(),
          product_target: fields.product.trim(),
          collection_wants: fields.collection_wants.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Unable to save your interest.");
      }
      setDone({
        warm_greeting: data.warm_greeting || brand?.warm_greeting,
        success_message: data.success_message || formMeta?.success_message,
        brand: data.brand || brand,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save your interest.");
    } finally {
      setSubmitting(false);
    }
  }

  const addressLine =
    brand?.address_line ||
    "Strada Horia Creanga 22-24, Timisoara 300254, Romania";
  const opsEmail = brand?.ops_email || "info@triada-designs.com";
  const phones = brand?.phones || "";
  const siteUrl = brand?.site_url || PUBLIC_SITE_URL;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#f3eee6]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_10%_-10%,rgba(196,168,130,0.35),transparent_55%),radial-gradient(ellipse_60%_40%_at_100%_20%,rgba(154,121,88,0.12),transparent_50%),linear-gradient(165deg,#f7f3ee_0%,#efe6da_48%,#f3eee6_100%)]"
        aria-hidden
      />
      <div className="relative z-[1] mx-auto flex min-h-screen w-full max-w-lg flex-col px-5 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 flex flex-col items-start gap-4 sm:mb-10">
          <a
            href={siteUrl}
            className="inline-flex transition-opacity hover:opacity-80"
            aria-label="Triada Designs"
          >
            <BrandLogo className="h-9 sm:h-10" />
          </a>
          {!loading && formMeta ? (
            <div className="space-y-2">
              <span className="ops-rule-accent" aria-hidden />
              <h1 className="font-display text-[1.85rem] leading-[1.15] tracking-[-0.03em] text-ink sm:text-[2.15rem]">
                {formMeta.title}
              </h1>
              {formMeta.description ? (
                <p className="max-w-md text-[15px] leading-relaxed text-muted">
                  {formMeta.description}
                </p>
              ) : (
                <p className="max-w-md text-[15px] leading-relaxed text-muted">
                  Share your details and we will keep you close to this piece.
                </p>
              )}
            </div>
          ) : null}
        </header>

        <main className="flex-1">
          {loading ? (
            <div className="space-y-4" aria-busy="true" aria-label="Loading form">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-11 w-40" />
            </div>
          ) : null}

          {!loading && error && !formMeta ? (
            <ErrorState
              title="Form unavailable"
              message={error}
              onRetry={load}
            />
          ) : null}

          {!loading && formMeta && done ? (
            <div className="space-y-5">
              <span className="ops-rule-accent" aria-hidden />
              <p className="font-display text-[1.65rem] leading-snug tracking-[-0.02em] text-ink">
                {done.warm_greeting || "Thank you — warm greetings from Triada Designs,"}
              </p>
              <p className="text-[15px] leading-relaxed text-ink/85">
                {done.success_message ||
                  "We have your interest and will be in touch soon."}
              </p>
              <p className="text-sm text-muted">
                With care,
                <br />
                Triada Designs
              </p>
            </div>
          ) : null}

          {!loading && formMeta && !done ? (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {error ? (
                <div
                  className="rounded-sm border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger"
                  role="alert"
                >
                  {error}
                </div>
              ) : null}

              <Input
                label="Name"
                name="name"
                autoComplete="name"
                required
                value={fields.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Your full name"
              />
              <Input
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={fields.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="you@email.com"
              />
              <Input
                label="Phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                value={fields.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="+971 50 000 0000"
                hint="International format preferred."
              />
              <Input
                label="WhatsApp number"
                name="whatsapp"
                type="tel"
                autoComplete="tel"
                value={fields.whatsapp}
                onChange={(e) => updateField("whatsapp", e.target.value)}
                placeholder="Same as phone if preferred"
                hint="Leave blank to use your phone for WhatsApp."
              />
              <Input
                label="Address"
                name="address"
                autoComplete="street-address"
                value={fields.address}
                onChange={(e) => updateField("address", e.target.value)}
                placeholder="City, country"
              />
              <Input
                label="Product / waitlist"
                name="product"
                required
                value={fields.product}
                onChange={(e) => updateField("product", e.target.value)}
                placeholder={formMeta.product_label || "Piece or collection"}
              />

              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium text-ink">
                  What are you looking for?
                </span>
                <textarea
                  name="collection_wants"
                  rows={4}
                  className="ops-field min-h-[110px] w-full px-3 py-2.5"
                  value={fields.collection_wants}
                  onChange={(e) => updateField("collection_wants", e.target.value)}
                  placeholder="Tell us the piece, size, metal, or feeling you want from this collection."
                  maxLength={2000}
                />
                <span className="block text-sm text-muted">
                  Optional — helps us match you to the right piece.
                </span>
              </label>

              {formMeta.product_link ? (
                <p className="text-sm text-muted">
                  <a
                    href={formMeta.product_link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brown underline-offset-2 hover:underline"
                  >
                    View the piece
                  </a>
                </p>
              ) : null}

              <div className="pt-2">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full sm:w-auto"
                  disabled={submitting}
                >
                  {submitting ? "Sending…" : "Join the waitlist"}
                </Button>
              </div>
            </form>
          ) : null}
        </main>

        <footer className="mt-12 border-t border-line pt-6 text-[12px] leading-relaxed text-muted">
          <p className="font-medium text-ink/80">Triada Designs</p>
          <p>{addressLine}</p>
          <p>
            {opsEmail}
            {phones ? ` · ${phones}` : ""}
          </p>
          <p>
            <a
              href={siteUrl}
              className="text-brown underline-offset-2 hover:underline"
            >
              {String(siteUrl).replace(/^https?:\/\//, "")}
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
