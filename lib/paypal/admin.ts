// Admin-only PayPal REST helpers used exclusively by scripts/paypal-apply.ts
// (the "IaC" apply script). Kept separate from lib/paypal/client.ts, which
// is the read/order-focused service the storefront runtime uses — these
// functions create/update account-level catalog resources and should never
// be reachable from a user-facing request.

const PAYPAL_ENVIRONMENT = process.env.PAYPAL_ENVIRONMENT ?? "SANDBOX";
const BASE_URL =
  PAYPAL_ENVIRONMENT === "PRODUCTION"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are required to run paypal:apply");
  }

  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    cache: "no-store",
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`OAuth token request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.value;
}

export async function adminFetch(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw Object.assign(new Error(`PayPal API error on ${path}: ${res.status}`), { body });
  }
  return body;
}

export async function findProductByName(name: string) {
  const data = await adminFetch("/v1/catalogs/products?page_size=100&total_required=true");
  return (data.products ?? []).find((p: any) => p.name === name);
}

export async function createOrUpdateProduct(spec: {
  paypal_id?: string;
  name: string;
  description?: string;
  type: string;
  category?: string;
}) {
  // Prefer matching on the PayPal-assigned id: that's what lets a product be
  // *renamed* in place. Matching by name can't, by definition — a renamed
  // product looks like a new one, and the old row would be orphaned forever
  // since the Catalog Products API has no DELETE.
  const existing = spec.paypal_id
    ? await adminFetch(`/v1/catalogs/products/${spec.paypal_id}`)
    : await findProductByName(spec.name);

  if (existing) {
    const ops = [
      { op: "replace", path: "/description", value: spec.description ?? "" },
    ];
    if (existing.name !== spec.name) {
      ops.push({ op: "replace", path: "/name", value: spec.name });
    }
    await adminFetch(`/v1/catalogs/products/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify(ops),
    });
    return {
      id: existing.id,
      created: false,
      renamedFrom: existing.name !== spec.name ? existing.name : undefined,
    };
  }
  // Send only the fields the Catalog API accepts — no caller-supplied `id`
  // (PayPal reserves the PROD- prefix) and no price (catalog has none).
  const created = await adminFetch("/v1/catalogs/products", {
    method: "POST",
    body: JSON.stringify({
      name: spec.name,
      description: spec.description,
      type: spec.type,
      category: spec.category,
    }),
  });
  return { id: created.id, created: true };
}

export async function findPlanByName(name: string) {
  // /v1/billing/plans caps page_size at 20 (unlike catalogs/products).
  const data = await adminFetch("/v1/billing/plans?page_size=20&total_required=true");
  return (data.plans ?? []).find((p: any) => p.name === name);
}

export async function createOrUpdatePlan(spec: {
  paypal_id?: string;
  product_id: string;
  name: string;
  description?: string;
  billing_cycle: { interval_unit: string; interval_count: number };
  price: { currency_code: string; value: string };
}) {
  const existing = spec.paypal_id
    ? await adminFetch(`/v1/billing/plans/${spec.paypal_id}`)
    : await findPlanByName(spec.name);

  if (existing) {
    // Name and description are PATCHable; price is not — it has its own
    // endpoint. A plan's product_id is immutable once created.
    const ops = [
      { op: "replace", path: "/description", value: spec.description ?? "" },
    ];
    if (existing.name !== spec.name) {
      ops.push({ op: "replace", path: "/name", value: spec.name });
    }
    await adminFetch(`/v1/billing/plans/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify(ops),
    });

    const cycle = existing.billing_cycles?.find(
      (c: any) => c.tenure_type === "REGULAR"
    );
    const livePrice = cycle?.pricing_scheme?.fixed_price;
    // PayPal echoes trailing-zero-trimmed values ("42.0"), so compare numerically.
    const changed =
      !livePrice ||
      livePrice.currency_code !== spec.price.currency_code ||
      Number(livePrice.value) !== Number(spec.price.value);

    if (changed) {
      await adminFetch(`/v1/billing/plans/${existing.id}/update-pricing-schemes`, {
        method: "POST",
        body: JSON.stringify({
          pricing_schemes: [
            {
              billing_cycle_sequence: cycle?.sequence ?? 1,
              pricing_scheme: { fixed_price: spec.price },
            },
          ],
        }),
      });
    }

    return {
      id: existing.id,
      created: false,
      renamedFrom: existing.name !== spec.name ? existing.name : undefined,
      repriced: changed,
    };
  }

  const created = await adminFetch("/v1/billing/plans", {
    method: "POST",
    body: JSON.stringify({
      product_id: spec.product_id,
      name: spec.name,
      description: spec.description,
      billing_cycles: [
        {
          frequency: {
            interval_unit: spec.billing_cycle.interval_unit,
            interval_count: spec.billing_cycle.interval_count,
          },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: { fixed_price: spec.price },
        },
      ],
      payment_preferences: { auto_bill_outstanding: true },
    }),
  });
  return { id: created.id, created: true };
}

export async function listWebhooks() {
  const data = await adminFetch("/v1/notifications/webhooks");
  return data.webhooks ?? [];
}

export async function createOrUpdateWebhook(spec: { url: string; event_types: string[] }) {
  const existing = (await listWebhooks()).find((w: any) => w.url === spec.url);
  const eventTypes = spec.event_types.map((name) => ({ name }));

  if (existing) {
    try {
      await adminFetch(`/v1/notifications/webhooks/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify([{ op: "replace", path: "/event_types", value: eventTypes }]),
      });
    } catch (err: any) {
      // PayPal 400s a webhook PATCH that wouldn't change anything. For an
      // idempotent apply that's the success case, not a failure.
      if (err?.body?.name !== "WEBHOOK_PATCH_REQUEST_NO_CHANGE") throw err;
    }
    return { id: existing.id, created: false };
  }

  const created = await adminFetch("/v1/notifications/webhooks", {
    method: "POST",
    body: JSON.stringify({ url: spec.url, event_types: eventTypes }),
  });
  return { id: created.id, created: true };
}
