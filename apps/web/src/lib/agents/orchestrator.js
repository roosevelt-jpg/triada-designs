/**
 * JS agent orchestration for Next dual-run.
 * Retrieves training docs (RAG-style) into Anthropic system prompts.
 * Hard rule: never fabricate off-brand words — retrieve docs when unsure.
 * Customer replies match inbound language (detect from latest message).
 */

import { completeAnthropic } from "./anthropic-client";
import { getAnthropicStatus } from "@/lib/integrations/anthropic-credentials";
import { retrieveTrainingDocs } from "@/lib/training/training-docs-store";
import { BRAND, warmGreeting, brandAddressPlain } from "@/lib/brand/identity";
import { ensureBrandedOutboundText } from "@/lib/brand/wrap-message";
import { buildAgents } from "@/lib/api/seed-data";
import { findAgent } from "./agent-store";
import { resolveAgent } from "./team-roster";
import { LANGUAGE_MATCHING_HOOK } from "./role-prompts";
import {
  buildLanguageMatchingBlock,
  detectCustomerLanguage,
} from "./detect-language";

/**
 * @param {{
 *   agent_key?: string,
 *   agent?: Record<string, unknown>,
 *   purpose?: string,
 *   message?: string,
 *   dry_run?: boolean,
 *   context?: Record<string, unknown>,
 *   latency_mode?: "fast" | "full",
 *   max_tokens?: number,
 * }} input
 */
export async function runAgentOrchestration(input = {}) {
  const started = Date.now();
  const purpose = String(input.purpose || "draft_reply");
  const message = String(input.message || input.context?.message || "").trim();
  const agentKey = String(input.agent_key || input.agent?.key || "ai_support");
  const fast = input.latency_mode === "fast" || input.context?.latency_mode === "fast";
  const seeded = buildAgents();
  const stored = input.agent ? null : await findAgent(agentKey);
  const agent =
    input.agent ||
    stored ||
    resolveAgent(agentKey, seeded) ||
    seeded[0] ||
    { name: "Triada assistant", config: {} };

  // Prefer explicit customer_message (team reviews wrap drafts in English instructions).
  const languageSource = String(
    input.context?.customer_message ||
      input.context?.message_body ||
      input.context?.body ||
      message ||
      "",
  ).trim();
  const langHint = String(
    input.context?.detected_language ||
      input.context?.preferred_language ||
      input.context?.language ||
      "",
  );
  const detected = detectCustomerLanguage(languageSource, {
    hint: langHint,
    fallback: "en",
  });

  const trainingLimit = fast ? 2 : 4;
  const [training, status] = await Promise.all([
    retrieveTrainingDocs(message || purpose, { limit: trainingLimit }),
    getAnthropicStatus(),
  ]);
  const system = buildSystemPrompt({
    agent,
    purpose,
    training,
    customPrompt: agent?.config?.system_prompt,
    sharedMemory: typeof input.context?.shared_memory === "string" ? input.context.shared_memory : "",
    assignedTasks: typeof input.context?.assigned_tasks === "string" ? input.context.assigned_tasks : "",
    detectedLanguage: detected,
  });
  const userPrompt = [
    `Purpose: ${purpose}`,
    fast ? "Keep the reply short (2–4 short sentences)." : "",
    input.context?.intent ? `Intent hint: ${input.context.intent}` : "",
    `Reply language: ${detected.name} (${detected.code})${detected.rtl ? " [RTL]" : ""}`,
    input.context?.draft ? `Prior draft to review:\n${input.context.draft}` : "",
    `Customer message:\n${message || "(empty)"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const maxTokens =
    typeof input.max_tokens === "number"
      ? input.max_tokens
      : /review/i.test(purpose)
        ? 256
        : fast
          ? 400
          : 1024;

  let completion = await completeAnthropic({
    system,
    prompt: userPrompt,
    temperature: 0.2,
    max_tokens: maxTokens,
    timeout_ms: fast ? 12_000 : 25_000,
  });

  let text = completion.text || "";
  let mode = completion.mode;

  if (!completion.ok || !text) {
    text = localHeuristicReply({
      message,
      purpose,
      training,
      language: detected.code,
    });
    mode = completion.mode === "awaiting_credentials" ? "local_sim" : mode || "local_sim";
    completion = {
      ...completion,
      ok: true,
      text,
      provider: completion.provider || "local_sim",
      mode,
    };
  }

  const branded = ensureBrandedOutboundText(text, {
    greetingKind: purpose.includes("after") ? "after_sale" : "default",
    customerName:
      typeof input.context?.customer_name === "string"
        ? input.context.customer_name
        : undefined,
    language: detected.code,
  });

  return {
    ok: true,
    agent_key: agentKey,
    agent_name: agent?.name || "Triada assistant",
    purpose,
    provider: completion.provider,
    model: completion.model || status.model,
    mode: completion.mode || mode,
    live: completion.mode === "live" && status.has_credentials,
    text: branded.text,
    output: branded.text,
    branded: true,
    logo_url: branded.logo_url,
    detected_language: detected.code,
    detected_language_name: detected.name,
    language_rtl: detected.rtl,
    language_confidence: detected.confidence,
    training_used: training,
    training_ids: training.map((t) => t.id),
    dry_run: Boolean(input.dry_run),
    latency_ms: Date.now() - started,
    rules: {
      no_fabrication: true,
      retrieve_when_unsure: true,
      brand_wrappers: true,
      match_customer_language: true,
    },
  };
}

/**
 * @param {{
 *   agent: Record<string, unknown>,
 *   purpose: string,
 *   training: Array<{ title: string, excerpt: string, category: string }>,
 *   customPrompt?: unknown,
 *   sharedMemory?: string,
 *   assignedTasks?: string,
 *   detectedLanguage?: { code: string, name: string, rtl?: boolean, confidence?: number },
 * }} opts
 */
export function buildSystemPrompt(opts) {
  const name = String(opts.agent?.name || "Triada assistant");
  const role = String(opts.agent?.role || opts.agent?.config?.role || "support");
  const policy = String(opts.customPrompt || "").trim();
  const kb = (opts.training || [])
    .map((k) => `- [${k.category}] ${k.title}: ${k.excerpt}`)
    .join("\n");
  const peers = Array.isArray(opts.agent?.config?.collaborates_with)
    ? opts.agent.config.collaborates_with.join(", ")
    : "";

  const purpose = String(opts.purpose || "");
  const roleFocus = buildRoleFocus(role, purpose);
  const languageBlock = buildLanguageMatchingBlock(
    opts.detectedLanguage || { code: "en", name: "English" },
    LANGUAGE_MATCHING_HOOK,
  );

  return `You are ${name} (${role}) for ${BRAND.name} — jewellery and Salt & Spirit collections.
Purpose: ${purpose}.
You collaborate with the Triada agent team via shared memory/kv${peers ? ` (peers: ${peers})` : ""}.

Hard rules:
- Disclose you are an AI assistant and that a person is available on request.
- NEVER invent prices, stock, delivery promises, custom quotes, discounts, reviews, or off-brand words.
- When unsure of tone, timing, open/close wording, or policy — use the Training Docs below. If still unsure, say you will connect a human or Escalation officer.
- Start customer-facing replies with a warm Triada greeting when appropriate (in the customer's language).
- End threads with Triada contact/address when closing.
- WhatsApp: business messages only to opted-in customers. Broadcasts need human approval.
- Materials: silver with gold plating; 14K and 18K gold on request. Typical make time ~7 days.
- Treat Shared memory as team context other agents already wrote — do not contradict it without escalating.
- Never mention internal tooling or implementation details in customer or dashboard-facing copy.
${languageBlock}
${roleFocus}
Brand contact footer (use when closing):
${brandAddressPlain()}

${policy ? `Agent policy:\n${policy}\n` : ""}
${opts.assignedTasks ? `Assigned tasks:\n${opts.assignedTasks}\n` : ""}
${opts.sharedMemory ? `Shared memory / kv:\n${opts.sharedMemory}\n` : ""}
Training docs (authoritative — retrieve & obey; do not fabricate beyond these):
${kb || "(none loaded — escalate rather than invent)"}
`;
}

/**
 * Extra role focus injected into the shared system envelope.
 * @param {string} role
 * @param {string} purpose
 */
function buildRoleFocus(role, purpose) {
  const r = String(role || "").toLowerCase();
  const p = String(purpose || "").toLowerCase();

  if (
    r === "creative" ||
    r === "marketing" ||
    r === "content" ||
    /creative|ugc|caption|storyboard|content|campaign/i.test(p)
  ) {
    return `
Creative / Marketing conversion focus:
- Optimize for viral, high-converting jewellery creative on Meta, Instagram, TikTok, and WhatsApp.
- Hook in the first line / first second; one desire; soft CTA (Shop / DM / WhatsApp).
- Authentic UGC tone — Gulf-light quiet luxury; no fake urgency, fake reviews, or invented discounts.
- Propose drafts only; human approval before publish. Share briefs in shared memory for QC/Compliance.
- When the draft is customer-facing chat (not a public post brief), match the customer's language.
`;
  }

  if (r === "follow_up" || /follow.?up|abandon|after.?sale/i.test(p)) {
    return `
Follow-up focus:
- One friendly reminder after quiet time; never spam. Confirm opt-in via Compliance notes when unsure.
- Continue Support / Leads shared context. Soft CTA only — no scarcity or invented offers.
- Write the customer-facing reminder in the customer's language.
`;
  }

  if (r.includes("quality") || /quality_review|qc/i.test(p)) {
    return `
Quality Control focus:
- Return PASS / NEEDS FIXES / BLOCK with concrete bullets.
- Flag invented claims, fake scarcity, off-brand tone, and missing disclosures. Write notes to shared memory.
- Flag replies that ignore the customer's language.
`;
  }

  if (r.includes("compliance") || /compliance_review/i.test(p)) {
    return `
Compliance focus:
- ALLOW / HOLD / BLOCK with reason. WhatsApp only to opted-in customers. Broadcasts need human approval.
- Flag customer-facing drafts that ignore the language lock (wrong language vs latest customer message).
`;
  }

  if (r.includes("lead") || r === "sales" || /qualif/i.test(p)) {
    return `
Leads Qualification focus:
- Score only explicit purchase/service signals. Route hot / wholesale / custom to Escalation with a clear owner.
- Customer-facing notes match their language; CRM stage labels may stay English.
`;
  }

  if (r.includes("escalat") || r === "sales_ops" || /escalation/i.test(p)) {
    return `
Escalation focus:
- Summarize ask → verified facts → risks → human owner → next action. Never invent quotes or promises.
- Suggested customer reply outline must be in the customer's language.
`;
  }

  if (r === "support" || /draft_reply|support/i.test(p)) {
    return `
Support focus:
- Answer from Training Docs / catalog only. Hand off unverifiable price, stock, custom, wholesale, or complaint threads.
- Reply in the customer's language with Triada warmth.
- Instagram / Messenger / Facebook / LinkedIn DMs belong to Social Media Manager — hand those over.
`;
  }

  if (
    r.includes("social_media") ||
    r === "smm" ||
    /draft_dm|social.?dm|unanswered.?dm|sweep.?dm/i.test(p)
  ) {
    return `
Social Media Manager focus:
- Reply to this DM now — no inbound Instagram / Messenger / Facebook / LinkedIn message may stay unanswered.
- Keep the reply short and channel-native; match the customer's language; soft CTA only.
- Escalate complaints, custom quotes, and wholesale/B2B; share intent with Leads when clear.
`;
  }

  return "";
}

/**
 * Local heuristic when Anthropic is not keyed — still grounded in training docs.
 * @param {{ message: string, purpose: string, training: Array<{ title: string, excerpt: string }>, language?: string }} opts
 */
function localHeuristicReply(opts) {
  const lang = String(opts.language || "en").toLowerCase().split(/[-_]/)[0];
  const greeting = warmGreeting("default", { language: lang });
  const msg = opts.message.toLowerCase();
  const cores = LOCAL_CORES[lang] || LOCAL_CORES.en;

  let core = cores.default;
  if (/ship|deliver|international|شحن|livrare|lieferung|livraison|доставк|envio|envío|entrega/.test(msg)) {
    core = cores.shipping;
  } else if (/price|cost|how much|سعر|pret|preț|preis|prix|цена|precio|preço|custa|cuesta/.test(msg)) {
    core = cores.price;
  } else if (/care|clean|plate|عناية|îngrijire|pflege|entretien|уход|cuidado|cuidado/.test(msg)) {
    core = cores.care;
  }

  const human = LOCAL_HUMAN[lang] || LOCAL_HUMAN.en;
  return `${greeting}\n\n${core}\n\n${human}`;
}

const LOCAL_CORES = {
  en: {
    default:
      "Thank you for writing. Our Salt & Spirit pieces are silver with gold plating; 14K/18K gold on request. Typical make time is about 7 days. Prices come from the approved catalog only.",
    shipping:
      "Thank you for asking about shipping. We confirm delivery options from approved policy only — a specialist can confirm rates for your destination.",
    price:
      "I’d love to help with pricing from our approved catalog. A specialist can confirm the exact piece and quote — I won’t invent prices.",
    care:
      "Care tip: store dry, wipe gently after wear, and avoid harsh chemicals. Reply if you’d like more care guidance.",
  },
  ar: {
    default:
      "شكراً لرسالتك. قطع Salt & Spirit لدينا من الفضة المطلية بالذهب؛ ذهب عيار 14 و18 عند الطلب. مدة التصنيع عادةً حوالي 7 أيام. الأسعار من الكتالوج المعتمد فقط.",
    shipping:
      "شكراً لسؤالك عن الشحن. نؤكد خيارات التوصيل وفق السياسة المعتمدة فقط — يمكن لأخصائي تأكيد الرسوم لوجهتك.",
    price:
      "يسعدني المساعدة بالأسعار من الكتالوج المعتمد. يمكن لأخصائي تأكيد القطعة والسعر — لن أخترع أسعاراً.",
    care:
      "نصيحة عناية: احفظ القطعة جافة، امسحها برفق بعد الارتداء، وتجنب المواد الكيميائية القاسية. راسلنا إن رغبت بمزيد من الإرشاد.",
  },
  ro: {
    default:
      "Mulțumim pentru mesaj. Piesele Salt & Spirit sunt argint cu placare aur; aur 14K/18K la cerere. Timpul tipic de execuție este ~7 zile. Prețurile vin doar din catalogul aprobat.",
    shipping:
      "Mulțumim pentru întrebarea despre livrare. Confirmăm opțiunile doar din politica aprobată — un specialist poate confirma tarifele pentru destinația dvs.",
    price:
      "Cu plăcere vă ajut cu prețuri din catalogul aprobat. Un specialist confirmă piesa și oferta — nu inventez prețuri.",
    care:
      "Îngrijire: păstrați uscat, ștergeți ușor după purtare și evitați chimicalele dure. Răspundeți dacă doriți mai multe sfaturi.",
  },
  de: {
    default:
      "Danke für Ihre Nachricht. Unsere Salt & Spirit Stücke sind Silber mit Goldplattierung; 14K/18K Gold auf Anfrage. Typische Fertigungszeit ca. 7 Tage. Preise nur aus dem freigegebenen Katalog.",
    shipping:
      "Danke für Ihre Versandfrage. Lieferoptionen bestätigen wir nur laut freigegebener Richtlinie — ein Spezialist kann Tarife für Ihr Ziel bestätigen.",
    price:
      "Gerne helfe ich mit Preisen aus dem freigegebenen Katalog. Ein Spezialist bestätigt Stück und Angebot — ich erfinde keine Preise.",
    care:
      "Pflegetipp: trocken lagern, nach dem Tragen sanft abwischen, aggressive Chemikalien meiden. Antworten Sie gerne für mehr Hinweise.",
  },
  fr: {
    default:
      "Merci pour votre message. Nos pièces Salt & Spirit sont en argent plaqué or ; or 14K/18K sur demande. Délai de fabrication typique ~7 jours. Les prix viennent uniquement du catalogue approuvé.",
    shipping:
      "Merci pour votre question sur la livraison. Nous confirmons les options selon la politique approuvée uniquement — un spécialiste peut confirmer les tarifs pour votre destination.",
    price:
      "Avec plaisir pour les prix du catalogue approuvé. Un spécialiste confirmera la pièce et le devis — je n’invente pas les prix.",
    care:
      "Entretien : conservez au sec, essuyez doucement après port, évitez les produits chimiques agressifs. Répondez pour plus de conseils.",
  },
  ru: {
    default:
      "Спасибо за сообщение. Изделия Salt & Spirit — серебро с золотым покрытием; золото 14K/18K по запросу. Обычно изготовление около 7 дней. Цены только из утверждённого каталога.",
    shipping:
      "Спасибо за вопрос о доставке. Варианты подтверждаем только по утверждённой политике — специалист уточнит тарифы для вашего направления.",
    price:
      "С радостью помогу с ценами из утверждённого каталога. Специалист подтвердит изделие и предложение — я не придумываю цены.",
    care:
      "Уход: храните в сухом месте, мягко протирайте после ношения, избегайте агрессивной химии. Напишите, если нужны дополнительные советы.",
  },
  es: {
    default:
      "Gracias por escribir. Nuestras piezas Salt & Spirit son plata con baño de oro; oro 14K/18K bajo pedido. Tiempo típico de fabricación ~7 días. Los precios solo del catálogo aprobado.",
    shipping:
      "Gracias por preguntar por el envío. Confirmamos opciones solo según la política aprobada — un especialista puede confirmar tarifas para su destino.",
    price:
      "Con gusto ayudo con precios del catálogo aprobado. Un especialista confirmará la pieza y la cotización — no invento precios.",
    care:
      "Cuidado: guarde en seco, limpie suavemente tras el uso y evite químicos agresivos. Responda si desea más orientación.",
  },
  pt: {
    default:
      "Obrigado pela mensagem. As peças Salt & Spirit são prata com banho de ouro; ouro 14K/18K sob pedido. Tempo típico de fabrico ~7 dias. Preços apenas do catálogo aprovado.",
    shipping:
      "Obrigado pela pergunta sobre entrega. Confirmamos opções só pela política aprovada — um especialista pode confirmar tarifas para o seu destino.",
    price:
      "Com prazer ajudo com preços do catálogo aprovado. Um especialista confirma a peça e a cotação — não invento preços.",
    care:
      "Cuidado: guarde seco, limpe suavemente após o uso e evite químicos agressivos. Responda se quiser mais orientações.",
  },
};

const LOCAL_HUMAN = {
  en: "If you’d like a person, just say the word — we’ll share WhatsApp and call options for live support.",
  ar: "إذا رغبت بالتحدث مع شخص، فقط أخبرنا — سنشاركك واتساب ورقم الاتصال للدعم المباشر.",
  ro: "Dacă doriți o persoană, spuneți-ne — vă oferim WhatsApp și numărul de apel pentru suport live.",
  de: "Wenn Sie eine Person möchten, sagen Sie Bescheid — wir teilen WhatsApp- und Anrufnummern für Live-Support.",
  fr: "Si vous souhaitez une personne, dites-le — nous partagerons WhatsApp et un numéro d’appel pour le support live.",
  ru: "Если нужна живая помощь — скажите, мы пришлём WhatsApp и номер для звонка.",
  es: "Si desea hablar con una persona, dígalo — compartiremos WhatsApp y un número de llamada para soporte en vivo.",
  pt: "Se quiser falar com uma pessoa, diga — partilhamos WhatsApp e um número de chamada para suporte ao vivo.",
};
