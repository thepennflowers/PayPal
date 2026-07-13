import type { Product, SubscriptionPlan } from "./paypal/types";

// Mock catalog for The Penn Flowers. This is the source of truth for
// local/demo mode. The *same* names/prices are mirrored declaratively in
// paypal-resources/products.yaml and subscription-plans.yaml — that's the
// "IaC" layer that pushes this catalog into a real PayPal account via
// `npm run paypal:apply`. Keep the two in sync when you edit either.

export const MOCK_PRODUCTS: Product[] = [
  {
    id: "PROD-SIGNATURE-ROSE",
    name: "Signature Rose Bouquet",
    description: "A dozen long-stem roses, hand-tied with eucalyptus.",
    type: "PHYSICAL",
    category: "bouquet",
    image_url: "/flowers/signature-rose.jpg",
    price: { currency_code: "USD", value: "68.00" },
  },
  {
    id: "PROD-SEASONAL-MIX",
    name: "Seasonal Wildflower Mix",
    description: "Whatever's freshest this week from our local growers.",
    type: "PHYSICAL",
    category: "bouquet",
    image_url: "/flowers/seasonal-mix.jpg",
    price: { currency_code: "USD", value: "45.00" },
  },
  {
    id: "PROD-PEONY-BLUSH",
    name: "Blush Peony Arrangement",
    description: "Soft pink peonies with ranunculus and spray roses.",
    type: "PHYSICAL",
    category: "bouquet",
    image_url: "/flowers/peony-blush.jpg",
    price: { currency_code: "USD", value: "82.00" },
  },
  {
    id: "PROD-SYMPATHY",
    name: "Sympathy & Remembrance Arrangement",
    description: "White lilies, hydrangea, and soft greenery.",
    type: "PHYSICAL",
    category: "sympathy",
    image_url: "/flowers/sympathy.jpg",
    price: { currency_code: "USD", value: "95.00" },
  },
];

export const MOCK_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "PLAN-WEEKLY-SEASONAL",
    product_id: "PROD-SEASONAL-MIX",
    name: "Weekly Seasonal Bouquet",
    description: "A fresh seasonal bouquet delivered every week.",
    status: "ACTIVE",
    billing_cycle: "WEEK",
    price: { currency_code: "USD", value: "40.00" },
  },
  {
    id: "PLAN-MONTHLY-SIGNATURE",
    product_id: "PROD-SIGNATURE-ROSE",
    name: "Monthly Signature Roses",
    description: "Our signature rose bouquet, once a month.",
    status: "ACTIVE",
    billing_cycle: "MONTH",
    price: { currency_code: "USD", value: "60.00" },
  },
];
