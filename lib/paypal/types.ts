// Shared types for the PayPal service layer.
// Mirrors the shapes used by PayPal's REST APIs (Catalog Products,
// Subscription Plans, Orders v2, Invoicing v2) closely enough that
// swapping mock -> live requires no changes to calling code.

// App-level policy: how long a created-but-unpaid order stays payable.
// (PayPal's own expiry is ~3h for approval; this is our stricter UX window —
// enforced by the capture route and the chat checkout card's countdown.)
export const ORDER_EXPIRY_MS = 10 * 60 * 1000;

export type Money = {
  currency_code: string;
  value: string;
};

export type Product = {
  id: string;
  name: string;
  description?: string;
  type: "PHYSICAL" | "DIGITAL" | "SERVICE";
  category?: string;
  image_url?: string;
  price: Money;
};

export type SubscriptionPlan = {
  id: string;
  product_id: string;
  name: string;
  description?: string;
  status: "ACTIVE" | "INACTIVE";
  billing_cycle: "WEEK" | "MONTH";
  image_url?: string;
  price: Money;
};

export type OrderItem = {
  name: string;
  quantity: number;
  unit_price: Money;
};

export type Order = {
  id: string;
  status: "CREATED" | "APPROVED" | "COMPLETED" | "VOIDED";
  items: OrderItem[];
  amount: Money;
  create_time: string;
  // PayPal-hosted checkout URL (rel=approve/payer-action link on the
  // Orders v2 response) — where the customer approves the payment.
  approve_url?: string;
};

export type Invoice = {
  id: string;
  status: "DRAFT" | "SENT" | "PAID" | "CANCELLED";
  recipient_email: string;
  items: OrderItem[];
  total: Money;
};

export interface PayPalService {
  listProducts(): Promise<Product[]>;
  getProduct(productId: string): Promise<Product | undefined>;
  listSubscriptionPlans(productId?: string): Promise<SubscriptionPlan[]>;
  createOrder(items: OrderItem[], currency?: string): Promise<Order>;
  getOrder(orderId: string): Promise<Order | undefined>;
  captureOrder(orderId: string): Promise<Order>;
  createInvoice(recipientEmail: string, items: OrderItem[]): Promise<Invoice>;
  listInvoices(): Promise<Invoice[]>;
}
