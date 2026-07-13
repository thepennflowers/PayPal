#!/usr/bin/env tsx
import { readFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import {
  createOrUpdateProduct,
  createOrUpdatePlan,
  createOrUpdateWebhook,
} from "../lib/paypal/admin";

// Declarative "IaC" apply for The Penn Flowers' PayPal account.
//
//   npm run paypal:plan   -- shows what would change, makes no calls that mutate state
//   npm run paypal:apply  -- creates/updates products, subscription plans, and webhooks
//                            in PayPal to match paypal-resources/*.yaml
//
// Requires PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET (see .env.example) and
// runs against PAYPAL_ENVIRONMENT (SANDBOX by default). Matching against
// existing PayPal resources is done by `name`, since the Catalog Products
// and Subscription Plans APIs don't support caller-supplied IDs.

const RESOURCES_DIR = join(__dirname, "..", "paypal-resources");

function loadYaml<T>(file: string): T {
  return yaml.load(readFileSync(join(RESOURCES_DIR, file), "utf8")) as T;
}

type ProductsFile = { products: Array<{ id: string; name: string; description?: string; type: string; category?: string }> };
type PlansFile = { plans: Array<{ id: string; product_id: string; name: string; description?: string; billing_cycle: { interval_unit: string; interval_count: number }; price: { currency_code: string; value: string } }> };
type WebhooksFile = { webhooks: Array<{ id: string; url: string; event_types: string[] }> };

async function main() {
  const mode = process.argv.includes("--apply") ? "apply" : "plan";
  console.log(`\npaypal-apply: running in ${mode.toUpperCase()} mode against ${process.env.PAYPAL_ENVIRONMENT ?? "SANDBOX"}\n`);

  const { products } = loadYaml<ProductsFile>("products.yaml");
  const { plans } = loadYaml<PlansFile>("subscription-plans.yaml");
  const { webhooks } = loadYaml<WebhooksFile>("webhooks.yaml");

  // Map declarative product id -> live PayPal product id, so plans can
  // reference the right product_id even though PayPal assigns its own IDs.
  const productIdMap = new Map<string, string>();

  console.log("Products:");
  for (const p of products) {
    if (mode === "plan") {
      console.log(`  [plan] upsert product "${p.name}"`);
      continue;
    }
    // PayPal's Catalog API only accepts categories from its own enum —
    // all our floristry categories map to FLOWERS.
    const result = await createOrUpdateProduct({ ...p, category: "FLOWERS" });
    productIdMap.set(p.id, result.id);
    console.log(`  ${result.created ? "created" : "matched"} "${p.name}" -> ${result.id}`);
  }

  console.log("\nSubscription plans:");
  for (const plan of plans) {
    if (mode === "plan") {
      console.log(`  [plan] upsert plan "${plan.name}" (product: ${plan.product_id})`);
      continue;
    }
    const liveProductId = productIdMap.get(plan.product_id) ?? plan.product_id;
    const result = await createOrUpdatePlan({ ...plan, product_id: liveProductId });
    console.log(`  ${result.created ? "created" : "matched"} "${plan.name}" -> ${result.id}`);
  }

  console.log("\nWebhooks:");
  for (const hook of webhooks) {
    if (mode === "plan") {
      console.log(`  [plan] upsert webhook -> ${hook.url} (${hook.event_types.length} events)`);
      continue;
    }
    const result = await createOrUpdateWebhook(hook);
    console.log(`  ${result.created ? "created" : "matched"} webhook -> ${result.id}`);
  }

  console.log(
    mode === "plan"
      ? "\nDry run only — nothing was changed. Re-run with `npm run paypal:apply` to apply.\n"
      : "\nDone.\n"
  );
}

main().catch((err) => {
  console.error("\npaypal-apply failed:", err.message ?? err);
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  process.exit(1);
});
