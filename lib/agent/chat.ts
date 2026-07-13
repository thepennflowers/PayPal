import { paypal } from "@/lib/paypal";
import { floristTools } from "./tools";

const BASE_PROMPT = `You are the AI florist for The Penn Flowers, a small floristry business.

Keep replies short — a couple of sentences, warm but to the point. This shop
sells catalog products only, exactly as listed below.

Rules:
- The catalog below is complete and current — never call a tool to look up
  products or prices, and never invent items that aren't listed.
- No customizations: no substitutions, add-ons, vases, sizes, color choices,
  card messages, or delivery/pickup scheduling. If asked, say arrangements
  come as shown and logistics are arranged after payment.
- Never ask for personal details (name, phone, email, address) — PayPal
  collects everything needed during payment.
- Recommend at most 1-2 products with prices (USD), then ask a single
  question: whether to place the order.
- The moment the customer agrees on a product, call create_order (quantity 1
  unless they said otherwise) using the exact catalog name and price. The
  chat UI automatically shows the order summary with a "Pay with PayPal"
  button — so just confirm the order was created and point them to the
  button below. Never paste checkout/approval URLs into your reply.
- Payment is detected automatically after they approve. If a customer says
  they've paid but the chat hasn't confirmed it, call capture_order.
- Orders expire 10 minutes after creation. If one expires unpaid, offer to
  create a fresh order for the same items.
- Subscriptions can't be started from this chat yet — describe them and
  suggest one-time orders in the meantime.
- Never invent order/invoice IDs — only use what the tools return, and quote
  IDs character-for-character in backticks, e.g. \`MOCK-ORDER-1000\` (never
  add spaces or reformat them).`;

// The catalog is tiny, so it's embedded straight into the system prompt —
// this saves the model a list_products round-trip on almost every turn.
// Cached briefly so live mode doesn't hit PayPal on every message.
let catalogCache: { text: string; expiresAt: number } | null = null;

async function catalogSection(): Promise<string> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) {
    return catalogCache.text;
  }
  const [products, plans] = await Promise.all([
    paypal.listProducts(),
    paypal.listSubscriptionPlans(),
  ]);
  const text = [
    "Catalog:",
    ...products.map(
      (p) => `- ${p.name} — $${p.price.value} USD. ${p.description ?? ""}`
    ),
    "",
    "Subscription plans (recurring delivery):",
    ...plans.map(
      (pl) =>
        `- ${pl.name} — $${pl.price.value} USD per ${pl.billing_cycle.toLowerCase()}. ${pl.description ?? ""}`
    ),
  ].join("\n");
  catalogCache = { text, expiresAt: Date.now() + 60_000 };
  return text;
}

export async function buildSystemPrompt(): Promise<string> {
  return `${BASE_PROMPT}\n\n${await catalogSection()}`;
}

// USE_MOCK_DATA=true (default): floristTools call the in-memory mock catalog
// and mock orders/invoices — no PayPal credentials needed, safe for local dev.
//
// USE_MOCK_DATA=false + PAYPAL_USE_OFFICIAL_TOOLKIT=true: swap in PayPal's
// officially maintained tool surface (disputes, shipment tracking,
// subscriptions, reporting, etc. — see docs.paypal.ai/developer/tools/ai/agent-tools-ref)
// instead of the thin custom layer in lib/agent/tools.ts.
export async function getChatTools() {
  const useMock = process.env.USE_MOCK_DATA !== "false";
  const useOfficialToolkit = process.env.PAYPAL_USE_OFFICIAL_TOOLKIT === "true";

  if (!useMock && useOfficialToolkit) {
    const { PayPalAgentToolkit } = await import("@paypal/agent-toolkit/ai-sdk");
    const toolkit = new PayPalAgentToolkit({
      clientId: process.env.PAYPAL_CLIENT_ID!,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
      configuration: {
        actions: {
          orders: { create: true, get: true, capture: true },
          invoices: { create: true, list: true, send: true, sendReminder: true, cancel: true, generateQRC: true },
          products: { create: true, list: true, update: true },
          subscriptionPlans: { create: true, list: true, show: true },
          shipment: { create: true, show: true, cancel: true },
          disputes: { list: true, get: true },
        },
        context: { sandbox: process.env.PAYPAL_ENVIRONMENT !== "PRODUCTION" },
      },
    });
    return toolkit.getTools();
  }

  // Catalog lives in the system prompt, so the chat only needs the tools
  // that *act*: fewer tools = smaller prompts and fewer agent-loop steps.
  const { create_order, capture_order, get_order, create_invoice } =
    floristTools;
  return { create_order, capture_order, get_order, create_invoice };
}
