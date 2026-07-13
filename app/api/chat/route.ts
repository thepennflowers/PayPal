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

    const result = streamText({
      model: openai(modelId),
      tools,
      maxSteps: 4,
      system,
      messages: history.slice(-MAX_HISTORY) as CoreMessage[],
      ...(isReasoningModel && {
        providerOptions: { openai: { reasoningEffort: "minimal" } },
      }),
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const delta of result.textStream) {
            controller.enqueue(encoder.encode(delta));
          }

          // Text is done — if the model created an order along the way,
          // append it as a trailing metadata frame.
          const steps = await result.steps;
          const orderResult = steps
            .flatMap(
              (step) =>
                step.toolResults as Array<{ toolName: string; result: unknown }>
            )
            .filter((t) => t.toolName === "create_order")
            .map((t) => t.result as Record<string, unknown>)
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
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          controller.enqueue(
            encoder.encode(`Sorry, something went wrong: ${message}`)
          );
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
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
