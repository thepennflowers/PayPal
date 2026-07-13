# The Penn Flowers — AI-agent-ready storefront

A floristry storefront built around PayPal's AI/agent tooling: a Next.js
site with a product catalog, subscription plans, an AI chat concierge, a
declarative ("IaC-style") config layer for PayPal catalog resources, and
stubs for PayPal's Store Sync "Agent Ready" cart API. Runs entirely on mock
data out of the box — no PayPal account required to try it.

If you're an AI coding agent working in this repo, read [AGENTS.md](./AGENTS.md) first.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The catalog and subscriptions render from
in-memory mock data (`lib/catalog.ts`); the chat widget works once you add
`OPENAI_API_KEY` to `.env.local` (it still loads without one, just tells
you it needs a key).

## Architecture

```
app/
  page.tsx                        storefront home (catalog + chat)
  api/chat/route.ts                AI concierge (Vercel AI SDK + tool calling)
  api/products, api/orders         small REST helpers
  api/paypal/v1/merchant-cart/*     Store Sync "Agent Ready" cart endpoints (gated)
lib/
  paypal/                          service layer: types, mock.ts, client.ts (live REST), index.ts (switch)
  paypal/admin.ts                  admin REST helpers used only by the IaC apply script
  agent/                           chat system prompt + tool definitions
  agent-commerce/                  Store Sync cart store + JWT auth stub
  catalog.ts                       mock product/subscription data (source of truth for demo mode)
paypal-resources/
  products.yaml, subscription-plans.yaml, webhooks.yaml   declarative PayPal config
scripts/paypal-apply.ts           "plan/apply" tool that pushes the yaml into a real PayPal account
.mcp.json                          registers PayPal's MCP server for coding agents working in this repo
AGENTS.md / CLAUDE.md              business context + operating notes for AI agents
```

## The three PayPal integration layers

**1. Storefront runtime (`lib/paypal`).** Everything the site itself
does — list products, create an order, capture payment, create an
invoice — goes through `lib/paypal/index.ts`, which is either the mock
implementation (`mock.ts`) or the live REST client (`client.ts`), chosen
by `USE_MOCK_DATA`. Nothing else in the app needs to know which one it's
talking to.

**2. AI concierge (`lib/agent`, `app/api/chat`).** The chat widget uses
the [Vercel AI SDK](https://sdk.vercel.ai/) with a small tool set
(`lib/agent/tools.ts`) that wraps the same `lib/paypal` service — so the
chatbot works fully offline in mock mode. Once you're live
(`USE_MOCK_DATA=false`), set `PAYPAL_USE_OFFICIAL_TOOLKIT=true` to swap
in PayPal's own [`@paypal/agent-toolkit`](https://docs.paypal.ai/developer/tools/ai/agent-toolkit-quickstart)
for the fuller tool surface (disputes, shipment tracking, subscriptions,
reporting) instead of hand-rolling more tools.

**3. Declarative catalog config (`paypal-resources/`, `scripts/paypal-apply.ts`).**
Products, subscription plans, and webhooks are defined once in YAML and
pushed into a real PayPal account with a plan/apply flow, similar in
spirit to Terraform:

```bash
npm run paypal:plan    # dry run
npm run paypal:apply   # create/update products, plans, webhooks on PayPal
```

This needs real `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` (sandbox by
default via `PAYPAL_ENVIRONMENT`) — it always talks to the real PayPal
API, independent of `USE_MOCK_DATA`, since its job is configuring your
actual account.

## Going live

1. Get sandbox credentials from the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
2. Set `USE_MOCK_DATA=false`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` in `.env.local`.
3. Run `npm run paypal:plan` then `npm run paypal:apply` to create the
   catalog in your sandbox account.
4. Test the storefront and chatbot against sandbox.
5. Switch `PAYPAL_ENVIRONMENT=PRODUCTION` and re-run apply with
   production credentials when you're ready to go live for real.

## "Agent Ready" cart API (Store Sync)

`app/api/paypal/v1/merchant-cart/*` implements the three endpoints PayPal's
Store Sync program expects (create / update / checkout a cart), so
external AI shopping agents could eventually buy flowers directly. This
program requires PayPal's approval — [apply here](https://www.paypal.com/us/business/ai#form) —
so the endpoints return `501` until you set
`PAYPAL_AGENTIC_COMMERCE_ENABLED=true` with real credentials from PayPal.
See `lib/agent-commerce/auth.ts` for the JWT verification stub.

## Using the PayPal MCP server while developing

`.mcp.json` registers PayPal's MCP server locally via `npx @paypal/mcp`.
Any MCP-aware coding agent (Claude Code, Cowork, Cursor, etc.) opening
this repo can use it directly — e.g. "create an invoice for this
wholesale order" — without you writing any code. See
[docs.paypal.ai/developer/tools/ai/mcp-quickstart](https://docs.paypal.ai/developer/tools/ai/mcp-quickstart)
for the remote/hosted alternative.

## Known gaps / next steps

- `lib/paypal/client.ts` creates a fresh order on cart update instead of
  `PATCH`-ing the existing one — fine for the mock/demo flow, worth
  tightening before a real launch (see comment in `lib/agent-commerce/store.ts`).
- No persistence — carts/orders/invoices in mock mode live in memory and
  reset on server restart. Swap in a real database before production.
- No automated tests yet.
