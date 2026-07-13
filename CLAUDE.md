# CLAUDE.md

See [AGENTS.md](./AGENTS.md) — that's the canonical agent-facing doc for
this repo (business context, catalog, env vars, IaC apply script, and how
the PayPal MCP / agent-toolkit integrations are wired up). Kept as a
separate file so non-Claude tools (Cursor, Cline, etc.) that look for
`AGENTS.md` instead of `CLAUDE.md` see the same content with no drift.

This repo's `.mcp.json` already registers the PayPal MCP server, so its
tools (invoices, orders, disputes, ...) should be available to you
directly in this session once you approve the connector.
