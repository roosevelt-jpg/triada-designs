/**
 * Triada Designs brand identity for outbound messages, invoices, and receipts.
 * Logo sourced from https://triada-designs.com — prefer live URL with local fallback.
 *
 * Address / ops email / phones below are fallback defaults only. Runtime AI reply
 * footers, Meta channel wraps, and invoice blanks resolve via
 * `brand-contact-settings` (Settings editor + invoice address sync).
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
 * Localized warm openers for customer-language matching.
 * Brand name stays "Triada Designs". Address/footer stay as written.
 */
export const WARM_GREETINGS_BY_LANG = {
  en: WARM_GREETINGS,
  ar: {
    default: "تحيات دافئة من Triada Designs،",
    first_touch: "مرحباً، وتحيات دافئة من Triada Designs،",
    follow_up: "تحيات دافئة مجدداً من Triada Designs،",
    thank_you: "شكراً لك — تحيات دافئة من Triada Designs،",
    after_sale: "تحيات دافئة، وشكراً لاختيارك Triada Designs،",
    invoice: "تحيات دافئة من Triada Designs،",
    receipt: "تحيات دافئة — شكراً لدفعك،",
  },
  ro: {
    default: "Salutări calde de la Triada Designs,",
    first_touch: "Bună ziua, salutări calde de la Triada Designs,",
    follow_up: "Salutări calde din nou de la Triada Designs,",
    thank_you: "Mulțumim — salutări calde de la Triada Designs,",
    after_sale: "Salutări calde și mulțumim că ați ales Triada Designs,",
    invoice: "Salutări calde de la Triada Designs,",
    receipt: "Salutări calde — mulțumim pentru plată,",
  },
  de: {
    default: "Herzliche Grüße von Triada Designs,",
    first_touch: "Hallo und herzliche Grüße von Triada Designs,",
    follow_up: "Nochmals herzliche Grüße von Triada Designs,",
    thank_you: "Danke — herzliche Grüße von Triada Designs,",
    after_sale: "Herzliche Grüße und danke, dass Sie Triada Designs gewählt haben,",
    invoice: "Herzliche Grüße von Triada Designs,",
    receipt: "Herzliche Grüße — danke für Ihre Zahlung,",
  },
  fr: {
    default: "Chaleureuses salutations de Triada Designs,",
    first_touch: "Bonjour, et chaleureuses salutations de Triada Designs,",
    follow_up: "Chaleureuses salutations à nouveau de Triada Designs,",
    thank_you: "Merci — chaleureuses salutations de Triada Designs,",
    after_sale: "Chaleureuses salutations, et merci d'avoir choisi Triada Designs,",
    invoice: "Chaleureuses salutations de Triada Designs,",
    receipt: "Chaleureuses salutations — merci pour votre paiement,",
  },
  ru: {
    default: "Тёплые приветствия от Triada Designs,",
    first_touch: "Здравствуйте, тёплые приветствия от Triada Designs,",
    follow_up: "Снова тёплые приветствия от Triada Designs,",
    thank_you: "Спасибо — тёплые приветствия от Triada Designs,",
    after_sale: "Тёплые приветствия и спасибо, что выбрали Triada Designs,",
    invoice: "Тёплые приветствия от Triada Designs,",
    receipt: "Тёплые приветствия — спасибо за оплату,",
  },
  es: {
    default: "Saludos cordiales de Triada Designs,",
    first_touch: "Hola, y saludos cordiales de Triada Designs,",
    follow_up: "Saludos cordiales de nuevo de Triada Designs,",
    thank_you: "Gracias — saludos cordiales de Triada Designs,",
    after_sale: "Saludos cordiales, y gracias por elegir Triada Designs,",
    invoice: "Saludos cordiales de Triada Designs,",
    receipt: "Saludos cordiales — gracias por su pago,",
  },
  pt: {
    default: "Saudações calorosas da Triada Designs,",
    first_touch: "Olá, e saudações calorosas da Triada Designs,",
    follow_up: "Saudações calorosas novamente da Triada Designs,",
    thank_you: "Obrigado — saudações calorosas da Triada Designs,",
    after_sale: "Saudações calorosas, e obrigado por escolher a Triada Designs,",
    invoice: "Saudações calorosas da Triada Designs,",
    receipt: "Saudações calorosas — obrigado pelo pagamento,",
  },
};

/**
 * @param {keyof typeof WARM_GREETINGS | string} [kind]
 * @param {{ customerName?: string, language?: string }} [opts]
 */
export function warmGreeting(kind = "default", opts = {}) {
  const lang = String(opts.language || "en")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  const table =
    WARM_GREETINGS_BY_LANG[/** @type {keyof typeof WARM_GREETINGS_BY_LANG} */ (lang)] ||
    WARM_GREETINGS;
  const base =
    table[/** @type {keyof typeof WARM_GREETINGS} */ (kind)] ||
    table.default ||
    WARM_GREETINGS.default;
  const name = String(opts.customerName || "").trim();
  if (!name) return base;
  // Keep greeting warm without fabricating nicknames.
  return base.replace(/[,،]$/, "") + ` ${name},`;
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

/**
 * Fallback plain-text address block (BRAND constants only).
 * Prefer `brandContactPlain` / warmed Settings contact for outbound AI footers.
 */
export function brandAddressPlain() {
  return [
    BRAND.name,
    BRAND.address.singleLine,
    `Email: ${BRAND.opsEmail}`,
    `Tel: ${BRAND.phones.join(" · ")}`,
    BRAND.siteUrl,
  ].join("\n");
}

/**
 * Fallback one-line footer (BRAND constants only).
 * Prefer `brandContactOneLine` for Meta template / AI footers.
 */
export function brandAddressOneLine() {
  return `${BRAND.name} · ${BRAND.address.singleLine} · ${BRAND.opsEmail} · ${BRAND.siteUrl}`;
}
