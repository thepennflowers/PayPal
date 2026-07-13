import type { Money } from "@/lib/paypal/types";

// Mirrors PayPal's Store Sync "Cart API" contract:
// https://docs.paypal.ai/growth/agentic-commerce/store-sync/your-api/set-up-your-api/orders-v2-integration
export type CartItem = {
  variant_id: string;
  quantity: number;
  name?: string;
  unit_amount?: Money;
  item_total?: Money;
};

export type Address = Record<string, unknown>;

export type Cart = {
  id: string;
  status: "CREATED" | "UPDATED" | "COMPLETED";
  validation_status: "VALID" | "INVALID";
  validation_issues: unknown[];
  items: CartItem[];
  shipping_address?: Address;
  billing_address?: Address;
  customer?: { email_address?: string };
  totals: {
    subtotal: Money;
    shipping: Money;
    tax: Money;
    total: Money;
  };
  payment_method?: { type: string; token?: string; payer_id?: string };
  payment_confirmation?: {
    merchant_order_number: string;
    order_review_page: string;
  };
};
