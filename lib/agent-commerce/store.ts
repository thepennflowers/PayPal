import { paypal } from "@/lib/paypal";
import { MOCK_PRODUCTS } from "@/lib/catalog";
import type { Cart, CartItem } from "./types";

// In-memory implementation of the 3 Store Sync cart endpoints
// (create / update / checkout), following PayPal's documented
// Orders v2 integration pattern:
//   create cart  -> POST /v2/orders
//   update cart  -> PATCH /v2/orders/{id}   (our lib/paypal client doesn't
//                   yet implement PATCH, so we re-create the order with
//                   updated totals — fine for the mock/demo path; swap in
//                   real PATCH support before going live)
//   checkout     -> POST /v2/checkout/orders/{id}/capture
//
// https://docs.paypal.ai/growth/agentic-commerce/store-sync/your-api/set-up-your-api/orders-v2-integration

const carts = new Map<string, Cart>();
let cartSeq = 1;

function priceItems(items: { variant_id: string; quantity: number }[]): CartItem[] {
  return items.map((item) => {
    const product = MOCK_PRODUCTS.find((p) => p.id === item.variant_id);
    const unitValue = Number(product?.price.value ?? "0.00");
    const itemTotal = (unitValue * item.quantity).toFixed(2);
    return {
      variant_id: item.variant_id,
      quantity: item.quantity,
      name: product?.name ?? item.variant_id,
      unit_amount: { currency_code: "USD", value: unitValue.toFixed(2) },
      item_total: { currency_code: "USD", value: itemTotal },
    };
  });
}

function computeTotals(items: CartItem[]) {
  const subtotal = items.reduce((acc, i) => acc + Number(i.item_total?.value ?? 0), 0);
  const shipping = items.length > 0 ? 6.99 : 0;
  const tax = subtotal * 0.0875;
  const total = subtotal + shipping + tax;
  const money = (v: number) => ({ currency_code: "USD", value: v.toFixed(2) });
  return {
    subtotal: money(subtotal),
    shipping: money(shipping),
    tax: money(tax),
    total: money(total),
  };
}

export async function createCart(body: any): Promise<Cart> {
  const items = priceItems(body.items ?? []);
  const totals = computeTotals(items);

  const order = await paypal.createOrder(
    items.map((i) => ({
      name: i.name!,
      quantity: i.quantity,
      unit_price: i.unit_amount!,
    })),
    "USD"
  );

  const id = `CART-${cartSeq++}`;
  const cart: Cart = {
    id,
    status: "CREATED",
    validation_status: "VALID",
    validation_issues: [],
    items,
    shipping_address: body.shipping_address,
    billing_address: body.billing_address,
    customer: body.customer,
    totals,
    payment_method: { type: "PAYPAL", token: order.id },
  };
  carts.set(id, cart);
  return cart;
}

export async function updateCart(id: string, body: any): Promise<Cart | undefined> {
  const existing = carts.get(id);
  if (!existing) return undefined;

  const items = priceItems(body.items ?? []);
  const totals = computeTotals(items);

  // Re-create the linked order with fresh totals (stand-in for a real
  // PATCH /v2/orders/{id} — see file header note).
  const order = await paypal.createOrder(
    items.map((i) => ({ name: i.name!, quantity: i.quantity, unit_price: i.unit_amount! })),
    "USD"
  );

  const updated: Cart = {
    ...existing,
    status: "UPDATED",
    items,
    shipping_address: body.shipping_address ?? existing.shipping_address,
    billing_address: body.billing_address ?? existing.billing_address,
    customer: body.customer ?? existing.customer,
    totals,
    payment_method: { type: "PAYPAL", token: order.id },
  };
  carts.set(id, updated);
  return updated;
}

export async function checkoutCart(id: string, body: any): Promise<Cart | undefined> {
  const existing = carts.get(id);
  if (!existing) return undefined;

  const orderId = body?.payment_method?.token ?? existing.payment_method?.token;
  if (orderId) {
    await paypal.captureOrder(orderId);
  }

  const completed: Cart = {
    ...existing,
    status: "COMPLETED",
    payment_confirmation: {
      merchant_order_number: `PENN-${id}`,
      order_review_page: `https://thepennflowers.example.com/orders/${id}`,
    },
  };
  carts.set(id, completed);
  return completed;
}
