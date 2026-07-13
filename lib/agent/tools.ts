import { tool } from "ai";
import { z } from "zod";
import { paypal } from "@/lib/paypal";

// Tool-calling surface for the storefront chatbot. These wrap `paypal`
// (lib/paypal/index.ts), which itself switches between mock and live
// PayPal REST calls based on USE_MOCK_DATA — so the exact same tool
// definitions work in the demo and in production.
//
// This mirrors the shape of PayPal's own @paypal/agent-toolkit tools
// (see docs.paypal.ai/developer/tools/ai/agent-tools-ref). Once you're
// running live against a real PayPal account and want the fuller
// surface (disputes, shipment tracking, reporting, subscriptions),
// swap this file's exports for `new PayPalAgentToolkit(...).getTools()`
// — see lib/agent/chat.ts for the toggle.

export const floristTools = {
  list_products: tool({
    description:
      "List the flower bouquets and arrangements currently for sale.",
    parameters: z.object({}),
    execute: async () => paypal.listProducts(),
  }),

  get_product: tool({
    description: "Get details for one product by its ID.",
    parameters: z.object({ productId: z.string() }),
    execute: async ({ productId }) => paypal.getProduct(productId),
  }),

  list_subscription_plans: tool({
    description:
      "List recurring flower delivery subscription plans, optionally filtered by product.",
    parameters: z.object({
      // Strict tool-calling (OpenAI structured outputs) requires every key
      // to be required — model "omits" a filter by passing null.
      productId: z
        .string()
        .nullable()
        .describe("Product ID to filter by, or null for all plans"),
    }),
    execute: async ({ productId }) =>
      paypal.listSubscriptionPlans(productId ?? undefined),
  }),

  create_order: tool({
    description:
      "Create a PayPal order for one or more items the customer wants to buy. Call this once the customer has confirmed exactly what they want.",
    parameters: z.object({
      items: z.array(
        z.object({
          name: z.string(),
          quantity: z.number().int().positive(),
          unit_price: z.number().positive(),
        })
      ),
      currency: z
        .string()
        .nullable()
        .describe("ISO currency code, or null for USD"),
    }),
    execute: async ({ items, currency }) => {
      const currencyCode = currency ?? "USD";
      return paypal.createOrder(
        items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit_price: {
            currency_code: currencyCode,
            value: i.unit_price.toFixed(2),
          },
        })),
        currencyCode
      );
    },
  }),

  capture_order: tool({
    description:
      "Capture payment for an order the customer has approved, finalizing the sale.",
    parameters: z.object({ orderId: z.string() }),
    execute: async ({ orderId }) => paypal.captureOrder(orderId),
  }),

  get_order: tool({
    description: "Look up the status of an existing order by ID.",
    parameters: z.object({ orderId: z.string() }),
    execute: async ({ orderId }) => paypal.getOrder(orderId),
  }),

  create_invoice: tool({
    description:
      "Create and send an invoice to a customer's email, e.g. for a custom or wholesale florist order.",
    parameters: z.object({
      recipientEmail: z.string().email(),
      items: z.array(
        z.object({
          name: z.string(),
          quantity: z.number().int().positive(),
          unit_price: z.number().positive(),
        })
      ),
    }),
    execute: async ({ recipientEmail, items }) =>
      paypal.createInvoice(
        recipientEmail,
        items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit_price: { currency_code: "USD", value: i.unit_price.toFixed(2) },
        }))
      ),
  }),

  list_invoices: tool({
    description: "List invoices that have been created.",
    parameters: z.object({}),
    execute: async () => paypal.listInvoices(),
  }),
};
