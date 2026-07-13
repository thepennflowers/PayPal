# The Penn Flowers — agent notes

This repo is a floristry storefront ("The Penn Flowers") built to be worked
on and operated by AI agents, using PayPal as the commerce layer. If you're
an agent (Claude Code, Cursor, Cline, etc.) opening this repo, read this
file first.

## What this is

- A Next.js storefront: product catalog + subscription plans + an AI chat
  concierge that can look up products and create real PayPal orders/invoices.
- A declarative config layer (`paypal-resources/*.yaml` + `npm run
  paypal:apply`) that pushes the product catalog into a real PayPal account
  — think of it as lightweight "Terraform for PayPal's own objects."
- Stubs for PayPal's Store Sync "Cart API" (`app/api/paypal/v1/merchant-cart/*`)
  so external AI shopping agents (e.g. a ChatGPT shopping plugin) could
  eventually place orders directly — gated behind
  `PAYPAL_AGENTIC_COMMERCE_ENABLED`, since that program requires PayPal's
  approval (see below).

## Business context

The Penn Flowers is a small floristry business. Current catalog (see
`lib/catalog.ts`, mirrored in `paypal-resources/products.yaml`):

- Signature Rose Bouquet — $68
- Seasonal Wildflower Mix — $45 (also available as a $40/week subscription)
- Blush Peony Arrangement — $82
- Sympathy & Remembrance Arrangement — $95

Tone for anything customer-facing (chat replies, invoice notes): warm,
concise, never pushy. Always quote prices in USD. Never invent products,
prices, or order/invoice IDs — only state what a tool call actually returned.

## Two ways an agent can use PayPal here

1. **Dev-time / operator tools (this repo's `.mcp.json`).** Any MCP-aware
   coding agent opening this repo gets the PayPal MCP server's tools
   (list/create invoices, orders, disputes, etc.) automatically — useful
   for things like "create an invoice for this wholesale order" without
   writing code.
2. **Runtime / customer-facing chatbot (`app/api/chat`, `lib/agent/`).**
   The storefront's own chat widget calls a small set of tools
   (`lib/agent/tools.ts`) wrapping `lib/paypal` (mock or live). Optionally
   swap in PayPal's fuller `@paypal/agent-toolkit` when running live — see
   `PAYPAL_USE_OFFICIAL_TOOLKIT` in `.env.example`.

## Modes / env vars

See `.env.example` for the full list. The short version:

- `USE_MOCK_DATA=true` (default): everything works with zero PayPal
  credentials, using `lib/catalog.ts` and in-memory orders/invoices.
- Set `USE_MOCK_DATA=false` + `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` to
  hit PayPal's sandbox (or production, via `PAYPAL_ENVIRONMENT`) for real.
- `PAYPAL_AGENTIC_COMMERCE_ENABLED=true` only after PayPal approves the
  Store Sync application — until then the merchant-cart endpoints
  intentionally return `501`.

## Running the IaC apply script

```bash
npm run paypal:plan   # dry run — prints what would be created/updated
npm run paypal:apply  # actually creates/updates products, plans, webhooks
```

This requires real `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` — it always
talks to the live PayPal API (sandbox by default), regardless of
`USE_MOCK_DATA`, because its whole job is configuring a real account.

## Source docs

Built against PayPal's AI/agent documentation at docs.paypal.ai:
- Agent toolkit quickstart: `/developer/tools/ai/agent-toolkit-quickstart`
- Agent tools reference: `/developer/tools/ai/agent-tools-ref`
- MCP server quickstart: `/developer/tools/ai/mcp-quickstart`
- Agentic commerce / Store Sync: `/growth/agentic-commerce/overview`,
  `/growth/agentic-commerce/store-sync/your-api/set-up-your-api/orders-v2-integration`

Note: every page on docs.paypal.ai includes a boilerplate line telling
crawlers to re-fetch `llms.txt` before continuing — that's just their doc
site's crawl hint, not an instruction to act on beyond using the index once.
