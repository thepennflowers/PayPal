import type {
  Invoice,
  Order,
  OrderItem,
  PayPalService,
  Product,
  SubscriptionPlan,
} from "./types";
import { MOCK_PRODUCTS, MOCK_SUBSCRIPTION_PLANS } from "../catalog";

// Live PayPal REST client (Catalog Products, Subscription Plans, Orders v2,
// Invoicing v2). Uses OAuth2 client-credentials, per:
// https://docs.paypal.ai/developer/how-to/api/get-started
//
// This is intentionally a thin wrapper — for a fuller agent-facing tool
// surface (disputes, shipment tracking, reporting, etc.) prefer
// @paypal/agent-toolkit, wired up in lib/agent/chat.ts, which PayPal
// maintains directly. This client exists for the paths agent-toolkit
// doesn't cover yet: the declarative "IaC" apply script (scripts/paypal-apply.ts)
// and any server-side rendering that needs product/order data without
// going through the chat model.

const PAYPAL_ENVIRONMENT = process.env.PAYPAL_ENVIRONMENT ?? "SANDBOX";
const BASE_URL =
  PAYPAL_ENVIRONMENT === "PRODUCTION"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

let cachedToken: { value: string; expiresAt: number } | null = null;
// Dedupes concurrent callers onto a single in-flight request — without this,
// two requests racing while cachedToken is null (e.g. React Strict Mode's
// double-invoke of Server Components in dev) each mint their own token, and
// PayPal's sandbox OAuth cache can 401 a resource call made on the
// not-yet-propagated one with "Access Token not found in cache".
let pendingToken: Promise<string> | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }
  if (pendingToken) {
    return pendingToken;
  }

  pendingToken = (async () => {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are required when USE_MOCK_DATA=false"
      );
    }

    const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
      // Next.js's Data Cache caches fetch() by default (persisted to
      // .next/cache across dev restarts) unless told not to — without this,
      // the app replays a stale access_token from disk forever instead of
      // getting a fresh one, and PayPal 401s it as unrecognized.
      cache: "no-store",
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch PayPal access token: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    cachedToken = {
      value: data.access_token,
      // refresh a little early
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return cachedToken.value;
  })();

  try {
    return await pendingToken;
  } finally {
    pendingToken = null;
  }
}

async function paypalFetch(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    // Next.js caches GET fetches in server components by default — never
    // serve stale catalog/order data from that cache.
    cache: "no-store",
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw new Error(`PayPal API error on ${path}: ${res.status} ${await res.text()}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

function toProduct(raw: any): Product {
  // PayPal's Catalog Products API doesn't store prices — the price lives
  // in our own catalog (lib/catalog.ts, mirrored in paypal-resources/).
  // Match by name since PayPal assigns its own product IDs.
  const local = MOCK_PRODUCTS.find((p) => p.name === raw.name);
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? local?.description,
    type: raw.type,
    // Prefer the local category ("bouquet"/"sympathy") — PayPal only
    // stores its own enum value (FLOWERS), which the UI doesn't use.
    category: local?.category ?? raw.category,
    image_url: raw.image_url ?? local?.image_url,
    price: local?.price ?? raw.price ?? { currency_code: "USD", value: "0.00" },
  };
}

function toPlan(raw: any): SubscriptionPlan {
  // The plans *list* response omits billing_cycles (only the single-plan
  // GET includes them) — fall back to our local catalog, matched by name.
  const cycle = raw.billing_cycles?.find(
    (c: any) => c.tenure_type === "REGULAR"
  );
  const local = MOCK_SUBSCRIPTION_PLANS.find((p) => p.name === raw.name);
  return {
    id: raw.id,
    product_id: raw.product_id,
    name: raw.name,
    description: raw.description ?? local?.description,
    status: raw.status,
    billing_cycle:
      cycle?.frequency?.interval_unit ?? local?.billing_cycle ?? "MONTH",
    price:
      cycle?.pricing_scheme?.fixed_price ??
      local?.price ?? { currency_code: "USD", value: "0.00" },
  };
}

export const livePayPalService: PayPalService = {
  async listProducts() {
    const data = await paypalFetch("/v1/catalogs/products?page_size=20");
    return (data.products ?? []).map(toProduct);
  },

  async getProduct(productId: string) {
    const data = await paypalFetch(`/v1/catalogs/products/${productId}`);
    return toProduct(data);
  },

  async listSubscriptionPlans(productId?: string) {
    const query = productId ? `?product_id=${productId}` : "";
    const data = await paypalFetch(`/v1/billing/plans${query}`);
    return (data.plans ?? []).map(toPlan);
  },

  async createOrder(items: OrderItem[], currency = "USD") {
    const value = items
      .reduce((acc, item) => acc + Number(item.unit_price.value) * item.quantity, 0)
      .toFixed(2);

    const data = await paypalFetch("/v2/checkout/orders", {
      method: "POST",
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value,
              breakdown: {
                item_total: { currency_code: currency, value },
              },
            },
            items: items.map((i) => ({
              name: i.name,
              quantity: String(i.quantity),
              unit_amount: i.unit_price,
            })),
          },
        ],
      }),
    });

    const approveUrl = (data.links ?? []).find(
      (l: any) => l.rel === "approve" || l.rel === "payer-action"
    )?.href;

    return {
      id: data.id,
      status: data.status,
      items,
      amount: { currency_code: currency, value },
      create_time: data.create_time ?? new Date().toISOString(),
      approve_url: approveUrl,
    } satisfies Order;
  },

  async getOrder(orderId: string) {
    const data = await paypalFetch(`/v2/checkout/orders/${orderId}`);
    const pu = data.purchase_units?.[0];
    return {
      id: data.id,
      status: data.status,
      items: (pu?.items ?? []).map((i: any) => ({
        name: i.name,
        quantity: Number(i.quantity),
        unit_price: i.unit_amount,
      })),
      amount: pu?.amount ?? { currency_code: "USD", value: "0.00" },
      create_time: data.create_time,
    };
  },

  async captureOrder(orderId: string) {
    const data = await paypalFetch(`/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
    });
    const pu = data.purchase_units?.[0];
    return {
      id: data.id,
      status: data.status,
      items: [],
      amount: pu?.payments?.captures?.[0]?.amount ?? {
        currency_code: "USD",
        value: "0.00",
      },
      create_time: data.create_time ?? new Date().toISOString(),
    };
  },

  async createInvoice(recipientEmail: string, items: OrderItem[]) {
    const draft = await paypalFetch("/v2/invoicing/invoices", {
      method: "POST",
      body: JSON.stringify({
        primary_recipients: [
          { billing_info: { email_address: recipientEmail } },
        ],
        items: items.map((i) => ({
          name: i.name,
          quantity: String(i.quantity),
          unit_amount: i.unit_price,
        })),
      }),
    });

    return {
      id: draft.href?.split("/").pop() ?? draft.id,
      status: "DRAFT",
      recipient_email: recipientEmail,
      items,
      total: { currency_code: "USD", value: "0.00" },
    } satisfies Invoice;
  },

  async listInvoices() {
    const data = await paypalFetch("/v2/invoicing/invoices?page_size=20");
    return (data.items ?? []).map((raw: any) => ({
      id: raw.id,
      status: raw.status,
      recipient_email: raw.primary_recipients?.[0]?.billing_info?.email_address ?? "",
      items: [],
      total: raw.amount?.value_breakdown?.gross_amount ?? {
        currency_code: "USD",
        value: "0.00",
      },
    }));
  },
};
