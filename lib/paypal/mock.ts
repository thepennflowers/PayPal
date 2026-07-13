import type {
  Invoice,
  Order,
  OrderItem,
  PayPalService,
  Product,
  SubscriptionPlan,
} from "./types";
import { MOCK_PRODUCTS, MOCK_SUBSCRIPTION_PLANS } from "../catalog";

// In-memory mock implementation of the PayPalService interface.
// Used when USE_MOCK_DATA=true (the default) so the storefront and
// chatbot work fully offline, with no PayPal credentials required.
// Swap to lib/paypal/client.ts (live REST) by setting USE_MOCK_DATA=false
// and providing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET.

let orderSeq = 1000;
let invoiceSeq = 5000;
const orders = new Map<string, Order>();
const invoices = new Map<string, Invoice>();

function sum(items: OrderItem[], currency: string) {
  const value = items.reduce(
    (acc, item) => acc + Number(item.unit_price.value) * item.quantity,
    0
  );
  return { currency_code: currency, value: value.toFixed(2) };
}

export const mockPayPalService: PayPalService = {
  async listProducts() {
    return MOCK_PRODUCTS;
  },

  async getProduct(productId: string) {
    return MOCK_PRODUCTS.find((p) => p.id === productId);
  },

  async listSubscriptionPlans(productId?: string) {
    return productId
      ? MOCK_SUBSCRIPTION_PLANS.filter((p) => p.product_id === productId)
      : MOCK_SUBSCRIPTION_PLANS;
  },

  async createOrder(items: OrderItem[], currency = "USD") {
    const id = `MOCK-ORDER-${orderSeq++}`;
    const order: Order = {
      id,
      status: "CREATED",
      items,
      amount: sum(items, currency),
      create_time: new Date().toISOString(),
      // Fake but shaped like the real sandbox approve link, so the chat
      // checkout card renders identically in mock mode.
      approve_url: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
    };
    orders.set(id, order);
    return order;
  },

  async getOrder(orderId: string) {
    return orders.get(orderId);
  },

  async captureOrder(orderId: string) {
    const order = orders.get(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    order.status = "COMPLETED";
    orders.set(orderId, order);
    return order;
  },

  async createInvoice(recipientEmail: string, items: OrderItem[]) {
    const id = `MOCK-INV-${invoiceSeq++}`;
    const invoice: Invoice = {
      id,
      status: "SENT",
      recipient_email: recipientEmail,
      items,
      total: sum(items, "USD"),
    };
    invoices.set(id, invoice);
    return invoice;
  },

  async listInvoices() {
    return Array.from(invoices.values());
  },
};
