import type { Product, SubscriptionPlan } from "./paypal/types";

// Mock catalog for The Penn Flowers. This is the source of truth for
// local/demo mode. The *same* names/prices are mirrored declaratively in
// paypal-resources/products.yaml and subscription-plans.yaml — that's the
// "IaC" layer that pushes this catalog into a real PayPal account via
// `npm run paypal:apply`. Keep the two in sync when you edit either.

export const MOCK_PRODUCTS: Product[] = [
  {
    id: "PROD-BLUSH-ROSE",
    name: "Blush Rose & Baby's Breath",
    description:
      "Five pale pink roses nestled in a cloud of baby's breath, wrapped in white.",
    type: "PHYSICAL",
    category: "bouquet",
    image_url: "/flowers/blush-rose.jpg",
    price: { currency_code: "USD", value: "48.00" },
  },
  {
    id: "PROD-SUNSHINE-SUNFLOWER",
    name: "Sunshine Sunflower Bouquet",
    description:
      "A single bright sunflower with white lisianthus, pink carnations and eucalyptus, in mint wrap.",
    type: "PHYSICAL",
    category: "bouquet",
    image_url: "/flowers/sunflower-mint.jpg",
    price: { currency_code: "USD", value: "58.00" },
  },
  {
    id: "PROD-CORAL-GARDEN",
    name: "Coral Garden Bouquet",
    description:
      "Orange roses with blue hydrangea, chamomile daisies, stock and pink carnations.",
    type: "PHYSICAL",
    category: "bouquet",
    image_url: "/flowers/coral-garden.jpg",
    price: { currency_code: "USD", value: "68.00" },
  },
  {
    id: "PROD-PRESERVED-BASKET",
    name: "Preserved Peach Rose Basket",
    description:
      "Peach roses and ranunculus arranged in a woven basket — preserved, so it lasts. Gift card included.",
    type: "PHYSICAL",
    category: "preserved",
    image_url: "/flowers/preserved-basket.jpg",
    price: { currency_code: "USD", value: "88.00" },
  },
];

export const MOCK_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "PLAN-WEEKLY-SEASONAL",
    product_id: "PROD-CORAL-GARDEN",
    name: "Weekly Seasonal Bouquet",
    description: "A fresh seasonal bouquet delivered every week.",
    status: "ACTIVE",
    billing_cycle: "WEEK",
    image_url: "/flowers/sub-weekly-seasonal.jpg",
    price: { currency_code: "USD", value: "55.00" },
  },
  {
    id: "PLAN-MONTHLY-BLUSH",
    product_id: "PROD-BLUSH-ROSE",
    name: "Monthly Blush Roses",
    description: "Our blush rose bouquet, once a month.",
    status: "ACTIVE",
    billing_cycle: "MONTH",
    image_url: "/flowers/sub-monthly-blush.jpg",
    price: { currency_code: "USD", value: "42.00" },
  },
];
