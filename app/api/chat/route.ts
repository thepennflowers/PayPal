import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText, type CoreMessage } from "ai";
import { buildSystemPrompt, getChatTools } from "@/lib/agent/chat";

type IncomingMessage = { role: "user" | "assistant"; content: string };

// Keep request size bounded; older turns rarely matter for a flower order.
const MAX_HISTORY = 20;

// The reply streams as plain text; if an order was created this turn, its
// JSON payload is appended after this ASCII record-separator byte so the
// widget can render the "Pay with PayPal" card. Kept out of the visible
// text stream by the client.
const ORDER_SEPARATOR = "\u001e";

// Ceiling on how long one model turn may run. Neither the OpenAI streaming
// call nor @paypal/agent-toolkit's internal HTTP client (which sets
// `timeout: 0`, i.e. no timeout) bound themselves, so without this a stuck
// tool call or model response hangs the request forever. We deliberately do
// NOT auto-retry on timeout: if the hang happens after a money-moving tool
// call already fired (create_order, create_refund, accept_dispute_claim,
// cancel_subscription, ...), retrying could repeat that side effect.
// Surfacing an error and letting the user decide to retry is safer than a
// silent duplicate charge/refund/cancellation.
const REQUEST_TIMEOUT_MS = 20_000;

// create_order's result shape differs by tool source:
// - mock/custom tools (lib/agent/tools.ts) return our own Order shape
//   directly: { id, status, amount, items, approve_url, create_time }.
// - the official @paypal/agent-toolkit stringifies every tool result
//   (JSON.stringify), and what it stringifies is PayPal's *raw* v2
//   checkout/orders response. That response is PayPal's default MINIMAL
//   representation (the toolkit never sends `Prefer: return=representation`),
//   so purchase_units (amount/items) aren't even present — only id, status,
//   links. We rebuild amount/items from the tool *call*'s own args instead,
//   using the same total formula the toolkit uses to build the request
//   (see qe() in @paypal/agent-toolkit/ai-sdk): sum(itemCost*quantity) +
//   tax + shipping - discount.
function normalizeOrderResult(
  raw: unknown,
  callArgs?: any
): Record<string, unknown> | undefined {
  if (raw == null) return undefined;
  let parsed: any;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;

  if ("amount" in parsed) {
    // Already our own shape.
    return parsed as Record<string, unknown>;
  }

  // Raw PayPal v2 checkout/orders response.
  const purchaseUnit = parsed.purchase_units?.[0];
  const approveUrl = (parsed.links ?? []).find(
    (l: any) => l.rel === "approve" || l.rel === "payer-action"
  )?.href;

  let amount = purchaseUnit?.amount;
  let items = purchaseUnit?.items;
  if (!amount && callArgs?.items) {
    const currencyCode = callArgs.currencyCode ?? "USD";
    const itemTotal = callArgs.items.reduce(
      (sum: number, i: any) => sum + i.itemCost * i.quantity,
      0
    );
    const tax = callArgs.items.reduce(
      (sum: number, i: any) => sum + (i.itemCost * (i.taxPercent ?? 0) * i.quantity) / 100,
      0
    );
    const shipping = callArgs.shippingCost ?? 0;
    const discount = callArgs.discount ?? 0;
    amount = {
      currency_code: currencyCode,
      value: (itemTotal + tax + shipping - discount).toFixed(2),
    };
    items = callArgs.items.map((i: any) => ({
      name: i.name,
      quantity: i.quantity,
      unit_amount: { currency_code: currencyCode, value: i.itemCost.toFixed(2) },
    }));
  }

  return {
    id: parsed.id,
    status: parsed.status,
    amount: amount ?? { currency_code: "USD", value: "0.00" },
    items: (items ?? []).map((i: any) => ({
      name: i.name,
      quantity: Number(i.quantity),
      unit_price: i.unit_amount,
    })),
    approve_url: approveUrl,
    create_time: parsed.create_time ?? new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Preferred: full conversation history. Fallback: single `message`
    // string (kept for the merchant-cart stubs / curl testing).
    const history: IncomingMessage[] = Array.isArray(body.messages)
      ? body.messages.filter(
          (m: IncomingMessage) =>
            (m?.role === "user" || m?.role === "assistant") &&
            typeof m?.content === "string"
        )
      : typeof body.message === "string"
        ? [{ role: "user", content: body.message }]
        : [];

    if (history.length === 0 || history[history.length - 1].role !== "user") {
      return NextResponse.json(
        { error: "Send `messages` ending with a user turn, or `message`" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        response:
          "The AI concierge needs an OPENAI_API_KEY set in .env.local to have a real conversation. " +
          "In the meantime, browse the catalog on the left — everything shown there is live mock data.",
      });
    }

    const [tools, system] = await Promise.all([
      getChatTools(),
      buildSystemPrompt(),
    ]);

    const modelId = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    // Reasoning models (gpt-5*, o*) burn seconds "thinking" before every
    // reply — minimal effort keeps the florist snappy. Non-reasoning
    // models reject the parameter, so only send it when it applies.
    const isReasoningModel = /^(gpt-5|o\d)/.test(modelId);

    // Passed through to streamText so the network call itself can be
    // aborted; the actual bound on the whole turn is the Promise.race
    // deadline below, since a stuck tool call can hang after the HTTP
    // response has already finished (this signal alone can't reach that).
    const abortController = new AbortController();

    const result = streamText({
      model: openai(modelId),
      tools,
      maxSteps: 4,
      system,
      messages: history.slice(-MAX_HISTORY) as CoreMessage[],
      abortSignal: abortController.signal,
      providerOptions: {
        openai: {
          // The AI SDK's docs warn this can make the provider *buffer* tool
          // calls internally instead of streaming them, which risks stalls
          // with larger tool schemas. Sequential tool calls are slightly
          // slower but more reliable.
          parallelToolCalls: false,
          ...(isReasoningModel && { reasoningEffort: "minimal" }),
        },
      },
    });

    const encoder = new TextEncoder();

    async function runTurn(controller: ReadableStreamDefaultController<Uint8Array>) {
      for await (const delta of result.textStream) {
        controller.enqueue(encoder.encode(delta));
      }

      // Text is done — if the model created an order along the way,
      // append it as a trailing metadata frame.
      const steps = await result.steps;
      const orderResult = steps
        .flatMap((step) => {
          const toolResults = step.toolResults as Array<{
            toolCallId: string;
            toolName: string;
            result: unknown;
          }>;
          const toolCalls = step.toolCalls as Array<{
            toolCallId: string;
            args: unknown;
          }>;
          return toolResults
            .filter((t) => t.toolName === "create_order")
            .map((t) =>
              normalizeOrderResult(
                t.result,
                toolCalls.find((c) => c.toolCallId === t.toolCallId)?.args
              )
            );
        })
        .filter((o): o is Record<string, unknown> => o !== undefined)
        .pop();

      if (orderResult) {
        const order = {
          id: orderResult.id,
          status: orderResult.status,
          amount: orderResult.amount,
          items: orderResult.items ?? [],
          approveUrl: orderResult.approve_url,
          createdAt: orderResult.create_time,
        };
        controller.enqueue(
          encoder.encode(ORDER_SEPARATOR + JSON.stringify({ order }))
        );
      }
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let timedOut = false;
        // A hard deadline for the whole turn, independent of whatever
        // streamText/result.steps is doing internally — see the
        // REQUEST_TIMEOUT_MS comment above for why this can't just be an
        // AbortSignal.
        let deadlineTimer: ReturnType<typeof setTimeout>;
        const deadline = new Promise<never>((_, reject) => {
          deadlineTimer = setTimeout(() => {
            timedOut = true;
            abortController.abort();
            reject(new Error("turn exceeded REQUEST_TIMEOUT_MS"));
          }, REQUEST_TIMEOUT_MS);
        });

        const turnPromise = runTurn(controller);
        try {
          await Promise.race([turnPromise, deadline]);
        } catch (error) {
          console.error("[chat] error while streaming:", error);
          const message = timedOut
            ? "Sorry, that took too long to answer. If you just placed an order or asked for a refund/cancellation, please check its status before trying again — it may have gone through."
            : `Sorry, something went wrong: ${error instanceof Error ? error.message : "Unknown error"}`;
          controller.enqueue(encoder.encode(message));
          // We can't truly cancel a stuck turn — if it settles later in the
          // background (e.g. after this controller is closed), swallow it
          // instead of letting it surface as an unhandled rejection.
          turnPromise.catch(() => {});
        } finally {
          clearTimeout(deadlineTimer!);
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[chat] error before streaming started:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
