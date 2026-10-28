/**
 * Triada Designs brand identity for outbound messages, invoices, and receipts.
 * Logo sourced from https://triada-designs.com — prefer live URL with local fallback.
 */

export const BRAND = {
  name: "Triada Designs",
  tagline: "Where aesthetics meet spirit",
  siteUrl: "https://triada-designs.com",
  opsEmail: "info@triada-designs.com",
  phones: ["+40 768 407 242", "+49 157 7119 1097"],
  address: {
    lines: ["Strada Horia Creanga 22-24", "Timisoara, 300254", "Romania"],
    singleLine: "Strada Horia Creanga 22-24, Timisoara 300254, Romania",
  },
  /** Live logo from the public marketing site. */
  logoUrlLive:
    "https://triada-designs.com/wp-content/uploads/2025/07/TM_Schriftzug_vulcano.svg",
  /** Bundled ops asset (same official wordmark). */
  logoUrlLocal: "/brand/triada-logo-primary.svg",
  logoUrlLight: "/brand/triada-logo-light.svg",
  colors: {
    ink: "#303031",
    brown: "#9a7958",
    champagne: "#c4a882",
    ivory: "#f7f3ee",
    line: "#e6ddd2",
  },
};

/** Default warm openers — agents should prefer training-doc variants when retrieved. */
export const WARM_GREETINGS = {
  default: "Warm greetings from Triada Designs,",
  first_touch: "Hello, and warm greetings from Triada Designs,",
  follow_up: "Warm greetings again from Triada Designs,",
  thank_you: "Thank you — warm greetings from Triada Designs,",
  after_sale: "Warm greetings, and thank you for choosing Triada Designs,",
  invoice: "Warm greetings from Triada Designs,",
  receipt: "Warm greetings — thank you for your payment,",
};

/**
 * @param {keyof typeof WARM_GREETINGS | string} [kind]
 * @param {{ customerName?: string }} [opts]
 */
export function warmGreeting(kind = "default", opts = {}) {
  const base =
    WARM_GREETINGS[/** @type {keyof typeof WARM_GREETINGS} */ (kind)] ||
    WARM_GREETINGS.default;
  const name = String(opts.customerName || "").trim();
  if (!name) return base;
  // Keep greeting warm without fabricating nicknames.
  return base.replace(/,$/, "") + ` ${name},`;
}

/**
 * Prefer live logo URL; fall back to local public brand asset.
 * @param {{ preferLight?: boolean, preferLocal?: boolean }} [opts]
 */
export function brandLogoUrl(opts = {}) {
  if (opts.preferLocal) {
    return opts.preferLight ? BRAND.logoUrlLight : BRAND.logoUrlLocal;
  }
  return BRAND.logoUrlLive;
}

/** Plain-text address block for WhatsApp / SMS-style footers. */
export function brandAddressPlain() {
  return [
    BRAND.name,
    BRAND.address.singleLine,
    `Email: ${BRAND.opsEmail}`,
    `Tel: ${BRAND.phones.join(" · ")}`,
    BRAND.siteUrl,
  ].join("\n");
}

/** Short one-line footer for Meta template BODY length limits. */
export function brandAddressOneLine() {
  return `${BRAND.name} · ${BRAND.address.singleLine} · ${BRAND.opsEmail} · ${BRAND.siteUrl}`;
}
